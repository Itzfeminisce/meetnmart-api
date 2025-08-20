import { Router } from 'express';
import { asyncHandler } from '../utils/asyncHandlerUtils';
import { getEnvVar } from '../utils/env';
import { cacheService, geoCacheService, marketPlaceCacheService } from '../utils/cacheUtils';
import { generateCacheKey } from '../core/cacheKeyStrategy';
import { authenticate } from '../middleware/authenticate';
import { GoogleMapsMarketService } from '../core/googleapis/GoogleMapsMarketsService';
import { BadRequest, InternalServerError } from '../utils/responses';
import { eventManager } from '../utils/eventUtils';
import { searchFeeds, searchProducts, searchSellers } from '../functions';

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

router.post('/_gmap', asyncHandler(async (req, res) => {
    const params: SearchParams = req.body;

    const { lat, lng, page = 1, pageSize = 10, query, nearby } = params;

    // Determine cache duration based on search type
    const cacheDuration = nearby ?
        24 * 60 * 60 : // 1 day for nearby searches (locations don't change often)
        12 * 60 * 60;  // 12 hours for global searches (more dynamic)

    // Create cache params using GeoCache's strategy
    const cacheParams = {
        // For nearby searches, use actual coordinates
        // For global searches, use (0,0) as base coordinates
        lat: nearby && lat ? lat : 0,
        lng: nearby && lng ? lng : 0,
        // Use resolution for nearby searches to group similar locations
        resolution: nearby ? 0.01 : undefined, // 0.01 degree resolution (~1km)
        // Use the core cache key generator for search terms
        extraKey: `${generateCacheKey(query || '', {
            location: nearby ? `${lat},${lng}` : undefined
        })}:${page}:${pageSize}:${nearby ? 'nearby' : 'global'}`
    };

    // For text searches, use regular cache
    const results = await geoCacheService.cache(
        cacheParams,
        async () => {
            try {
                const { results: places, nextPageToken } = await searchGooglePlaces(params);
                const markets = await Promise.all(places.map(transformToMarketAnalytics));
                return {
                    markets,
                    nextPageToken,
                }
            } catch (error) {
                console.error({ error });
                return {
                    markets: [],
                    nextPageToken: "",
                }
            }
        },
        cacheDuration
    );

    return results
}));

router.get("/", authenticate(), asyncHandler(async (req) => {
    const { user, client } = req
    const { query, page = 1, per_page = 5, key, id: paginatedKey } = req.query as any;

    const search_radius = 3000 // 3km


    if (!!key) {

        if (page > 1) {
            const from = (page - 1) * per_page;
            const to = from + per_page - 1;
            const searchTerm = query?.trim();

            const args = {
                client,
                user,
                param: {
                    search_term: searchTerm,
                    pagination: { from, to }
                }
            }

            const searchFuncMapping = {
                "SELLER": searchSellers,
                "FEED": searchFeeds,
                "PRODUCT": searchProducts
            }

            const func = searchFuncMapping?.[paginatedKey as keyof typeof searchFuncMapping];
            if (!func) throw new BadRequest("Invalid search pagination key", paginatedKey)

            const { data, count: feedCount } = await func(args)

            const data_results = {
                data,
                meta: {
                    page,
                    per_page,
                    total_pages: Math.ceil(feedCount / per_page),
                    has_next_page: page < Math.ceil(feedCount / per_page),
                    has_prev_page: page > 1,
                    // extended: {}
                },
            };

            // const feedCacheKey = generateCacheKey(`${searchTerm}:${page}`, {
            //     base: "feed_search_result:"
            // });

            // await cacheService.set(feedCacheKey, data_results);

            // const extended = {
            //     type: `${paginatedKey}${data_results.meta.total_pages > 1 ? "s" : ""}`,
            //     id: paginatedKey,
            //     count: data_results.meta.total_pages,
            //     key: feedCacheKey,
            // };

            // data_results.meta.extended = extended

            return data_results
        }
        const cachedResults = await cacheService.get(key)
        return cachedResults
    }


    // Only sellers can perform global market search
    // this helps to onboard more markets so buyers can look up sellers through them

    if (user.role === "buyer") {
        const { data: markets, error } = await client.rpc('search_existing_markets', {
            user_lat: user.lat,
            user_lng: user.lng,
            radius_meters: search_radius,
            search_term: query?.trim() ?? null,     // optional
            page,
            per_page,
        });

        if (error) {
            console.log('[search_existing_markets] Failed when trying to search existing merkets', { error });
            throw new InternalServerError("Search Failed", 'Failed when trying to search existing merkets')
        }

        eventManager.emit("trigger_handle_search_expanded_results", {
            user,
            client,
            params: {
                user_lat: user.lat,
                user_lng: user.lng,
                radius_meters: search_radius,
                search_term: query?.trim() ?? null,
                page,
                per_page,
            }
        })

        const marketCacheKey = generateCacheKey(`${query?.trim()}:${page}`, {
            base: "market_search_result:"
        });

        const response = {
            type: `Market${markets.meta.total_count > 1 ? "s" : ""}`,
            id: "MARKET",
            count: markets.meta.total_count,
            key: marketCacheKey,
        }


        markets.meta.extended = response
        await cacheService.set(marketCacheKey, markets)
        return markets
    }


    const service = new GoogleMapsMarketService({
        apiKey: getEnvVar("GOOGLE_MAP_API_KEY"),
        cacheManager: marketPlaceCacheService,
        timeout: 3000,
        logger: console.log,
    });

    // console.log({query});

    const markets = await service.findMarketsNearby(
        // {lat: user.lat, lng: user.lng},
        { lat: 7.46665, lng: 4.06667 },
        {

            radius: 2500,
            // limit: 100,
            query: 'nepa', //"shoprite",
        },
        {
            width: 400,
            height: 300,
            zoom: 15,
            format: 'png'
        }
    )


    const marketCacheKey = generateCacheKey(`${query?.trim()}:${page}`, {
        base: "market_search_result:"
    });
    const response = {
        type: `Market${markets.length > 1 ? "s" : ""}`,
        id: "MARKET",
        count: markets.length,
        key: marketCacheKey,
    }

    return {
        data: markets,
        meta: response
    }
}))

export { router as SearchRouter };
