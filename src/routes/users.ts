import express from 'express';
import { Router } from 'express';
import { authenticate } from '../middleware/authenticate';
import { validateSchema } from '../utils/validateSchemaUtils';
import { updateLocationSchema, updateProfileSchema } from '../schemas';
import { asyncHandler } from '../utils/asyncHandlerUtils';
import { updateUserProfile } from '.';
import { BadRequest, InternalServerError } from '../utils/responses';
import { collectReverseGeocode } from '../utils/collectReversedGeocode';
import { generalCacheService } from '../utils/cacheUtils';
import { logger } from '../logger';
import moment from 'moment';
import { z } from 'zod';

const router: Router = express.Router();

// Get user profile
router.get('/profile', authenticate(), asyncHandler(async (req, res) => req.user));



router.patch('/location', authenticate(), asyncHandler(async (req, res) => {
    const parsedData = validateSchema(req, {
        schema: updateLocationSchema,
    });

    const { data: profile, error } = await req.client.from("profiles").select("id,lng,lat,location").eq("id", req.user.id).single();

    if (error) {
        throw new BadRequest("Failed to fetch profile");
    }

    const updates: Record<string, any> = {};

    // If we have coordinates but no location, get location
    if (profile.lat && profile.lng && !profile.location) {
        updates.location = await collectReverseGeocode({
            lng: profile.lng,
            lat: profile.lat
        });
    }

    // If we have new coordinates, update them and get location
    if (parsedData.lat && parsedData.lng) {
        updates.lng = parsedData.lng;
        updates.lat = parsedData.lat;
        updates.location = await collectReverseGeocode({
            lng: parsedData.lng,
            lat: parsedData.lat
        });
    }

    if (Object.keys(updates).length > 0) {
        await updateUserProfile(req.user.id, updates);
    }

    return profile.id;
}));


// Update user profile
router.patch('/', authenticate(), asyncHandler(async (req, res) => {
    const parsedData = validateSchema(req, {
        schema: updateProfileSchema,
    })

    const response = await updateUserProfile(req.user.id, parsedData);

    return response.id
}));

router.get("/notifications", authenticate(), asyncHandler(async (req) => {
    const userId = req.user.id

    const { data, error } = await req.client
        .from('notifications')
        .select(`
        *,
        sender:sender_id (
          name,
          avatar
        )
      `)
        .order("created_at", { ascending: false })
        .eq('recipient_id', userId)

    if (error) {
        logger.error("Failed to fetch notifications", error)
        throw new InternalServerError("Unable to fetch notifications. Please try again")
    }

    const todayStart = moment().startOf('day')
    const weekStart = moment().startOf('week')
    const monthStart = moment().startOf('month')

    let totalUnread = 0
    let todayCount = 0
    let weekCount = 0
    let monthCount = 0

    for (const record of data) {
        const createdAt = moment(record.created_at)

        if (!record.is_read) totalUnread++
        if (createdAt.isAfter(todayStart)) todayCount++
        if (createdAt.isAfter(weekStart)) weekCount++
        if (createdAt.isAfter(monthStart)) monthCount++
    }

    return {
        items: data,
        stats: {
            totalUnread,
            todayCount,
            weekCount,
            monthCount
        }
    }
}))

router.post("/interests", authenticate(), asyncHandler(async (req) => {
    const { user, client } = req;

    const interestSchema = z.object({
        interests: z.array(z.string())
    });

    const { interests } = interestSchema.parse(req.body);

    // 1. Delete interests that are no longer selected
    if (interests.length > 0) {
        const { error } = await client
            .from("user_interests")
            .delete()
            .eq("user_id", user.id)
            .filter("interest_id", "not.in", `(${interests.join(",")})`);
            // .not("interest_id", "in", interests);

        if (error) console.log("[deleteInterest.notIn.interest.Error]", { error });

    } else {
        // If no interests selected, delete all
        const { error } = await client
            .from("user_interests")
            .delete()
            .eq("user_id", user.id);

        if (error) console.log("[deleteInterest.all.Error]", { error });
    }

    // 2. Upsert the new/remaining interests
    const rows = interests.map(interest_id => ({
        user_id: user.id,
        interest_id
    }));

    if (rows.length > 0) {
        const { error } = await client
            .from("user_interests")
            .upsert(rows, {
                onConflict: "user_id,interest_id",
            });
        if (error) throw error;
    }

    return { success: true };
}))
    .get("/interests", authenticate(), asyncHandler(async (req) => {
        const { user, client } = req

        const { data, error } = await client
            .from('categories')
            .select(`
                        id,
                        name,
                        icon,
                        color,
                        popular,
                        description,
                        user_interests!left(user_id, interest_id)
                    `)
            .eq('user_interests.user_id', user.id); // or use `filter`

        if (error) throw new InternalServerError("Failed to retrieve interests")

        const categoriesWithInterest = data.map(({ user_interests, ...cat }) => ({
            ...cat,
            is_interested: Array.isArray(user_interests) && user_interests.length > 0
        }));

        return categoriesWithInterest
    }))



export { router as UsersRouter };
