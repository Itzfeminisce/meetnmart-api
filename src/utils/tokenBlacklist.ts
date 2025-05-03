import { logger } from '../logger';
import { cacheService } from './cacheUtils';

export class TokenBlacklist {
    /**
     * Adds a token to the blacklist
     * @param token The token to blacklist
     * @param expiresIn Time in seconds until the token expires
     */
    static async add(token: string, expiresIn: number): Promise<void> {
        try {
            // Store the token in Redis with its original expiration
            await cacheService.set(
                token,
                'blacklisted',
                expiresIn
            );
            logger.info('Token blacklisted successfully');
        } catch (error) {
            logger.error('Failed to blacklist token:', error);
            throw new Error('Failed to blacklist token');
        }
    }

    /**
     * Checks if a token is blacklisted
     * @param token The token to check
     * @returns boolean indicating if token is blacklisted
     */
    static async isBlacklisted(token: string): Promise<boolean> {
        try {
            const exists = await cacheService.get(token);
            return exists === 'blacklisted';
        } catch (error) {
            logger.error('Failed to check token blacklist:', error);
            // Fail secure: if we can't check the blacklist, assume token is invalid
            return true;
        }
    }

    /**
     * Blacklists all tokens for a specific user
     * @param userId The user ID whose tokens should be blacklisted
     * @param tokens Array of tokens to blacklist
     */
    static async blacklistUserTokens(userId: string, tokens: string[]): Promise<void> {
        try {
            // Create a multi command to execute all operations atomically
            const multi = await cacheService.multi();

            if (!multi) {
                logger.warn('Cache service does not support multi');
                return; // If multi is not supported, do nothing
            }


            for (const token of tokens) {
                // Store each token with user ID reference
                multi.set(`user:${userId}:${token}`, 'blacklisted');
            }

            await multi.exec();
            logger.info(`All tokens blacklisted for user: ${userId}`);
        } catch (error) {
            logger.error('Failed to blacklist user tokens:', error);
            throw new Error('Failed to blacklist user tokens');
        }
    }
} 