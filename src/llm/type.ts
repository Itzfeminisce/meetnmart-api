import { z } from "zod";
import { createLLMContext } from "../utils/helpers";

// Types for MeetnMartexport
export interface User {
    id: string;
    type: 'seller' | 'buyer' | 'dispatcher';
    location: { lat: number; lng: number };
    name: string;
    phone?: string;
    rating?: number;
    verified?: boolean;
}

export interface Product {
    id: string;
    sellerId: string;
    name: string;
    price: number;
    location: { lat: number; lng: number };
    category: string;
    available: boolean;
    description?: string;
    images?: string[];
}

export interface Order {
    id: string;
    buyerId: string;
    sellerId: string;
    productId: string;
    status: 'pending' | 'confirmed' | 'dispatched' | 'delivered';
    dispatcherId?: string;
    createdAt: Date;
}

export interface Notification {
    id: string;
    userId: string;
    type: 'order' | 'message' | 'system';
    title: string;
    message: string;
    read: boolean;
    createdAt: Date;
}

export interface SupportTicket {
    id: string;
    userId: string;
    subject: string;
    description: string;
    status: 'open' | 'in-progress' | 'resolved' | 'closed';
    priority: 'low' | 'medium' | 'high';
    createdAt: Date;
}

export interface ActionHandler {
    name: string;
    description: string;
    schema: z.ZodObject<any>;
    handler: (params: any, context: ActionContext) => Promise<any>;
}

export interface ActionContext {
    user: ReturnType<typeof createLLMContext>['user'];
    dbClient: ReturnType<typeof createLLMContext>['dbClient'];
    llmAnalyze?: (data: any, prompt: string) => Promise<string>;
}