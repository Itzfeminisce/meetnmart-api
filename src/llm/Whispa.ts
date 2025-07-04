import axios from "axios";
import { UserType } from "../globals";
import { SYSTEM_CAPABILITIES, SystemCapabilities } from "./system-config";
import { DEFAULT_CONFIG, WhispaConfig } from "./whispa-config";

export interface WhispaInput {
    text: string;
    user_id: string;
    user_type: UserType;
    session_id?: string;
    location?: {
        latitude: number;
        longitude: number;
        address?: string;
    };
    context?: {
        recent_orders?: any[];
        preferences?: Record<string, any>;
        current_cart?: any[];
        active_chats?: string[];
        [key: string]: any;
    };
}

export interface WhispaOutput {
    intent: string;
    entities: Record<string, any>;
    response: string;
    confidence: number;
    actions: Array<{
        name: string;
        params: Record<string, any>;
        priority: number;
    }>;
    data_requests: Array<{
        source: string;
        filters: Record<string, any>;
        fields?: string[];
    }>;
    follow_up_questions?: string[];
    session_id: string;
    user_guidance?: {
        suggestions: string[];
        quick_actions: string[];
    };
}

interface LLMProvider {
    process(prompt: string): Promise<string>;
    setSystemPromt(prompt: string): LLMProvider;
}

class OpenAIProvider implements LLMProvider {
    private prompt: string | undefined = undefined;

    constructor(private config: WhispaConfig['llm']) { }
    async process(prompt: string): Promise<string> {
        try {
            const { OpenAI } = await import('openai');
            const openai = new OpenAI({
                apiKey: this.config.api_key,
                timeout: 30000 // 30 second timeout
            });

            const { api_key, provider, model, ...configs } = this.config

            const response = await openai.chat.completions.create({
                model,
                messages: [
                    { role: 'system', content: this.prompt ?? this.getDefaultSystemPromt() },
                    { role: 'user', content: prompt }
                ],
                response_format: { type: "json_object" },
                ...configs
            });

            const content = response.choices?.[0]?.message?.content;

            if (!content) {
                throw new Error('Invalid response format from OpenAI API');
            }

            return content;
        } catch (error) {
            console.error('Error processing OpenAI request:', error);
            throw error;
        }
    }

    public setSystemPromt(prompt: string) {
        this.prompt = prompt
        return this;
    }

    private getDefaultSystemPromt() {
        return `You are Whispa, an intelligent marketplace assistant for MeetnMart.

                CORE IDENTITY:
                - Be conversational, helpful, and proactive
                - Handle ambiguous requests by asking smart follow-up questions

                RESPONSE FORMAT: Always respond with valid JSON only:
                    {
                    "intent": "primary_user_intent",
                    "entities": {"product": "inferred_product", "location": "inferred_location", "quantity": "inferred_quantity"},
                    "response": "conversational_response_to_user",
                    "confidence": 0.85,
                    "actions": [{"name": "search_products", "params": {"product": "inferred_product"}, "priority": 1}],
                    "data_requests": [{"source": "products", "filters": {"category": "inferred_category"}}],
                    "follow_up_questions": ["suggested_follow_up_questions"],
                    "user_guidance": {
                        "suggestions": [eg: "Premium inferred_product sellers near me"],
                        "quick_actions": [eg: "View cart", "Track orders", "My favorites"]
                    }
                    }`;
    }

}


export class Whispa {
    private config: WhispaConfig;
    private capabilities: SystemCapabilities;
    private llm: LLMProvider;
    private sessions: Map<string, any> = new Map();

    constructor(config?: Partial<WhispaConfig>, capabilities?: Partial<SystemCapabilities>) {
        this.config = { ...DEFAULT_CONFIG, ...config };
        this.capabilities = { ...SYSTEM_CAPABILITIES, ...capabilities };
        this.llm = new OpenAIProvider(this.config.llm)
    }

    public getLLM() {
        return this.llm;
    }

    async process(input: WhispaInput): Promise<WhispaOutput> {
        const sessionId = input.session_id || this.generateSessionId();

        try {
            const contextualPrompt = this.buildAdvancedPrompt(input);
            const aiResponse = await this.llm.process(contextualPrompt);
            const result = this.parseAndEnhanceResponse(aiResponse, input, sessionId);

            this.updateSession(sessionId, input, result);
            return result;

        } catch (error) {
            this.log('error', 'Processing failed', error);
            return this.createErrorResponse(sessionId, input);
        }
    }

    private buildAdvancedPrompt(input: WhispaInput): string {
        const session = this.getSession(input.session_id);
        const capabilities = this.getRelevantCapabilities(input.user_type);
        const locationContext = this.buildLocationContext(input.location);

        console.log({ capabilities, locationContext, session });


        return `
                MARKETPLACE CONTEXT:
                - Platform: ${this.config.marketplace.name} (${this.config.marketplace.location})
                - User: ${input.user_type} (ID: ${input.user_id})
                - Location: ${locationContext}

                AVAILABLE ACTIONS:
                ${JSON.stringify(capabilities.actions, null, 2)}

                DATA SOURCES:
                ${JSON.stringify(capabilities.data_sources, null, 2)}

                USER CONTEXT:
                - Recent Orders: ${JSON.stringify(input.context?.recent_orders?.slice(-3) || [])}
                - Preferences: ${JSON.stringify(input.context?.preferences || {})}
                - Session History: ${JSON.stringify(session?.history?.slice(-3) || [])}
                - Current Cart: ${JSON.stringify(input.context?.current_cart || [])}

                CONVERSATION:
                User: "${input.text}"

                INSTRUCTIONS:
                1. Analyze user intent considering their type (${input.user_type})
                2. Extract relevant entities (products, locations, quantities, etc.)
                3. Determine appropriate actions from available capabilities
                4. Request specific data needed from data sources
                5. Provide helpful response
                6. Suggest follow-up questions if needed
                7. Include user guidance for better experience
                `;
    }

