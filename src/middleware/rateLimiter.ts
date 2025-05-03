import rateLimit from 'express-rate-limit';
import { TooManyRequests } from '../utils/responses';

export const createWalletLimiter = rateLimit({
    windowMs: 24 * 60 * 60 * 1000, // 24 hours
    max: 1, // Limit each IP to 1 wallet creation per day
    handler: (_, res) => new TooManyRequests('Too many wallet creation attempts. Please try again later.').send(res)
});

export const transactionLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 10, // Limit each IP to 10 transactions per 15 minutes
    handler: (_, res) => new TooManyRequests('Too many transaction attempts. Please try again later.').send(res)
});

export const subscriptionLimiter = rateLimit({
    windowMs: 60 * 60 * 1000, // 1 hour
    max: 5, // Limit each IP to 5 subscription operations per hour
    handler: (_, res) => new TooManyRequests('Too many subscription attempts. Please try again later.').send(res)
});