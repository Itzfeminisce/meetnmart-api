import express, {NextFunction, Request, Response} from 'express';
import { asyncHandler } from '../utils/asyncHandlerUtils';

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
router.post('/buyer-left', asyncHandler( async (req, res) => {
  const { roomName } = req.body;
  
  const existing = callStatus.get(roomName) || {};
  callStatus.set(roomName, {
    ...existing,
    buyerLeft: true,
    active: false
  });
  
  return true
}));

export {router as CallsRouter};