// @ts-nocheck
import { TrendingConfig } from "./types";

export const MARKETING_CONFIGS: Record<string, TrendingConfig> = {
    popularity: {
        filterField: "recent_count",
        filterValue: false,
        returnFields: null,
        topCount: 3,

        weights: {
            recent_count: 20,
            age_penalty_factor: 3,
            last_24hrs: 10,
        },

    },
    engagement: {
        filterField: "user_count",
        filterValue: false,
        returnFields: null,
        topCount: 5,

        weights: {
            user_count: 30,
            recent_count: 10
        }
    },
};