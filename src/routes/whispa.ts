import express from 'express';
import { asyncHandler } from '../utils/asyncHandlerUtils';
import { Whispa } from '../llm/Whispa';
import { getSupabaseClient } from '../utils/supabase';
import { BadRequest, Unauthorized } from '../utils/responses';
import { authenticate } from '../middleware/authenticate';

const router = express.Router();




// POST /whispa/ai
router.post('/ai', authenticate(), asyncHandler(async (req, res) => {
    const { message } = req.body;

    if (!message) {
        throw new BadRequest("Message is required")
    }
    const user = req.user

    const whispa = new Whispa();


    const {data: recent_visits = []} = await req.client.from("recent_visits").select("market_name,market_address,visited_at").eq("user_id", user.id)
    

    const sampleContext = {
        recent_visits: recent_visits
    }


    const result = await whispa.process({
        text: message,
        user_id: user.id,
        user_type: user.role,
        location: { latitude: user.lat, longitude: user.lng, address: user.location.address },
        context: sampleContext
    });

    console.log({ result });

    return result;

}));

export { router as WhispaRouter };
