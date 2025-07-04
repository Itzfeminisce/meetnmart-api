import express, { Request, Response, RequestHandler, NextFunction } from 'express';
import { Unauthorized } from '../utils/responses';
import { logger } from '../logger';
import { getSupabaseClient } from '../utils/supabase';
import { UserType } from '../globals';
import { getSocketIO } from '../utils/socketio';
import { cacheService } from '../utils/cacheUtils';



export const authenticate = (allowedRoles?: UserType[]): RequestHandler => {
    return async (req: Request, res: Response, next: NextFunction) => {
        try {

            const client = await getSupabaseClient(req)
            const { data: { user } } = await client.auth.getUser()
            const { data: profile, error } = await client.from("profiles").select("*").eq("id", user.id).single()
            const { data: user_type } = await client.from("user_roles").select("role").eq("user_id", user.id).single()

            if (!user || !profile || error) {
                throw new Unauthorized("Unable to retrieve user data");
            }


            req.user = {
                ...profile,
                ...user,
                role: user_type?.role ?? "unknown"
            };

            req.client = client


            next();
        } catch (error) {
            logger.error('Authentication error', error, {
                error: error instanceof Error ? error.message : String(error)
            });
            new Unauthorized('Authentication failed').send(res);
            return;
        }
    }
};