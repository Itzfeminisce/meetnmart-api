import express, { Request } from 'express';
import { asyncHandler } from '../utils/asyncHandlerUtils';
import { Whispa } from '../llm/Whispa';
import { BadRequest, InternalServerError, TooManyRequests } from '../utils/responses';
import { authenticate } from '../middleware/authenticate';
import { z } from 'zod';
import { eventManager } from '../utils/eventUtils';
import { feedCreateOrCompleteLimiter, feedInteractionLimiter } from '../middleware/rateLimiter';
import { getEnvVar } from '../utils/env';
import { createLLMContext } from '../utils/helpers';
import { LLMRouter } from '../llm/LLMRouter';
import { NotificationHandler } from '../core/notification/handler';
import { getSocketIO } from '../utils/socketio';
import { CallAction } from '../events';

const router = express.Router();



const getFeedCompletionSchema = () => {
    return z.object({
        type: z.enum(['buyer_request', 'seller_offer', 'delivery_ping']),
        title: z.string(),
        content: z.string(),
        category: z.string(),
        price_range: z.string().nullable(),
        needed_by: z.string().nullable(),
        quantity: z.string().nullable(),
        delivery_preference: z.boolean(),
        location: z.string()
    })
}

const getFeedCompletionSystemPrompt = (options: { categories: string }) => {
    return `You are a marketplace assistant that helps extract structured information from user requests. Your task is to analyze the input text and return a JSON object with the following fields:
 
    - type: The type of request (one of: "buyer_request", "seller_offer", "delivery_ping")
    - title: A concise summary of the request (max 50 characters)
    - content: The original user message
    - category: The inferred product category ID must be one of the given id:name provided in (${options.categories}). Return the ID from the supported categories (e.g. if "uuid:text" is in the list, return "uuid"). Always return "f1f4502f-2331-4b3c-b2f0-99e75f96f8ef" if none is found.
    - price_range: Extract any mentioned price in ₦ format (e.g. "₦5000" or "₦5000-7000") or null if not specified
    - needed_by: Time constraint or deadline in format "before X" or "by X" where X is time/date, or null if not specified
    - quantity: The requested quantity with units (e.g. "1 basket", "2 kg", "5 pieces") or null if not specified
    - delivery_preference: Boolean indicating if delivery is preferred (true if delivery mentioned, false otherwise)
    - location: The specified location or "Not specified" if not mentioned

    Always return a valid JSON object with these fields. If a field's value cannot be determined from the input, use null.
    
    Example input: "I need 1 basket of fresh okra before 5pm. Prefer delivery. I'm in Yaba."
    
    Example output:
    {
      "type": "buyer_request",
      "title": "Looking for fresh okra in Yaba",
      "content": "I need 1 basket of fresh okra before 5pm. Prefer delivery. I'm in Yaba.",
      "category": "produce",
      "price_range": null,
      "needed_by": "before 5pm",
      "quantity": "1 basket",
      "delivery_preference": true,
      "location": "Yaba"
    }`
}


router.post("/feeds/interactions", authenticate(), feedInteractionLimiter, asyncHandler(async (req) => {
    // Define interaction schema with validation
    const interactionSchema = z.object({
        user_id: z.string().uuid().default(req.user.id),
        feed_id: z.string().uuid(),
        author_id: z.string().uuid(),
        type: z.enum(['bookmark', 'share', 'message', 'call', 'delivery', 'view', 'comment']),
        metadata: z.object({
            message: z.string().optional(),
            delivery_address: z.string().optional()
        }).optional().default({})
    });

    // Parse and validate request body
    const { type, ...interaction } = interactionSchema.parse({
        user_id: req.user.id,
        feed_id: req.body.feed_id,
        author_id: req.body.author.id,
        type: req.body.type,
        metadata: {
            message: req.body.metadata?.message,
            delivery_address: req.body.metadata?.delivery_address
        }
    });

    // Attempt to insert interaction
    const { error } = await req.client
        .from("feed_interactions")
        .insert({ type, ...interaction })
        .select()
        .single();

    if (error) {
        // Handle duplicate bookmark entries
        if (error.code === '23505' && type === 'bookmark') {
            const { error: deleteError } = await req.client
                .from("feed_interactions")
                .delete()
                .match({
                    feed_id: interaction.feed_id,
                    user_id: interaction.user_id,
                    type: 'bookmark'
                });

            if (deleteError) {
                console.error('Failed to remove bookmark:', deleteError);
                throw new InternalServerError("Operation Failed", "Unable to remove bookmark");
            }

            return "OK"
        }

        // Handle other database errors
        console.error('Database operation failed:', error);
        throw new InternalServerError("Operation Failed", error.message);
    }

    // const { data, error: notificationError } = await req.client.from("notifications").insert({
    //     type: "interaction",
    //     is_read: false,
    //     priority: "medium",
    //     sender_id: interaction.user_id,
    //     recipient_id: interaction.author_id,
    //     timestamp: new Date().toUTCString(),
    //     title: `You have a new ${type}`,
    //     metadata: {
    //         ...interaction.metadata,
    //         sender: req.body?.author,
    //         type,
    //         feed_id: interaction.feed_id,
    //     }
    // }).select("*").single()

    // if (!notificationError && data) {

    const notification = new NotificationHandler()
    try {
        await notification.sendNotification(
            {
                type: "interaction",
                sender_id: interaction.user_id,
                recipient_id: interaction.author_id,
                title: `You have a new ${type}`,
                metadata: {
                    ...interaction.metadata,
                    sender: req.body?.author,
                    feed_id: interaction.feed_id,
                }
            }
        )
    } catch (error) {
        console.error("Unable to notify recipient with notification data", error);
    }
    //  else {
    //     console.error("Unable to save notification data: ", notificationError)
    // }

    return "OK";
}))


