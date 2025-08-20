/**
 * Real-Life Market Detection Configurations
 * Each configuration is optimized for specific business scenarios
 */

import { TrendingConfig } from "./types";

export const REALLIFE_CONFIGS: Record<string, Partial<TrendingConfig>> = {

    /**
     * 🔥 VIRAL DISCOVERY CONFIG
     * 
     * Use Case: Social media marketing, influencer partnerships, viral content
     * Goal: Find markets that are exploding right now
     * 
     * Business Scenario:
     * - Marketing team wants to capitalize on trending locations
     * - Influencers looking for hot spots to feature
     * - Event planners seeking buzzing venues
     * - News outlets covering trending places
     */
    viralDiscovery: {
        topCount: 8,
        weights: {
            last_24hrs: 120,           // Massive boost for recent activity
            updated_recently: 80,       // Fresh data is critical
            recent_count: 25,          // Recent engagement matters most
            impressions_per_user: 15,  // High engagement rate important
            user_count: 8,             // Some popularity needed
            impressions: 3,            // Total views less important
            age_penalty_factor: 4,     // Heavily penalize older data
            max_age_penalty: 50        // Strong age penalty
        },
        returnFields: ['name', 'address', 'user_count', 'impressions', 'recent_count', 'last_24hrs', 'trending_score']
    },

    /**
     * 📊 INVESTMENT OPPORTUNITY CONFIG
     * 
     * Use Case: Real estate investment, business expansion, market analysis
     * Goal: Find consistently growing markets with strong fundamentals
     * 
     * Business Scenario:
     * - Real estate investors seeking emerging neighborhoods
     * - Retail chains planning new store locations
     * - Food delivery services expanding coverage
     * - Urban planners analyzing growth patterns
     */
    investmentOpportunity: {
        topCount: 12,
        weights: {
            user_count: 20,            // Strong user base is key
            impressions: 12,           // Sustained interest important
            impressions_per_user: 18,  // Quality engagement matters
            recent_count: 10,          // Steady recent activity
            updated_recently: 15,      // Current data preferred
            last_24hrs: 25,            // Some recency bonus
            age_penalty_factor: 0.3,   // Don't heavily penalize age
            max_age_penalty: 10        // Low age penalty
        },
        returnFields: ['name', 'address', 'user_count', 'impressions', 'impressions_per_user', 'age_hours', 'trending_score']
    },

    /**
     * ⚡ CRISIS RESPONSE CONFIG
     * 
     * Use Case: Emergency services, public safety, crisis management
     * Goal: Identify markets needing immediate attention or experiencing issues
     * 
     * Business Scenario:
     * - Emergency services monitoring crowd situations
     * - Public health tracking unusual activity patterns
     * - Security services identifying potential hotspots
     * - City officials managing public spaces
     */
    crisisResponse: {
        topCount: 15,
        weights: {
            last_24hrs: 150,           // Immediate activity critical
            recent_count: 40,          // Recent spikes very important
            user_count: 30,            // High crowd concentration
            updated_recently: 60,      // Fresh intel essential
            impressions_per_user: 5,   // Engagement less relevant
            impressions: 8,            // Total activity matters
            age_penalty_factor: 6,     // Only recent data matters
            max_age_penalty: 100       // Heavy age penalty
        },
        includeScore: true,
        returnFields: ['name', 'address', 'user_count', 'recent_count', 'last_24hrs', 'updated_recently', 'age_hours', 'trending_score']
    },

    /**
     * 🎯 CUSTOMER ACQUISITION CONFIG
     * 
     * Use Case: Marketing campaigns, customer onboarding, business development
     * Goal: Find markets with high engagement potential for new customer acquisition
     * 
     * Business Scenario:
     * - SaaS companies targeting new user segments
     * - E-commerce platforms expanding to new markets
     * - Service providers seeking engaged communities
     * - Subscription businesses finding active audiences
     */
    customerAcquisition: {
        topCount: 10,
        weights: {
            impressions_per_user: 35,  // High engagement is gold
            user_count: 15,            // Need sufficient market size
            recent_count: 20,          // Active community important
            last_24hrs: 30,            // Recent activity good sign
            updated_recently: 20,      // Current market intel
            impressions: 5,            // Total reach helpful
            age_penalty_factor: 1.5,   // Moderate age consideration
            max_age_penalty: 20        // Reasonable age penalty
        },
        returnFields: ['name', 'address', 'user_count', 'impressions_per_user', 'recent_count', 'last_24hrs', 'trending_score']
    },

    /**
     * 📈 BUSINESS INTELLIGENCE CONFIG
     * 
     * Use Case: Market research, competitive analysis, strategic planning
     * Goal: Comprehensive analysis of market performance and trends
     * 
     * Business Scenario:
     * - Business analysts preparing market reports
     * - Competitors monitoring market share
     * - Consultants advising on market entry
     * - Executives making strategic decisions
     */
    businessIntelligence: {
        topCount: 20,
        weights: {
            impressions: 15,           // Total market size important
            user_count: 18,            // Market reach critical
            impressions_per_user: 12,  // Engagement quality matters
            recent_count: 8,           // Recent trends relevant
            updated_recently: 10,      // Data freshness important
            last_24hrs: 20,            // Current activity significant
            age_penalty_factor: 0.8,   // Balanced age consideration
            max_age_penalty: 15        // Moderate age penalty
        },
        includeScore: true,
        returnFields: null  // Return all fields for comprehensive analysis
    }
};

/**
 * Advanced Configuration Builder for Complex Scenarios
 */
