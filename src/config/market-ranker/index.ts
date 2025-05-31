import { DEFAULT_CONFIG, PRESET_CONFIGS } from "./config";
import { FieldMappings, MarketData, MarketWithScore, TrendingConfig, TrendingWeights } from "./types";


// Utility function to merge configurations
function mergeConfig(userConfig: Partial<TrendingConfig>): TrendingConfig {
    return {
        ...DEFAULT_CONFIG,
        ...userConfig,
        weights: { ...DEFAULT_CONFIG.weights, ...(userConfig.weights || {}) },
        fields: { ...DEFAULT_CONFIG.fields, ...(userConfig.fields || {}) }
    };
}

// Helper function to safely get field value with proper typing
function getFieldValue<T extends keyof MarketData>(
    item: MarketData, 
    fieldName: keyof FieldMappings, 
    fields: FieldMappings
): MarketData[T] | number | boolean {
    const mappedField = fields[fieldName];
    const value = item[mappedField];
    
    // Type-safe default values
    if (value === undefined || value === null) {
        switch (fieldName) {
            case 'last_24hrs':
            case 'updated_recently':
                return false as boolean;
            default:
                return 0 as number;
        }
    }
    
    // @ts-ignore
    return value;
}

// Main function with strict typing
function getTopTrendingMarkets(
    marketsData: MarketData[], 
    config: Partial<TrendingConfig> = {}
): MarketData[] | MarketWithScore[] {
    
    // Merge user config with defaults
    const finalConfig = mergeConfig(config);
    
    // Filter data based on config
    let filteredData: MarketData[] = marketsData;
    
    if (finalConfig.filterField && finalConfig.filterValue !== null) {
        const filterField = finalConfig.fields.filter_field || finalConfig.filterField;
        filteredData = marketsData.filter((item: MarketData) => 
            item[filterField] === finalConfig.filterValue
        );
    }
    
    // Calculate trending scores
    const dataWithScores: MarketWithScore[] = filteredData.map((item: MarketData): MarketWithScore => {
        let trendingScore: number = 0;
        const weights = finalConfig.weights;
        
        // Boolean field scoring
        if (getFieldValue(item, 'last_24hrs', finalConfig.fields) as boolean) {
            trendingScore += weights.last_24hrs;
        }
        
        if (getFieldValue(item, 'updated_recently', finalConfig.fields) as boolean) {
            trendingScore += weights.updated_recently;
        }
        
        // Numeric field scoring
        trendingScore += (getFieldValue(item, 'impressions_per_user', finalConfig.fields) as number) * weights.impressions_per_user;
        trendingScore += (getFieldValue(item, 'impressions', finalConfig.fields) as number) * weights.impressions;
        trendingScore += (getFieldValue(item, 'user_count', finalConfig.fields) as number) * weights.user_count;
        trendingScore += (getFieldValue(item, 'recent_count', finalConfig.fields) as number) * weights.recent_count;
        
        // Age penalty calculation
        const ageHours = getFieldValue(item, 'age_hours', finalConfig.fields) as number;
        const agePenalty = Math.min(
            (ageHours / 24) * weights.age_penalty_factor,
            weights.max_age_penalty
        );
        trendingScore -= agePenalty;
        
        // Ensure score is not negative
        trendingScore = Math.max(0, trendingScore);
        
        return {
            ...item,
            trending_score: trendingScore
        };
    });
    
    // Sort by trending score (highest first)
    const sortedData = dataWithScores.sort((a: MarketWithScore, b: MarketWithScore) => 
        b.trending_score - a.trending_score
    );
    
    // Get top N results
    const topResults = sortedData.slice(0, finalConfig.topCount);
    
    // Handle return fields filtering
    if (finalConfig.returnFields && Array.isArray(finalConfig.returnFields)) {
        return topResults.map((item: MarketWithScore) => {
            const filtered: Partial<MarketWithScore> = {};
            finalConfig.returnFields!.forEach((field: keyof MarketData) => {
                if (item.hasOwnProperty(field)) {
                    (filtered as any)[field] = item[field];
                }
            });
            // Always include trending_score if includeScore is true
            if (finalConfig.includeScore) {
                (filtered as any).trending_score = item.trending_score;
            }
            return filtered as MarketData;
        });
    }
    
    // Return with or without scores based on config
    if (!finalConfig.includeScore) {
        return topResults.map(({ trending_score, ...item }) => item);
    }
    
    return topResults;
}

// Configuration builder functions for better type safety
class TrendingConfigBuilder {
    private config: Partial<TrendingConfig> = {};
    
    filterBy(field: keyof MarketData, value: any): TrendingConfigBuilder {
        this.config.filterField = field;
        this.config.filterValue = value;
        return this;
    }
    
    topCount(count: number): TrendingConfigBuilder {
        this.config.topCount = count;
        return this;
    }
    
    weights(weights: Partial<TrendingWeights>): TrendingConfigBuilder {
        this.config.weights = { ...this.config.weights, ...weights };
        return this;
    }
    
    fields(fields: Partial<FieldMappings>): TrendingConfigBuilder {
        this.config.fields = { ...this.config.fields, ...fields };
        return this;
    }
    
    returnFields(fields: (keyof MarketData)[]): TrendingConfigBuilder {
        this.config.returnFields = fields;
        return this;
    }
    
    includeScore(include: boolean): TrendingConfigBuilder {
        this.config.includeScore = include;
        return this;
    }
    
    build(): Partial<TrendingConfig> {
        return { ...this.config };
    }
}

// Factory function to create config builder
function createConfigBuilder(): TrendingConfigBuilder {
    return new TrendingConfigBuilder();
}

// Export everything
export {
    type MarketData,
    type TrendingConfig,
    type TrendingWeights,
    type FieldMappings,
    type MarketWithScore,
    DEFAULT_CONFIG,
    PRESET_CONFIGS,
    getTopTrendingMarkets,
    createConfigBuilder,
    TrendingConfigBuilder
};

/*
USAGE EXAMPLES:

// Basic usage with default config
const trending = getTopTrendingMarkets(marketsData);

// Using preset configuration
const recentlyActive = getTopTrendingMarkets(marketsData, PRESET_CONFIGS.recentActivity);

// Custom configuration object
const customConfig: Partial<TrendingConfig> = {
    topCount: 10,
    weights: {
        last_24hrs: 100,
        user_count: 20
    },
    returnFields: ['name', 'address', 'trending_score']
};
const custom = getTopTrendingMarkets(marketsData, customConfig);

// Using config builder (more type-safe)
const builderConfig = createConfigBuilder()
    .topCount(8)
    .weights({ last_24hrs: 80, impressions_per_user: 15 })
    .returnFields(['name', 'address', 'user_count', 'trending_score'])
    .filterBy('belongs_to_market', true)
    .build();

const builderResult = getTopTrendingMarkets(marketsData, builderConfig);

// Separate config file example
// configs/trending-configs.ts
export const MARKETING_CONFIGS = {
    hotSpots: {
        topCount: 3,
        weights: {
            last_24hrs: 100,
            recent_count: 20,
            age_penalty_factor: 3
        }
    },
    engagement: {
        weights: {
            impressions_per_user: 30,
            user_count: 10
        }
    }
};
*/