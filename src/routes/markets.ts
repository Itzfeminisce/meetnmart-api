import express from "express"
import { asyncHandler } from "../utils/asyncHandlerUtils"
import { getSupabaseClient, supabaseClient } from "../utils/supabase";
import { getTopTrendingMarkets } from "../config/market-ranker";
import { MARKETING_CONFIGS } from "../config/market-ranker/trending-config";
import { authenticate } from "../middleware/authenticate";
import { InternalServerError } from "../utils/responses";
import { eventManager } from "../utils/eventUtils";
import { logger } from "../logger";
import { LocationIQMarketsService } from "../core/locationIQ";

const router = express.Router()


router.get("/get-available-markets", authenticate(), asyncHandler(async (req) => {


    const { limit = 50, userId } = req.query

    const { data, error } = await supabaseClient.rpc('get_available_markets', {
        p_seller_id: userId,
        p_limit: limit,
    });


    if (error) throw error;

    // const by_popularity = getTopTrendingMarkets(data, MARKETING_CONFIGS.popularity as any);
    // const by_engagements = getTopTrendingMarkets(data, MARKETING_CONFIGS.engagement as any);

    // const results = {
    //     impressions: data,
    //     popularity: by_popularity,
    //     engagements: by_engagements,
    // }

    // cacheService.set(`get_available_markets:${limit}`)

    return data

}))
router.get("/get-nearby-sellers", authenticate(), asyncHandler(async (req) => {
    const { market_id, category_id, radius = 100, limit = 50 } = req.query

    const query = {
        p_buyer_id: req.user.id,
        p_category_id: category_id,
        p_market_id: market_id,
        p_radius_km: radius,
        p_products_limit: limit, 
        p_products_offset: 0, 
    }
    let { data, error } = await req.client
        .rpc('get_nearby_seller_v2', query)

    if (error) {
        logger.error("Failed to fetch nearby markets", error, query)
        throw new InternalServerError("Failed to fetch sellers. Please try again.")
    }

    eventManager.emit("notification:notify_non_reachable_sellers_new_buyer_joins", {
        availableSellers: data,
        buyerId: req.user.id,
        market_id, category_id
    })


    return data

}))

export { router as MarketRouter }

// //-----------------------------------------
// import express from "express"
// import { asyncHandler } from "../utils/asyncHandlerUtils"
// import { getSupabaseClient, supabaseClient } from "../utils/supabase";
// import { createConfigBuilder, getTopTrendingMarkets } from "../config/market-ranker";
// import { MARKETING_CONFIGS } from "../config/market-ranker/trending-config";
// import { cacheService } from "../utils/cacheUtils";
// import { InternalServerError } from "../utils/responses";

// const router = express.Router()


// router.get("/get-available-markets", asyncHandler(async (req) => {

//     const { limit = 50, userId } = req.query

//     const { data, error } = await supabaseClient.rpc('get_available_markets', {
//         p_seller_id: userId,
//         p_limit: limit,
//     });


//     if (error) throw error;

//     const by_popularity = getTopTrendingMarkets(data, MARKETING_CONFIGS.popularity as any);
//     const by_engagements = getTopTrendingMarkets(data, MARKETING_CONFIGS.engagement as any);

//     const results = {
//         impressions: data,
//         popularity: by_popularity,
//         engagements: by_engagements,
//     }

//     // cacheService.set(`get_available_markets:${limit}`)

//     return results

// }))
// router.get("/get-nearby-sellers", asyncHandler(async (req) => {
//     const { market_id, category_id, radius = 100, limit = 5 } = req.query
//     const client = await getSupabaseClient(req)
//     const { data: { user } } = await client.auth.getUser()

//     const { data: buyer } = await client.from("profiles").select("id,lat,lng").eq("id", user.id).single()

//     // Generate cache key based on query parameters and buyer location
//     const cacheKey = `nearby_sellers:${market_id}:${category_id}:${radius}:${buyer.lat}:${buyer.lng}`
    
//     // Try to get cached data first
//     const cachedData = await cacheService.get(cacheKey)
//     if (cachedData) {
//         return cachedData
//     }

//     // If no cache hit, fetch from database
//     let { data, error } = await client
//         .rpc('get_nearby_sellers', {
//             p_buyer_id: buyer.id,
//             p_market_id: market_id,
//             p_radius_km: radius,

//             // Optional Fields
//             p_category_id: null, //category_id,
//             p_products_limit: limit,
//             p_products_offset: 0,
//         })

//     if (error) {
//         console.error('Error fetching nearby sellers:', error)
//         throw new InternalServerError("Error fetching nearby sellers")
//     }

//     // Cache the results for 5 minutes
//     await cacheService.set(cacheKey, data, 300)

//     return data
// }))

// export { router as MarketRouter }