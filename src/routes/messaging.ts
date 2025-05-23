import express, { NextFunction, Request, Response } from 'express';
import { getNotificationService } from '../utils/notificationUtils';
import { BadRequest, InternalServerError, NotFound, Ok } from '../utils/responses';
import { supabaseClient } from '../utils/supabase';
import { NotificationType } from '../globals';
import { asyncHandler } from '../utils/asyncHandlerUtils';

const router = express.Router();
const notificationService = getNotificationService();

// Middleware to validate auth token

router.post('/token', asyncHandler(async (req: Request, res: Response) => {
    const { token, device_type, device_info, user_id } = req.body;

    const { error } = await supabaseClient.from('fcm_tokens').insert({
        token,
        device_type,
        device_info,
        user_id,
        is_valid: true,
    });


    // console.log("#tokenError",  { error });
    

    // if (error) {
    //     throw new InternalServerError("Failed to store token")
    // }
    
    return "Ok"
}));

router.delete('/token/:token', asyncHandler(async (req: Request, res: Response) => {
    const { token } = req.params;

    const { error } = await supabaseClient.from('fcm_tokens').delete().eq('token', token);

    if (error) {
       throw new InternalServerError("Failed to delete token")
    }
    return "OK"
}));

/**
 * @route POST /api/notify
 * @desc Send a notification to a user
 */
router.post('/notify', asyncHandler(async (req: Request, res: Response) => {
        const {
            userId,
            type,
            title,
            body,
            params = {}
        } = req.body;

        if (!userId || !type || !title || !body) { 
            throw new BadRequest("Missing required fields: userId, type, title, and body are required")
        }

        // Create notification data
        const data = notificationService.createNotificationData(
            type as NotificationType,
            { title, body, ...params }
        );

        // Send notification
        const result = await notificationService.notifyUser(userId, data);

        if (!result || !result.success) { 
            throw new NotFound("No valid FCM token found for user")
        }
        return "Ok"
}));


/**
 * @route POST /api/notify/call
 * @desc Send a call notification with accept/reject buttons
 */
router.post('/notify/call', asyncHandler(async (req: Request, res: Response) => {
        const {
            userId,
            callId,
            callerName,
            icon,
            redirectUrl
        } = req.body;

        if (!userId || !callId || !callerName) {
            throw new BadRequest("Missing required fields: userId, callId, and callerName are required")
        }

        // Create call notification data
        const data = notificationService.createNotificationData('call', {
            title: 'Incoming Call',
            body: `${callerName} would like to speak with you`,
            callId,
            icon,
            redirectUrl: redirectUrl || `/call/${callId}`
        });


        // Send notification
        const result = await notificationService.notifyUser(userId, data, 'high');

        console.log("[createNotificationData#result]", { result });

        if (!result || !result.success) {
            throw new NotFound("No valid FCM token found for user")
        }

        return "Ok"
}));

export { router as MessagingRouter };