router.post("/feeds/create", authenticate(), asyncHandler(async (req) => {

    const { isCompletionAttempted = false, images = [] } = req.body
    const { client, user } = req;

    const requestCompletionSchema = z.object({
        content: z.string(),
    });


    const fullFeedSchema = z.object({
        content: z.string(),
        images: z.array(z.string()).optional(),
        type: z.enum(["buyer_request", "seller_offer", "delivery_ping"]),
        title: z.string(),
        category: z.string(),
        price_range: z.string().nullable(),
        needed_by: z.string().nullable(),
        quantity: z.string().nullable(),
        delivery_preference: z.boolean(),
        location: z.string().nullable(),
    });


    const createFeed = async (data: z.infer<typeof fullFeedSchema>) => {

        const next24Hrs = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
        const { error } = await client.from("feeds").insert({
            created_by: user.id,
            expires_at: next24Hrs,
            images,
            ...data,
        })
        console.log("[createFeed]", error);

        if (error) throw new InternalServerError("Operation Failed", "Unable to create post. Please try again")
        return data
    }

    if (isCompletionAttempted) {
        return createFeed(fullFeedSchema.parse(req.body))
    }


    try {
        const ai = new Whispa()
        const llm = ai.getLLM()
        const { data: categories } = await req.client.from("categories").select("id,name")

        llm.setSystemPromt(getFeedCompletionSystemPrompt({ categories: categories.map(({ id, name }) => `${id}:${name}`).join(", ") }))

        const response = ai.parseResponse(await llm.process(requestCompletionSchema.parse(req.body).content))

        const payload = getFeedCompletionSchema().parse(response)

        return createFeed(payload)
    } catch (error) {
        console.log({ SOmeError: error });

        if (Array.isArray(images) && images.length > 0) eventManager.emitEvent("cloudinary_upload_error", images)
        throw error
    }
}))

router.post("/feeds/completion", authenticate(), feedCreateOrCompleteLimiter, asyncHandler(async (req) => {
    const bodySchema = z.object({
        content: z.string().min(1, "Query is required")
    })

    const parsedBody = bodySchema.parse(req.body)

    const { data: categories } = await req.client.from("categories").select("id,name")

    const ai = new Whispa()
    const llm = ai.getLLM()
    llm.setSystemPromt(getFeedCompletionSystemPrompt({ categories: categories.map(({ id, name }) => `${id}:${name}`).join(", ") }))

    const response = ai.parseResponse(await llm.process(parsedBody.content))
    return getFeedCompletionSchema().parse(response)
}))



// POST /whispa/ai
router.post('/ai', authenticate(), asyncHandler(async (req, res) => {
    const { message } = req.body;

    if (!message) {
        throw new BadRequest("Message is required")
    }


    const user = req.user
    // const mcpClient = new MCPServer()
    const context = createLLMContext(req);
    const router = new LLMRouter(getEnvVar("OPENAI_API_KEY"), context);
    const response = await router.processUserPrompt(message);
    // const response = await router.processUserPrompt(message, user.id, user.role, {
    //     lat: user.lat,
    //     lng: user.lng
    // });

    console.log({ response });


    return response;

    const whispa = new Whispa();


    const { data: recent_visits = [] } = await req.client.from("recent_visits").select("market_name,market_address,visited_at").eq("user_id", user.id)


    const sampleContext = {
        recent_visits: recent_visits
    }


    try {
        const { data_requests, session_id, ...result } = await whispa.process({
            text: message,
            user_id: user.id,
            user_type: user.role,
            location: { latitude: user.lat, longitude: user.lng, address: user.location.address },
            context: sampleContext
        });
        return result;
    } catch (error) {
        throw new TooManyRequests(error?.message ?? "Our server is busy right now. Please try again in a while")
    }

}));



// {
//     "intent": "find_nearby_sellers",
//     "entities": {
//         "product": null,
//         "location": "Shomolu, Lagos",
//         "quantity": null
//     },
//     "response": "Sure! I can help you find nearby sellers in Shomolu, Lagos. Please hold on a moment while I gather the information for you.",
//     "confidence": 0.85,
//     "actions": [],
//     "follow_up_questions": [
//         "Are you looking for specific products from the sellers?",
//         "Would you like to see sellers rated highly or with specific products?"
//     ],
//     "user_guidance": {
//         "suggestions": [
//             "Check premium sellers near me",
//             "Filter by product category"
//         ],
//         "quick_actions": [
//             "View cart",
//             "Track orders",
//             "My favorites"
//         ]
//     }
// }
export { router as WhispaRouter };
