// Types Definition
export interface MarketData {
    id: string;
    place_id: string;
    name: string;
    address: string;
    location: string;
    user_count: number;
    created_at: string;
    updated_at: string;
    impressions: number;
    recent_count: number;
    last_24hrs: boolean;
    impressions_per_user: number;
    age_hours: number;
    updated_recently: boolean;
    belongs_to_market: boolean;

    trending_score?: number;
}

export interface TrendingWeights {
    last_24hrs: number;
    updated_recently: number;
    impressions_per_user: number;
    impressions: number;
    user_count: number;
    recent_count: number;
    age_penalty_factor: number;
    max_age_penalty: number;
}

export interface FieldMappings {
    last_24hrs: keyof MarketData;
    updated_recently: keyof MarketData;
    impressions_per_user: keyof MarketData;
    impressions: keyof MarketData;
    user_count: keyof MarketData;
    recent_count: keyof MarketData;
    age_hours: keyof MarketData;
    filter_field: keyof MarketData;
}

export interface TrendingConfig {
    // Filter settings
    filterField: keyof MarketData | null;
    filterValue: any;
    topCount: number;
    
    // Scoring weights
    weights: TrendingWeights;
    
    // Field mappings
    fields: FieldMappings;
    
    // Output settings
    includeScore: boolean;
    returnFields: (keyof MarketData)[] | null;
}

export interface MarketWithScore extends MarketData {
    trending_score: number;
}