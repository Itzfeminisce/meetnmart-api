import { McpServer, ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { z } from "zod";
import express from "express";
import { randomUUID } from "node:crypto";
import { getEnvVar } from "../utils/env";
import cors from 'cors';
import { logger } from "../logger";
import OpenAI from "openai";
import { createLLMContext } from "../utils/helpers";
import { ActionContext, ActionHandler, Notification, Order, Product, SupportTicket, User } from "./type";
import { calculateDistance, getRecommendationReasons, isWithinBounds } from "./tools/helpers";
import { notifications, orders, products, tickets, users } from "./tools/data";
import { get_nearby_sellers } from "./tools/get_nearby_sellers";


export class MCPServer {
  private server: McpServer;
  private openai: OpenAI;
  private actions: Map<string, ActionHandler> = new Map();
  private transports: { [sessionId: string]: StreamableHTTPServerTransport } = {};


  private users: Map<string, User> = new Map();
  private products: Map<string, Product> = new Map();
  private orders: Map<string, Order> = new Map();
  private notifications: Map<string, Notification> = new Map();
  private supportTickets: Map<string, SupportTicket> = new Map();

  constructor(private serverUrl: string, private openaiKey: string, private serverPort: number = 4041) {
    this.server = new McpServer({
      name: "MeetnMart",
      version: "1.0.0"
    });

    if (openaiKey) {
      this.openai = new OpenAI({ apiKey: openaiKey });
    }

    this.setupDefaultActions();
    this.setupResources();
    this.setupPrompts();
  }


  listTools() {
    const tools = [...this.actions.values()].map((tool) => ({
      type: "function",
      function: {
        name: tool.name,
        description: tool.description,
        parameters: this.zodToJsonSchema(tool.schema),
      },
    }));

    // console.log({tools: JSON.stringify(tools, undefined, 2)});
    return tools;
  }

  // Add this helper method to convert Zod schemas to JSON Schema
  private zodToJsonSchema(schema: z.ZodObject<any>): any {
    const shape = schema.shape;
    const properties: any = {};
    const required: string[] = [];

    for (const [key, zodType] of Object.entries(shape)) {
      const zodSchema = zodType as any;

      // Basic type mapping
      if (zodSchema._def.typeName === 'ZodString') {
        properties[key] = { type: 'string' };
        if (zodSchema._def.checks?.some((c: any) => c.kind === 'enum')) {
          properties[key].enum = zodSchema._def.values;
        }
      } else if (zodSchema._def.typeName === 'ZodNumber') {
        properties[key] = { type: 'number' };
        if (zodSchema._def.default !== undefined) {
          properties[key].default = zodSchema._def.default();
        }
      } else if (zodSchema._def.typeName === 'ZodBoolean') {
        properties[key] = { type: 'boolean' };
        if (zodSchema._def.default !== undefined) {
          properties[key].default = zodSchema._def.default();
        }
      } else if (zodSchema._def.typeName === 'ZodArray') {
        properties[key] = {
          type: 'array',
          items: { type: 'string' } // Simplified for your use case
        };
      } else if (zodSchema._def.typeName === 'ZodObject') {
        properties[key] = { type: 'object' };
        // Add nested properties if needed
      } else if (zodSchema._def.typeName === 'ZodOptional') {
        // Handle optional fields
        const innerType = zodSchema._def.innerType;
        if (innerType._def.typeName === 'ZodString') {
          properties[key] = { type: 'string' };
        } else if (innerType._def.typeName === 'ZodNumber') {
          properties[key] = { type: 'number' };
        }
        // Don't add to required array for optional fields
        continue;
      } else if (zodSchema._def.typeName === 'ZodEnum') {
        properties[key] = {
          type: 'string',
          enum: zodSchema._def.values
        };
      }

      // Check if field is required (not optional and no default)
      if (zodSchema._def.typeName !== 'ZodOptional' &&
        zodSchema._def.default === undefined) {
        required.push(key);
      }
    }

    return {
      type: 'object',
      properties,
      required
    };
  }

  async callTool(name: string, args: { user: ReturnType<typeof createLLMContext>['user'], dbClient: ReturnType<typeof createLLMContext>['dbClient'] }) {
    const tool = this.actions.get(name);
    if (!tool) {
      throw new Error(`Tool '${name}' not found`);
    }

    try {
      // Create context from args
      const context: ActionContext = {
        dbClient: args.dbClient,
        user: args.user,
        llmAnalyze: this.createLLMAnalyzer()
      };


      // Execute the tool handler
      const result = await tool.handler(args, context);
      return result;
    } catch (error) {
      throw new Error(`Tool execution failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }


  registerAction(action: ActionHandler) {
    this.actions.set(action.name, action);
    const schema = action.schema.extend({
      userId: z.string(),
      userType: z.enum(['seller', 'buyer', 'dispatcher']),
      location: z.object({ lat: z.number(), lng: z.number() })
    })

    this.server.tool(
      action.name,
      action.description,
      schema.shape,
      async (params: z.infer<typeof schema>) => {
        try {

          // Create context from args
          const context: ActionContext = {
            dbClient: params.dbClient,
            user: params.user,
            llmAnalyze: this.createLLMAnalyzer()
          };


          const result = await action.handler(params, context);

          return {
            content: [{
              type: "text",
              text: JSON.stringify(result, null, 2)
            }]
          };
        } catch (error) {
          return {
            content: [{
              type: "text",
              text: `Error: ${error instanceof Error ? error.message : 'Unknown error'}`
            }],
            isError: true
          };
        }
      }
    );
  }

  private setupDefaultActions() {
    // Search products
    this.registerAction({
      name: "search_products",
      description: "Search for products with filters",
      schema: z.object({
        query: z.string().optional(),
        category: z.string().optional(),
        maxDistance: z.number().default(10),
        maxPrice: z.number().optional(),
        minPrice: z.number().optional(),
        sellerId: z.string().optional()
      }),
      handler: async (params, context) => {
        const products = Array.from(this.products.values())
          .filter(p => p.available)
          .filter(p => {
            if (params.category && p.category !== params.category) return false;
            if (params.maxPrice && p.price > params.maxPrice) return false;
            if (params.minPrice && p.price < params.minPrice) return false;
            if (params.sellerId && p.sellerId !== params.sellerId) return false;
            if (params.maxDistance) {
              const distance = calculateDistance({ lat: context.user.lat, lng: context.user.lng }, p.location);
              if (distance > params.maxDistance) return false;
            }
            if (params.query) {
              return p.name.toLowerCase().includes(params.query.toLowerCase()) ||
                p.description?.toLowerCase().includes(params.query.toLowerCase());
            }
            return true;
          })
          .map(p => {
            const seller = this.users.get(p.sellerId);
            return {
              ...p,
              distance: calculateDistance({ lat: context.user.lat, lng: context.user.lng }, p.location),
              seller: seller ? { name: seller.name, rating: seller.rating, verified: seller.verified } : null
            };
          })
          .sort((a, b) => a.distance - b.distance);

        return {
          products,
          count: products.length,
          searchParams: params
        };
      }
    });

    // Get nearby sellers
    this.registerAction({
      name: "get_nearby_sellers",
      description: "Find sellers within specified radius",
      schema: z.object({
        maxDistance: z.number().default(5),
        category: z.string().optional(),
        minRating: z.number().optional()
      }),
      handler: get_nearby_sellers
    });

    // Recommend sellers
    this.registerAction({
      name: "recommend_sellers",
      description: "Get personalized seller recommendations",
      schema: z.object({
        limit: z.number().default(10),
        categories: z.array(z.string()).optional(),
        maxDistance: z.number().default(15)
      }),
      handler: async (params, context) => {
        const userOrders = Array.from(this.orders.values())
          .filter(o => o.buyerId === context.user.id);

        const preferredCategories = params.categories ||
          [...new Set(userOrders.map(o => {
            const product = this.products.get(o.productId);
            return product?.category;
          }).filter(Boolean))];

        const sellers = Array.from(this.users.values())
          .filter(u => u.type === 'seller')
          .map(seller => {
            const distance = calculateDistance({ lat: context.user.lat, lng: context.user.lng }, seller.location);
            const sellerProducts = Array.from(this.products.values())
              .filter(p => p.sellerId === seller.id && p.available);

            let score = 0;
            if (seller.rating) score += seller.rating * 20;
            if (seller.verified) score += 10;
            score += Math.max(0, 20 - distance);

            const sellerCategories = new Set(sellerProducts.map(p => p.category));
            const categoryMatches = preferredCategories.filter((cat: any) => sellerCategories.has(cat)).length;
            score += categoryMatches * 15;

            return {
              ...seller,
              distance,
              productCount: sellerProducts.length,
              categories: [...sellerCategories],
              recommendationScore: score,
              reasons: getRecommendationReasons(seller, distance, categoryMatches, sellerProducts.length)
            };
          })
          .filter(s => s.distance <= params.maxDistance)
          .sort((a, b) => b.recommendationScore - a.recommendationScore)
          .slice(0, params.limit);

        return {
          recommendations: sellers,
          basedOn: {
            userOrderHistory: userOrders.length,
            preferredCategories,
            location: { lat: context.user.lat, lng: context.user.lng }
          }
        };
      }
    });

    // Send notification
    this.registerAction({
      name: "send_notification",
      description: "Send notification to user(s)",
      schema: z.object({
        targetUserId: z.string().optional(),
        targetUserType: z.enum(['seller', 'buyer', 'dispatcher']).optional(),
        type: z.enum(['order', 'message', 'system']).default('message'),
        title: z.string(),
        message: z.string(),
        broadcast: z.boolean().default(false)
      }),
      handler: async (params, context) => {
        const notifications: Notification[] = [];

        if (params.broadcast) {
          const targetUsers = Array.from(this.users.values())
            .filter(u => !params.targetUserType || u.type === params.targetUserType);

          for (const user of targetUsers) {
            const notification: Notification = {
              id: randomUUID(),
              userId: user.id,
              type: params.type,
              title: params.title,
              message: params.message,
              read: false,
              createdAt: new Date()
            };
            this.notifications.set(notification.id, notification);
            notifications.push(notification);
          }
        } else if (params.targetUserId) {
          const notification: Notification = {
            id: randomUUID(),
            userId: params.targetUserId,
            type: params.type,
            title: params.title,
            message: params.message,
            read: false,
            createdAt: new Date()
          };
          this.notifications.set(notification.id, notification);
          notifications.push(notification);
        } else {
          throw new Error('Either targetUserId or broadcast must be specified');
        }

        return {
          sent: notifications.length,
          notifications: notifications.map(n => ({ id: n.id, userId: n.userId, title: n.title }))
        };
      }
    });

    // Create support ticket
    this.registerAction({
      name: "create_support_ticket",
      description: "Create a support ticket",
      schema: z.object({
        subject: z.string(),
        description: z.string(),
        priority: z.enum(['low', 'medium', 'high']).default('medium'),
        category: z.string().optional()
      }),
      handler: async (params, context) => {
        const ticket: SupportTicket = {
          id: randomUUID(),
          userId: context.user.id,
          subject: params.subject,
          description: params.description,
          status: 'open',
          priority: params.priority,
          createdAt: new Date()
        };

        this.supportTickets.set(ticket.id, ticket);

        const notification: Notification = {
          id: randomUUID(),
          userId: context.user.id,
          type: 'system',
          title: 'Support Ticket Created',
          message: `Your support ticket "${params.subject}" has been created. Ticket ID: ${ticket.id}`,
          read: false,
          createdAt: new Date()
        };
        this.notifications.set(notification.id, notification);

        return {
          ticket,
          message: 'Support ticket created successfully. You will receive updates via notifications.'
        };
      }
    });

    // Filter by location
    this.registerAction({
      name: "filter_by_location",
      description: "Filter products/sellers by location criteria",
      schema: z.object({
        type: z.enum(['products', 'sellers']),
        center: z.object({ lat: z.number(), lng: z.number() }).optional(),
        radius: z.number().default(10),
        bounds: z.object({
          north: z.number(),
          south: z.number(),
          east: z.number(),
          west: z.number()
        }).optional()
      }),
      handler: async (params, context) => {
        const center = params.center || { lat: context.user.lat, lng: context.user.lng };

        if (params.type === 'products') {
          const products = Array.from(this.products.values())
            .filter(p => p.available)
            .map(p => ({
              ...p,
              distance: calculateDistance(center, p.location)
            }))
            .filter(p => {
              if (params.bounds) {
                return isWithinBounds(p.location, params.bounds);
              }
              return p.distance <= params.radius;
            })
            .sort((a, b) => a.distance - b.distance);

          return {
            type: 'products',
            items: products,
            count: products.length,
            filter: { center, radius: params.radius, bounds: params.bounds }
          };
        } else {
          const sellers = Array.from(this.users.values())
            .filter(u => u.type === 'seller')
            .map(s => ({
              ...s,
              distance: calculateDistance(center, s.location)
            }))
            .filter(s => {
              if (params.bounds) {
                return isWithinBounds(s.location, params.bounds);
              }
              return s.distance <= params.radius;
            })
            .sort((a, b) => a.distance - b.distance);

          return {
            type: 'sellers',
            items: sellers,
            count: sellers.length,
            filter: { center, radius: params.radius, bounds: params.bounds }
          };
        }
      }
    });
  }

  private setupResources() {
    // User profile resource
    this.server.resource(
      "user-profile",
      new ResourceTemplate("user://{userId}", { list: undefined }),
      async (uri, { userId }) => {
        const user = this.users.get(userId.toString());
        if (!user) throw new Error('User not found');

        return {
          contents: [{
            uri: uri.href,
            text: JSON.stringify(user, null, 2)
          }]
        };
      }
    );

    // Market analytics resource
    this.server.resource(
      "market-analytics",
      "analytics://market",
      async (uri) => {
        const analytics = {
          totalProducts: this.products.size,
          totalOrders: this.orders.size,
          activeUsers: this.users.size,
          topCategories: this.getTopCategories(),
          recentActivity: this.getRecentActivity()
        };

        return {
          contents: [{
            uri: uri.href,
            text: JSON.stringify(analytics, null, 2)
          }]
        };
      }
    );
  }

  private setupPrompts() {
    // Product recommendation prompt
    this.server.prompt(
      "recommend-products",
      "Recommends product based user on preferences",
      {
        userId: z.string(),
        preferences: z.string().optional(),
        budget: z.any()
      },
      ({ userId, preferences, budget }) => ({
        messages: [{
          role: "user",
          content: {
            type: "text",
            text: `Generate personalized product recommendations for user ${userId} with preferences: ${preferences || 'none specified'} and budget: ${budget || 'unlimited'}`
          }
        }]
      })
    );

    // Market analysis prompt
    this.server.prompt(
      "analyze-market",
      { category: z.string().optional() },
      ({ category }) => ({
        messages: [{
          role: "user",
          content: {
            type: "text",
            text: `Analyze market trends${category ? ` for category: ${category}` : ''} and provide insights for sellers and buyers`
          }
        }]
      })
    );
  }

  private getTopCategories() {
    const categories = new Map<string, number>();
    for (const product of this.products.values()) {
      categories.set(product.category, (categories.get(product.category) || 0) + 1);
    }
    return Array.from(categories.entries())
      .sort(([, a], [, b]) => b - a)
      .slice(0, 5);
  }

  private getRecentActivity() {
    return Array.from(this.orders.values())
      .slice(-10)
      .map(order => ({ type: 'order', id: order.id, status: order.status }));
  }

  private createLLMAnalyzer() {
    return async (data: any, prompt: string): Promise<string> => {
      try {
        const response = await this.openai.chat.completions.create({
          model: "gpt-4o-mini",
          messages: [
            {
              role: "system",
              content: "You are an AI analyst. Analyze the provided data and respond to the user's prompt with actionable insights."
            },
            {
              role: "user",
              content: `${prompt}\n\nData to analyze: ${JSON.stringify(data, null, 2)}`
            }
          ]
        });

        return response.choices[0].message.content || "No analysis available";
      } catch (error) {
        return `Analysis error: ${error instanceof Error ? error.message : 'Unknown error'}`;
      }
    };
  }
  // Start server with stdio transport (for CLI usage)
  async startStdio() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.log("MeetnMart MCP Server started with stdio transport");
  }

  // Start HTTP server (for web integration)
  async startHTTP() {
    const app = express();
    app.use(express.json());

    const allowedOrigins = [
      ...(getEnvVar("NODE_ENV") === 'development' ? [
        'http://localhost:3000',
        'http://localhost:3001',
      ] : []),
      process.env.APP_URL,
      'https://dev.meetnmart.com',
      'https://meetnmart.com',
      'https://www.meetnmart.com',
      'https://www.dev.meetnmart.com',
    ];

    app.use(cors({
      origin: function (origin, callback) {
        if (!origin) return callback(null, true);

        if (allowedOrigins.indexOf(origin) !== -1 || allowedOrigins.includes('*')) {
          callback(null, true);
        } else {
          logger.warn(`[MCP] Origin ${origin} not allowed by CORS`);
          callback(null, false);
        }
      },
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept', 'Origin', 'X-Supabase-Refresh', 'X-Resource-Group-Name', 'mcp-session-id'],
      exposedHeaders: ['Content-Length', 'X-Requested-With'],
      maxAge: 86400
    }));

    app.post(this.serverUrl, async (req, res) => {
      const sessionId = req.headers['mcp-session-id'] as string | undefined;
      let transport: StreamableHTTPServerTransport;

      if (sessionId && this.transports[sessionId]) {
        transport = this.transports[sessionId];
      } else if (!sessionId && this.isInitializeRequest(req.body)) {
        transport = new StreamableHTTPServerTransport({
          sessionIdGenerator: () => randomUUID(),
          onsessioninitialized: (sessionId) => {
            this.transports[sessionId] = transport;
          }
        });

        transport.onclose = () => {
          if (transport.sessionId) {
            delete this.transports[transport.sessionId];
          }
        };

        await this.server.connect(transport);
      } else {
        res.status(400).json({
          jsonrpc: '2.0',
          error: { code: -32000, message: 'Bad Request: No valid session ID provided' },
          id: null,
        });
        return;
      }

      await transport.handleRequest(req, res, req.body);
    });

    const handleSessionRequest = async (req: express.Request, res: express.Response) => {
      const sessionId = req.headers['mcp-session-id'] as string | undefined;
      if (!sessionId || !this.transports[sessionId]) {
        res.status(400).send('Invalid or missing session ID');
        return;
      }
      const transport = this.transports[sessionId];
      await transport.handleRequest(req, res);
    };

    app.get(this.serverUrl, handleSessionRequest);
    app.delete(this.serverUrl, handleSessionRequest);

    app.listen(this.serverPort, () => {
      console.log(`MeetnMart MCP Server listening on port ${this.serverPort}`);
    });
  }

  private isInitializeRequest(body: any): boolean {
    return body && body.method === 'initialize';
  }

  // Seed with sample data for testing
  seedSampleData() {
    users.forEach(user => this.users.set(user.id, user));
    products.forEach(p => this.products.set(p.id, p));

    orders.forEach(o => this.orders.set(o.id, o));

    notifications.forEach(n => this.notifications.set(n.id, n));

    tickets.forEach(t => this.supportTickets.set(t.id, t));

    console.log('Sample data seeded successfully');
  }

  // Additional utility methods
  getUser(userId: string): User | undefined {
    return this.users.get(userId);
  }

  getProduct(productId: string): Product | undefined {
    return this.products.get(productId);
  }

  getOrder(orderId: string): Order | undefined {
    return this.orders.get(orderId);
  }

  getUserNotifications(userId: string): Notification[] {
    return Array.from(this.notifications.values())
      .filter(n => n.userId === userId)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }

  getUserSupportTickets(userId: string): SupportTicket[] {
    return Array.from(this.supportTickets.values())
      .filter(t => t.userId === userId)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }
}
