import { MarketData, TrendingConfig } from "./types";

// Default Configuration
export const DEFAULT_CONFIG: TrendingConfig = {
    // Filter settings
    filterField: 'belongs_to_market',
    filterValue: true,
    topCount: 5,
    
    // Scoring weights
    weights: {
        last_24hrs: 50,
        updated_recently: 30,
        impressions_per_user: 10,
        impressions: 2,
        user_count: 5,
        recent_count: 3,
        age_penalty_factor: 1,
        max_age_penalty: 24
    },
    
    // Field mappings
    fields: {
        last_24hrs: 'last_24hrs',
        updated_recently: 'updated_recently',
        impressions_per_user: 'impressions_per_user',
        impressions: 'impressions',
        user_count: 'user_count',
        recent_count: 'recent_count',
        age_hours: 'age_hours',
        filter_field: 'belongs_to_market'
    },
    
    // Output settings
    includeScore: true,
    returnFields: null
};

// Preset Configurations
export const PRESET_CONFIGS: Record<string, Partial<TrendingConfig>> = {
    recentActivity: {
        weights: {
            last_24hrs: 80,
            updated_recently: 50,
            impressions_per_user: 5,
            impressions: 1,
            user_count: 3,
            recent_count: 10,
            age_penalty_factor: 2,
            max_age_penalty: 24
        }
    },
    
    userEngagement: {
        weights: {
            last_24hrs: 20,
            updated_recently: 10,
            impressions_per_user: 25,
            impressions: 5,
            user_count: 15,
            recent_count: 5,
            age_penalty_factor: 0.5,
            max_age_penalty: 24
        }
    },
    
    balanced: {
        weights: {
            last_24hrs: 40,
            updated_recently: 25,
            impressions_per_user: 8,
            impressions: 3,
            user_count: 6,
            recent_count: 4,
            age_penalty_factor: 1,
            max_age_penalty: 24
        }
    },
    
    top10Minimal: {
        topCount: 10,
        returnFields: ['name', 'address', 'user_count', 'impressions', 'trending_score'] as (keyof MarketData)[]
    }
};
