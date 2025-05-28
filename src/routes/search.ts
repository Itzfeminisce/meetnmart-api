import { Router } from 'express';
import { asyncHandler } from '../utils/asyncHandlerUtils';
import { getEnvVar } from '../utils/env';
import { geoCacheService } from '../utils/cacheUtils';

const router = Router();

export type MarketWithAnalytics = {
    id: string;
    place_id: string;
    name: string;
    address: string;
    location: string;
    user_count: number | null;
    created_at: string;
    updated_at: string;
    impressions: number | null;
    recent_count: number;
    last_24hrs: boolean;
    impressions_per_user: number;
    age_hours: number;
    updated_recently: boolean;
};

interface SearchParams {
    query?: string;
    nearby?: boolean;
    lat?: number;
    lng?: number;
    page?: number;
    pageSize?: number;
}

interface GooglePlaceResult {
    place_id: string;
    name: string;
    formatted_address?: string;
    vicinity?: string;
    geometry?: {
        location: {
            lat: number;
            lng: number;
        };
    };
    photos?: Array<{
        photo_reference: string;
        width: number;
        height: number;
    }>;
}

async function searchGooglePlaces(params: SearchParams): Promise<{
    results: GooglePlaceResult[];
    nextPageToken?: string;
}> {
    const { query, nearby, lat, lng } = params;

    if ((!query || query.length < 2) && !nearby) {
        return { results: [] };
    }

    const endpoint = nearby
        ? 'https://maps.googleapis.com/maps/api/place/nearbysearch/json'
        : 'https://maps.googleapis.com/maps/api/place/textsearch/json';

    const searchParams = new URLSearchParams();

    if (nearby && lat && lng) {
        searchParams.append('location', `${lat},${lng}`);
        searchParams.append('radius', '5000');
        searchParams.append('type', 'supermarket|market|grocery_or_supermarket|store|shopping_mall');
    } else {
        searchParams.append('query', `${query} market, nigeria`);
    }

    searchParams.append('key', getEnvVar("GOOGLE_MAP_API_KEY"));

    const response = await fetch(`${endpoint}?${searchParams.toString()}`);
    const data = await response.json() as any;

    if (!['OK', 'ZERO_RESULTS'].includes(data.status)) {
        throw new Error(`Google Maps API error: ${data.status}`);
    }

    return {
        results: data.results || [],
        nextPageToken: data.next_page_token
    };
}

async function transformToMarketAnalytics(place: GooglePlaceResult): Promise<MarketWithAnalytics> {
    const now = new Date();
    return {
        id: place.place_id,
        place_id: place.place_id,
        name: place.name,
        address: place.formatted_address || place.vicinity || '',
        location: place.geometry?.location
            ? `(${place.geometry.location.lat},${place.geometry.location.lng})`
            : '',
        user_count: 0, // This should be fetched from your database
        created_at: now.toISOString(),
        updated_at: now.toISOString(),
        impressions: 0,
        recent_count: 0,
        last_24hrs: false,
        impressions_per_user: 0,
        age_hours: 0,
        updated_recently: true
    };
}

router.post('/', asyncHandler(async (req, res) => {
    const params: SearchParams = req.body;
    const {nearby, lat, lng, page = 1, pageSize = 10 } = params;

    return {
        markets: [],
        nextPageToken: null,
        cached: false
    };

    // For text searches, use regular cache
    return await geoCacheService.cache(
        { lat, lng, extraKey: `page:${page}:${pageSize}` },
        async () => {
            const { results: places, nextPageToken } = await searchGooglePlaces(params);
            const markets =  Promise.all(places.map(transformToMarketAnalytics));
            return {
                markets,
                nextPageToken,
                cached: false
            }
        }
    );
}));

export {router as SearchRouter};
