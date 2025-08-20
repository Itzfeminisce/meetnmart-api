import express, { NextFunction, Request, Response } from 'express';
import { asyncHandler } from '../utils/asyncHandlerUtils';
import { authenticate } from '../middleware/authenticate';
import { BadRequest, Created, InternalServerError } from '../utils/responses';
import { z } from 'zod';
import { NotificationHandler } from '../core/notification/handler';
import { logger } from '../logger';
import { Notification } from '../core/notification/types';

const router = express.Router();
// In-memory storage for call status (use database in production)
const callStatus = new Map();

// Get call status
router.get('/status/:roomName', asyncHandler(async (req: Request, _: Response, __: NextFunction) => {
  const { roomName } = req.params;
  const status = callStatus.get(roomName) || { active: true, buyerLeft: false, ended: false };

  return {
    active: status.active,
    buyerLeft: status.buyerLeft,
    ended: status.ended
  }
}));

// Mark call as ended
router.post('/end', asyncHandler(async (req, res) => {
  const { roomName } = req.body;

  callStatus.set(roomName, {
    active: false,
    buyerLeft: true,
    ended: true,
    endedAt: new Date()
  });

  return true
}));

// Mark buyer left call
router.post('/buyer-left', asyncHandler(async (req, res) => {
  const { roomName } = req.body;

  const existing = callStatus.get(roomName) || {};
  callStatus.set(roomName, {
    ...existing,
    buyerLeft: true,
    active: false
  });

  return true
}));


router.post("/feedback", authenticate(), asyncHandler(async (req) => {

  const validatedBody = z.object({
    p_seller_id: z.string().uuid(),
    p_rating: z.coerce.number().min(1),
    p_feedback_text: z.string().nullable(),
    p_call_duration: z.string(),
  }).parse(req.body)

  const { error } = await req.client.rpc('submit_call_feedback', validatedBody);

  if (error) {
    logger.error("Failed to create feedback", error, validatedBody)
    throw new InternalServerError("Unable to create feedback. Please try again")
  }

  const notification = new NotificationHandler()

  try {
    // console.log("Broadcasting notification");

    const broadcastResponse = await notification.sendNotification({
      recipient_id: validatedBody.p_seller_id,
      sender_id: req.user.id,
      title: `You've got ${validatedBody.p_rating}-star rating`,
      description: validatedBody.p_feedback_text,
      type: "feedback",
      metadata: {
        duration: validatedBody.p_call_duration,
        rating: validatedBody.p_rating
      }
    })
    // console.log("notification Broadcasted ", broadcastResponse);
  } catch (error) {
    logger.error("Failed to send notification after feedback was submitted", error, validatedBody);
  }

  return `Thank you! Your ${validatedBody.p_rating}-star rating has been submitted.`
}))



export { router as CallsRouter };