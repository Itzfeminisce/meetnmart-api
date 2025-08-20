import { Router } from 'express';
import { z } from 'zod';
import { authenticate } from '../middleware/authenticate';
import { asyncHandler } from '../utils/asyncHandlerUtils';
import { InternalServerError } from '../utils/responses';
import { createOrSendMessage } from '../functions';

const router = Router();

router.post('/', authenticate(), asyncHandler(async (req) => {
    const { client, user } = req

    const validPayload = z.object({
        to: z.string().min(1, "Recipient ID is required"),
        message: z.string().min(1, "Message content is required"),
        context: z.any().optional() // Context can be any type, but optional
    }).parse(req.body);


    const response = await createOrSendMessage({
        to: validPayload.to,
        message: validPayload.message
    }, client, user.id);

    return response
}))


router.get('/:conversationId', authenticate(), asyncHandler(async (req) => {
    const { client, user } = req
    const { conversationId } = req.params

    // const page = 1
    // const pageSize = 20

    const { data, error } = await client
        .from('messages')
        .select(`
                *,
                sender:profiles (
                id,
                name,
                avatar
                )
            `)
        .eq('conversation_id', conversationId)

    // .order('create', { ascending: false })
    // .range((page - 1) * pageSize, page * pageSize - 1)


    if (error) {
        console.error("Error fetching conversations:", error);
        throw new InternalServerError("Failed to fetch conversations");
    }

    // Format data to match the expected structure
    // sample  { id: 1, text: 'Hello! How are you doing?', sender: 'other', timestamp: '10:30 AM', status: 'read' },
    const formattedMessages = data.map((message: any) => ({
        id: message.id,
        text: message.content,
        sender: message.sender.id === user.id ? 'me' : 'other', // Determine sender based on user ID
        timestamp: new Date(message.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }), // Assuming created_at is in ISO format
        status: message.status || 'read', // Default to 'read' if status is not provided
        type: message.type || 'text', // Default to 'text' if type is not provided
        attachments: message.attachments || [] // Assuming attachments is an array, default to empty array
    }));

    // console.log({ formattedMessages });


    return formattedMessages
}
));

router.get('/', authenticate(), asyncHandler(async (req) => {
    const { client, user } = req

    const page = 1
    const pageSize = 20

    // @ts-ignore
    // const { data, error } = await client
    //     .from('conversations')
    // .select(`
    //     id,
    //     created_at,
    //     updated_at,
    //     user1:profiles!conversations_user1_fkey (
    //     id, name, avatar
    //     ),
    //     user2:profiles!conversations_user2_fkey (
    //     id, name, avatar
    //     ),
    //     last_message:messages!conversations_last_message_id_fkey (
    //     id, content, type, created_at
    //     )
    // `)
    const { data, error } = await client
        .from('conversations')
        .select(`
                id,
                created_at,
                updated_at,
                user1:profiles!conversations_user1_fkey (
                    id, name, avatar
                ),
                user2:profiles!conversations_user2_fkey (
                    id, name, avatar
                ),
                last_message:messages!conversations_last_message_id_fkey (
                    id, content, type, created_at
                ),
                participants:conversation_participants!conversation_participants_conversation_id_fkey (
                    user_id,
                    unread_count,
                    is_typing,
                    last_seen_at,
                    is_pinned
                )
            `)
        .eq('participants.user_id', user.id) // Filter for current user

        .order('updated_at', { ascending: false })
        .range((page - 1) * pageSize, page * pageSize - 1) as unknown as any[]


    if (error) {
        console.error("Error fetching conversations:", error);
        throw new InternalServerError("Failed to fetch conversations");
    }

    const isMe = (participantId: string) => participantId === user.id;

    
    
    const formattedChats = data.map((chat: any) => ({
        avatar: isMe(chat.user2.id) ? chat.user1.avatar : chat.user1.avatar,  // chat.user2?.avatar || chat.user1?.avatar || null,
        id: chat.id,
        name: isMe(chat.user2.id) ? chat.user1?.name : chat.user2?.name,
        participantId: isMe(chat.user2.id) ? chat.user1.id : chat.user2.id,
        lastMessage: chat.last_message?.content || 'No messages yet',
        timestamp: chat.last_message?.created_at || new Date().toISOString(),
        online: false, // Default value, since online does not exist
        typing: false, // Default value, since typing does not exist
        pinned: false, // Default value, since pinned does not exist
        unread: chat.participants?.find((p: any) => p.user_id === user.id)?.unread_count || 0,
    }))
    
    return formattedChats
}
));


export { router as ConversationRouter }