export class ScenarioConfigBuilder {
    private scenarios = REALLIFE_CONFIGS;

    /**
     * Create a hybrid configuration by combining multiple scenarios
     */
    combineScenarios(scenarios: string[], weights: number[] = []): Partial<TrendingConfig> {
        if (scenarios.length === 0) return {};

        // Default equal weights if not provided
        const scenarioWeights = weights.length === scenarios.length
            ? weights
            : Array(scenarios.length).fill(1 / scenarios.length);

        const combinedConfig: Partial<TrendingConfig> = {
            weights: {
                last_24hrs: 0,
                updated_recently: 0,
                impressions_per_user: 0,
                impressions: 0,
                user_count: 0,
                recent_count: 0,
                age_penalty_factor: 0,
                max_age_penalty: 0
            }
        };

        // Weighted combination of scenarios
        scenarios.forEach((scenarioName, index) => {
            const scenario = this.scenarios[scenarioName];
            if (scenario?.weights) {
                const weight = scenarioWeights[index];
                Object.entries(scenario.weights).forEach(([key, value]) => {
                    if (combinedConfig.weights) {
                        (combinedConfig.weights as any)[key] += value * weight;
                    }
                });
            }
        });

        return combinedConfig;
    }

    /**
     * Create time-sensitive configuration based on urgency level
     */
    createTimeBasedConfig(urgencyLevel: 'low' | 'medium' | 'high' | 'critical'): Partial<TrendingConfig> {
        const timeConfigs = {
            low: {
                weights: { age_penalty_factor: 0.2, last_24hrs: 10 }
            },
            medium: {
                weights: { age_penalty_factor: 1, last_24hrs: 30 }
            },
            high: {
                weights: { age_penalty_factor: 2, last_24hrs: 60 }
            },
            critical: {
                weights: { age_penalty_factor: 5, last_24hrs: 100 }
            }
        };

        // @ts-ignore
        return timeConfigs[urgencyLevel];
    }

    /**
     * Create market size specific configuration
     */
    createMarketSizeConfig(targetSize: 'niche' | 'medium' | 'mass'): Partial<TrendingConfig> {
        const sizeConfigs = {
            niche: {
                topCount: 5,
                weights: { impressions_per_user: 25, user_count: 5 }
            },
            medium: {
                topCount: 10,
                weights: { impressions_per_user: 15, user_count: 12 }
            },
            mass: {
                topCount: 15,
                weights: { impressions_per_user: 8, user_count: 20 }
            }
        };
        // @ts-ignore
        return sizeConfigs[targetSize];
    }
}

/**
 * Configuration Usage Examples and Best Practices
 */
export const CONFIG_USAGE_EXAMPLES = {

    // Marketing team finding viral opportunities
    marketingTeam: {
        config: REALLIFE_CONFIGS.viralDiscovery,
        description: "Marketing team identifying viral opportunities for campaign launches",
        expectedOutcome: "Markets with explosive recent growth and high engagement"
    },

    // Investment firm analyzing opportunities
    investmentFirm: {
        config: REALLIFE_CONFIGS.investmentOpportunity,
        description: "Investment firm evaluating long-term market potential",
        expectedOutcome: "Stable, growing markets with strong fundamentals"
    },

    // Emergency response monitoring
    emergencyServices: {
        config: REALLIFE_CONFIGS.crisisResponse,
        description: "Emergency services monitoring for crowd management",
        expectedOutcome: "Markets with sudden activity spikes requiring attention"
    },

    // SaaS customer acquisition
    saasAcquisition: {
        config: REALLIFE_CONFIGS.customerAcquisition,
        description: "SaaS company targeting engaged user communities",
        expectedOutcome: "Highly engaged markets with acquisition potential"
    },

    // Executive business review
    executiveReview: {
        config: REALLIFE_CONFIGS.businessIntelligence,
        description: "Executive team reviewing market performance",
        expectedOutcome: "Comprehensive market analysis with all key metrics"
    }
};

/**
 * Industry-Specific Configuration Templates
 */
export const INDUSTRY_CONFIGS = {

    // Food & Beverage Industry
    foodAndBeverage: {
        ...REALLIFE_CONFIGS.viralDiscovery,
        topCount: 6,
        weights: {
            ...REALLIFE_CONFIGS.viralDiscovery.weights,
            impressions_per_user: 20,  // Food content is highly shareable
            recent_count: 30           // Food trends move fast
        }
    },

    // Real Estate Industry
    realEstate: {
        ...REALLIFE_CONFIGS.investmentOpportunity,
        weights: {
            ...REALLIFE_CONFIGS.investmentOpportunity.weights,
            age_penalty_factor: 0.1,   // Location value is long-term
            user_count: 25             // Population density matters
        }
    },

    // Retail Industry
    retail: {
        topCount: 8,
        weights: {
            user_count: 22,            // Foot traffic is key
            impressions: 15,           // Brand awareness important
            last_24hrs: 40,            // Recent shopping trends
            impressions_per_user: 12,  // Customer engagement
            recent_count: 18,          // Current shopping activity
            updated_recently: 25,      // Fresh market data
            age_penalty_factor: 1.2,   // Moderately time-sensitive
            max_age_penalty: 18
        }
    },

    // Entertainment Industry
    entertainment: {
        ...REALLIFE_CONFIGS.viralDiscovery,
        weights: {
            ...REALLIFE_CONFIGS.viralDiscovery.weights,
            impressions_per_user: 30,  // Viral potential crucial
            last_24hrs: 100           // Entertainment trends are immediate
        }
    }
};
