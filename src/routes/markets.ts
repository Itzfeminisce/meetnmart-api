import express from "express"
import { asyncHandler } from "../utils/asyncHandlerUtils"
import { supabaseClient } from "../utils/supabase";
import { createConfigBuilder, getTopTrendingMarkets } from "../config/market-ranker";
import { MARKETING_CONFIGS } from "../config/market-ranker/trending-config";
import { cacheService } from "../utils/cacheUtils";

const router = express.Router()


router.get("/get-available-markets", asyncHandler(async (req) => {

    const { limit = 50, userId } = req.query

    const { data, error } = await supabaseClient.rpc('get_available_markets', {
        p_seller_id: userId,
        p_limit: limit,
    });


    if (error) throw error;

    const by_popularity = getTopTrendingMarkets(data, MARKETING_CONFIGS.popularity as any);
    const by_engagements = getTopTrendingMarkets(data, MARKETING_CONFIGS.engagement as any);

    const results = {
        impressions: data,
        popularity: by_popularity,
        engagements: by_engagements,
    }

    // cacheService.set(`get_available_markets:${limit}`)

    return results

}))

export { router as MarketRouter }