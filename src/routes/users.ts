import express from 'express';
import { Router } from 'express';
import { authenticate } from '../middleware/authenticate';
import { validateSchema } from '../utils/validateSchemaUtils';
import { updateLocationSchema, updateProfileSchema } from '../schemas';
import { asyncHandler } from '../utils/asyncHandlerUtils';
import { updateUserProfile } from '.';
import { BadRequest } from '../utils/responses';
import { collectReverseGeocode } from '../utils/collectReversedGeocode';
import { generalCacheService } from '../utils/cacheUtils';

const router: Router = express.Router();

// Get user profile
router.get('/profile', authenticate(), asyncHandler(async (req, res) => {
    try {
        const { data: profile, error } = await req.client
            .from('profiles')
            .select('*')
            .eq('id', req.user.id)
            .single();

        if (error) throw error;
        res.json(profile);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch profile' });
    }
}));


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

export { router as UsersRouter };
