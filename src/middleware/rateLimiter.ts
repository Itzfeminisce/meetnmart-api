// rateLimitConfig.ts
import rateLimit from "express-rate-limit";
import { TooManyRequests } from "../utils/responses";

export const MINUTE = 60 * 1000;
export const HOUR = 60 * MINUTE;
export const DAY = 24 * HOUR;

export const rateLimitConfig = {
    createWalletLimiter: {
        windowMs: DAY,
        max: 1,
        message: "You can only create one wallet per day.",
    },
    transactionLimiter: {
        windowMs: 15 * MINUTE,
        max: 10,
        message: "Transaction rate limit exceeded. Try again in 15 minutes.",
    },
    subscriptionLimiter: {
        windowMs: HOUR,
        max: 5,
        message: "Subscription rate limit exceeded. Try again in an hour.",
    },
    fileUploadLimiter: {
        windowMs: HOUR,
        max: 20,
        message: "Too many file uploads. Try again in an hour.",
    },
    feedCreateOrCompleteLimiter: {
        windowMs: HOUR,
        max: 5,
        message: "Feed creation/completion rate limit exceeded. Try again in an hour.",
    },
    feedInteractionLimiter: {
        windowMs: HOUR,
        max: 50,
        message: "Too many interactions. Please wait before continuing.",
    },
} as const;



type RateLimiterMap = {
    [K in keyof typeof rateLimitConfig]: ReturnType<typeof rateLimit>
};

const rateLimiters = Object.entries(rateLimitConfig).reduce((acc, [key, config]) => {
    // @ts-ignore
    acc[key as keyof typeof rateLimitConfig] = rateLimit({
        ...config,
        handler(req, res) { throw new TooManyRequests(config.message).send(res) },
        standardHeaders: true,
        legacyHeaders: false,
    });
    return acc;
}, {} as RateLimiterMap);

export const {
    createWalletLimiter, feedCreateOrCompleteLimiter,
    feedInteractionLimiter, fileUploadLimiter, subscriptionLimiter, transactionLimiter
} = rateLimiters
