import express, { Request, Response, RequestHandler, NextFunction } from 'express';
import { Unauthorized } from '../utils/responses';
import { extractTokenFromHeader, verifyToken } from 'src/utils/jwtUtils';
import { logger } from 'src/logger';

interface AuthenticatedRequest {
    id: string;
    name?: string;
}

type UserType = "buyer" | "seller" | "moderator" | "admin"

declare global {
    namespace Express {
        interface Request {
            user?: AuthenticatedRequest;
        }
    }
}
export const authenticate = (allowedRoles?: UserType[]): RequestHandler => {
    return async (req: Request, res: Response, next: NextFunction) => {
        try {
            const token = extractTokenFromHeader(req.headers.authorization);
            if (!token) {
                logger.warn('Authentication failed: No token provided');
                new Unauthorized('Authentication failed: No token provided').send(res);
                return;
            }

            const decoded = await verifyToken(token);


            req.user = {
                id: decoded.userId!,
            };

            next();
        } catch (error) {
            logger.error('Authentication error', error, {
                error: error instanceof Error ? error.message : String(error)
            });
            new Unauthorized('Authentication failed').send(res);
            return;
        }
    };
};