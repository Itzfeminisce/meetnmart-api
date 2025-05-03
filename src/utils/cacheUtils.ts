import Redis, { ChainableCommander } from 'ioredis';
import { logger } from 'src/logger';

type CacheOptions = {
    type: 'redis' | 'memory';
    ttl?: number;
    checkPeriod?: number;
    redis?: {
        host: string;
        port: number;
        password?: string;
    };
};

export interface ICacheService {
    get<T>(key: string): Promise<T | null>;
    set(key: string, value: any, ttl?: number): Promise<void>;
    del(key: string): Promise<void>;
    flush(): Promise<void>;
    multi(): Promise<ChainableCommander | null>;
    getAllKeys(): Promise<string[]>;
}

class RedisCacheService implements ICacheService {
    private client: Redis;

    constructor(options: CacheOptions) {
        this.client = new Redis({
            host: options.redis?.host || 'localhost',
            port: options.redis?.port || 6379,
            password: options.redis?.password,
            retryStrategy(times: any) {
                const delay = Math.min(times * 50, 2000);
                return delay;
            },
            maxRetriesPerRequest: 3
        });

        this.client.on('connect', () => {
            logger.info('Redis connection establiched successfully');
        });
        this.client.on('error', (error: any) => {
            logger.error('Redis connection error', error, {});
        });
    }

    async get<T>(key: string): Promise<T | null> {
        try {
            // Check if the key contains a wildcard pattern
            if (key.includes('*') || key.includes('?')) {
                // Get all keys matching the pattern
                const keys = await this.client.keys(key);
                
                if (keys.length === 0) {
                    return null;
                }
                
                // If only one key matches, return its value
                if (keys.length === 1) {
                    const data = await this.client.get(keys[0]);
                    return data ? JSON.parse(data) : null;
                }
                
                // If multiple keys match, return a map of key-value pairs
                const resultMap: Record<string, any> = {};
                
                // Get all values in a single pipeline
                const pipeline = this.client.pipeline();
                keys.forEach(k => pipeline.get(k));
                
                const results = await pipeline.exec();
                if (!results) {
                    return null;
                }
                
                // Process results
                results.forEach((result, index) => {
                    if (result && result[0] === null && result[1]) {
                        try {
                            const value = JSON.parse(result[1] as string);
                            resultMap[keys[index]] = value;
                        } catch (e) {
                            logger.error('Error parsing cached value', e, { key: keys[index] });
                        }
                    }
                });
                
                return resultMap as unknown as T;
            }
            
            // Original behavior for exact key match
            const data = await this.client.get(key);
            return data ? JSON.parse(data) : null;
        } catch (error) {
            logger.error('Redis get error', error, { key });
            return null;
        }
    }

    async set(key: string, value: any, ttl?: number): Promise<void> {
        try {
            const serializedValue = JSON.stringify(value);
            if (ttl) {
                await this.client.setex(key, ttl, serializedValue);
            } else {
                await this.client.set(key, serializedValue);
            }
        } catch (error) {
            logger.error('Redis set error', error, { key });
        }
    }

    async del(key: string): Promise<void> {
        try {
            if (key.includes('*')) {
                // Handle wildcard pattern
                let cursor = '0';
                const keysToDelete: string[] = [];

                do {
                    const reply = await new Promise<[cursor: string, elements: string[]] | undefined>((resolve, reject) => {
                        this.client.scan(
                            cursor,
                            'MATCH', key,
                            'COUNT', '100',
                            (err, result) => err ? reject(err) : resolve(result)
                        );
                    });

                    if(!reply){
                        logger.warn("[Redis] DEL -> reply is undefined. Returning...", reply)
                        return;
                    }
                    cursor = reply[0]; // First element is the new cursor
                    keysToDelete.push(...reply[1]); // Second element is the array of keys
                } while (cursor !== '0');

                if (keysToDelete.length > 0) {
                    // Delete in batches to avoid overwhelming Redis
                    const batchSize = 100;
                    for (let i = 0; i < keysToDelete.length; i += batchSize) {
                        const batch = keysToDelete.slice(i, i + batchSize);
                        await this.client.del(batch);
                    }
                }
            } else {
                // Original behavior for exact key match
                await this.client.del(key);
            }
        } catch (error) {
            logger.error('Redis delete error', error, { error, key });
        }
    }

    async flush(): Promise<void> {
        try {
            await this.client.flushall();
        } catch (error) {
            logger.error('Redis flush error', error, { error });
        }
    }

    async multi(): Promise<any> {
        return this.client.multi();
    }

    async getAllKeys(): Promise<string[]> {
        return this.client.keys('*');
    }
}


// Factory function to create cache service
export function createCacheService(options: CacheOptions): ICacheService {
    const cacheType = options.type;
    logger.info(`Initializing cache service with strategy: ${cacheType}`);

    switch (cacheType) {
        case 'redis':
            logger.debug('Using Redis cache service', { ttl: options.ttl });
            return new RedisCacheService(options);
        default:
            logger.error(`Unsupported cache type: ${cacheType}`);
            throw new Error(`Unsupported cache type: ${cacheType}`);
    }
}



export const cacheService = createCacheService({type: "redis"});