    private getRelevantCapabilities(userType: string) {
        const userConfig = this.capabilities.user_management.types[userType];
        const relevantActions: Record<string, any> = {};

        Object.entries(this.capabilities.actions).forEach(([action, config]) => {
            if (config.user_types.includes(userType) &&
                !userConfig.restricted_actions.includes(action)) {
                relevantActions[action] = config;
            }
        });

        return {
            actions: relevantActions,
            data_sources: this.capabilities.data_sources
        };
    }

    private buildLocationContext(location?: WhispaInput['location']): string {
        if (!location) return 'Not provided';

        const { latitude, longitude, address } = location;
        const supportedAreas = this.capabilities.location_services.supported_areas;

        return `${address || 'Unknown address'} (${latitude}, ${longitude})
                Supported Areas: ${supportedAreas.join(', ')}
                Distance Calculation: ${this.capabilities.location_services.distance_calculation ? 'Available' : 'Disabled'}
                Service Radius: ${this.capabilities.location_services.radius_km}km`;
    }

    public parseResponse(input: string): Record<string, any> {
        const clean = input.replace(/```json\n?|\n?```/g, '').trim();
        const parsed = JSON.parse(clean);
        return parsed
    }

    private parseAndEnhanceResponse(response: string, input: WhispaInput, sessionId: string): WhispaOutput {
        try {
            const parsed = this.parseResponse(response)

            // Enhance actions with validation
            const validatedActions = this.validateActions(parsed.actions || [], input.user_type);

            // Enhance data requests with proper filtering
            const enhancedDataRequests = this.enhanceDataRequests(parsed.data_requests || [], input);

            return {
                intent: parsed.intent || 'general_inquiry',
                entities: parsed.entities || {},
                response: parsed.response || 'I can help you with that.',
                confidence: Math.min(Math.max(parsed.confidence || 0.7, 0), 1),
                actions: validatedActions,
                data_requests: enhancedDataRequests,
                follow_up_questions: parsed.follow_up_questions || [],
                user_guidance: parsed.user_guidance || this.generateDefaultGuidance(input.user_type),
                session_id: sessionId
            };
        } catch {
            return this.createErrorResponse(sessionId, input);
        }
    }

    private validateActions(actions: any[], userType: string): WhispaOutput['actions'] {
        const userCapabilities = this.capabilities.user_management.types[userType];

        return actions
            .filter(action => {
                const actionConfig = this.capabilities.actions[action.name];
                return actionConfig &&
                    actionConfig.user_types.includes(userType) &&
                    !userCapabilities.restricted_actions.includes(action.name);
            })
            .map(action => ({
                name: action.name,
                params: action.params || {},
                priority: action.priority || 1
            }));
    }

    private enhanceDataRequests(requests: any[], input: WhispaInput): WhispaOutput['data_requests'] {
        return requests.map(req => {
            const sourceConfig = this.capabilities.data_sources[req.source];
            if (!sourceConfig) return req;

            // Add location-based filtering if applicable
            if (input.location && ['sellers', 'seller_locations', 'products'].includes(req.source)) {
                req.filters = {
                    ...req.filters,
                    near_location: {
                        latitude: input.location.latitude,
                        longitude: input.location.longitude,
                        radius_km: this.capabilities.location_services.radius_km
                    }
                };
            }

            // Add user-specific filtering
            req.filters = {
                ...req.filters,
                user_id: input.user_id
            };

            return req;
        });
    }

    private generateDefaultGuidance(userType: string): WhispaOutput['user_guidance'] {
        const typeConfig = this.capabilities.user_management.types[userType];

        return {
            suggestions: [
                "Find rice sellers near me",
                "Get my favorite seller",
                "What's popular today?"
            ],
            quick_actions: typeConfig.default_actions.slice(0, 4)
        };
    }

    private getSession(sessionId?: string) {
        return sessionId ? this.sessions.get(sessionId) : null;
    }

    private updateSession(sessionId: string, input: WhispaInput, output: WhispaOutput): void {
        const session = this.sessions.get(sessionId) || {
            user_id: input.user_id,
            user_type: input.user_type,
            history: [],
            created: Date.now()
        };

        session.history.push({
            input: input.text,
            intent: output.intent,
            entities: output.entities,
            confidence: output.confidence,
            timestamp: Date.now()
        });

        if (session.history.length > 15) {
            session.history = session.history.slice(-15);
        }

        this.sessions.set(sessionId, session);
    }

    private createErrorResponse(sessionId: string, input: WhispaInput): WhispaOutput {
        return {
            intent: 'error',
            entities: {},
            response: 'Sorry, I had trouble understanding. Can you rephrase that?',
            confidence: 0.1,
            actions: [{ name: 'log_error', params: { error_type: 'processing_failed' }, priority: 1 }],
            data_requests: [],
            session_id: sessionId,
            user_guidance: this.generateDefaultGuidance(input.user_type)
        };
    }

    private generateSessionId(): string {
        return `whispa_meetnmart_${Date.now()}_${Math.random().toString(36).substring(2, 15)}`;
    }

    private log(level: string, message: string, data?: any): void {
        if (this.config.logging.enabled) {
            // @ts-ignore
            console[level as keyof Console](`[Whispa] ${message}`, data || '');
        }
    }

    // Public utilities
    public addCapability(actionName: string, config: any): void {
        this.capabilities.actions[actionName] = config;
    }

    public addDataSource(sourceName: string, config: any): void {
        this.capabilities.data_sources[sourceName] = config;
    }

    public getCapabilities(): SystemCapabilities {
        return this.capabilities;
    }
}