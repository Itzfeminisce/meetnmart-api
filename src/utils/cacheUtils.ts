import Redis, { ChainableCommander } from 'ioredis';
import { logger } from '../logger';

// Function to mask sensitive data for logging and debugging
function maskSensitiveData(data: any): any {
  if (!data) return data;
  
  // Clone the data to avoid modifying the original
  const masked = JSON.parse(JSON.stringify(data));
  
  // List of sensitive field names to mask
  const sensitiveFields = [
    'password', 'newPassword', 'oldPassword', 'confirmPassword',
    'token', 'accessToken', 'refreshToken', 'apiKey', 'secret',
    'pin', 'cvv', 'cardNumber', 'ssn', 'socialSecurityNumber',
    'jwt', 'auth', 'key', 'credential', 'private'
  ];
  
  // Recursively mask sensitive data
  function recursiveMask(obj: any) {
    if (!obj || typeof obj !== 'object') return;
    
    Object.keys(obj).forEach(key => {
      // Check if this is a sensitive field
      if (sensitiveFields.some(field => key.toLowerCase().includes(field.toLowerCase()))) {
        if (typeof obj[key] === 'string') {
          const length = obj[key].length;
          // Show first and last character with asterisks in between for better debugging
          if (length > 6) {
            obj[key] = `${obj[key][0]}******${obj[key][length-1]}`;
          } else {
            obj[key] = '********';
          }
        } else if (obj[key] !== null && obj[key] !== undefined) {
          obj[key] = '********';
        }
      } 
      // Recurse if object or array
      else if (obj[key] && typeof obj[key] === 'object') {
        recursiveMask(obj[key]);
      }
    });
  }
  
  recursiveMask(masked);
  return masked;
}

type CacheOptions = {
    type: 'redis' | 'memory';
    ttl?: number;
    checkPeriod?: number;
    memoryLimit?: number; // In bytes, defaults to 100MB if not specified
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
    getStats?(): Promise<any>; // Optional stats method for debugging
}

// Cache item structure
interface CacheItem {
    value: any;
    expiry: number | null; // Timestamp when item expires, null if no expiry
    size: number; // Approximate size in bytes
    lastAccessed: number; // Timestamp when item was last accessed
}

// Memory cache service implementation
class MemoryCacheService implements ICacheService {
    private cache: Map<string, CacheItem> = new Map();
    private memoryUsage: number = 0;
    private memoryLimit: number;
    private cleanupTimer: NodeJS.Timeout | null = null;
    private ttl: number | undefined;

    constructor(options: CacheOptions) {
        // Default to 100MB if not specified
        this.memoryLimit = options.memoryLimit || 100 * 1024 * 1024;
        this.ttl = options.ttl;
        
        // Setup cleanup interval if checkPeriod is specified
        if (options.checkPeriod) {
            this.cleanupTimer = setInterval(() => {
                this.cleanup();
            }, options.checkPeriod);
        }

        logger.info('Memory cache initialized', { 
            memoryLimit: this.formatBytes(this.memoryLimit),
            defaultTTL: this.ttl ? `${this.ttl}s` : 'unlimited'
        });
    }

    async get<T>(key: string): Promise<T | null> {
        try {
            // Handle wildcard patterns similar to Redis
            if (key.includes('*') || key.includes('?')) {
                const pattern = new RegExp('^' + key.replace(/\*/g, '.*').replace(/\?/g, '.') + '$');
                const matchingKeys = Array.from(this.cache.keys()).filter(k => pattern.test(k));
                
                if (matchingKeys.length === 0) {
                    return null;
                }
                
                if (matchingKeys.length === 1) {
                    return this.getSingleItem(matchingKeys[0]) as T;
                }
                
                const resultMap: Record<string, any> = {};
                for (const matchingKey of matchingKeys) {
                    const value = this.getSingleItem(matchingKey);
                    if (value !== null) {
                        resultMap[matchingKey] = value;
                    }
                }
                
                return Object.keys(resultMap).length > 0 ? resultMap as unknown as T : null;
            }
            
            // Regular key lookup
            return this.getSingleItem(key) as T;
        } catch (error) {
            logger.error('Memory cache get error', error, { 
                key,
                isPattern: key.includes('*') || key.includes('?')
            });
            return null;
        }
    }

    // Helper method to get and update a single cache item
    private getSingleItem(key: string): any | null {
        const item = this.cache.get(key);
        
        if (!item) {
            return null;
        }
        
        // Check if item has expired
        if (item.expiry !== null && item.expiry < Date.now()) {
            this.del(key);
            return null;
        }
        
        // Update last accessed time
        item.lastAccessed = Date.now();
        return item.value;
    }

    async set(key: string, value: any, ttl?: number): Promise<void> {
        try {
            // Calculate size of the item (approximate)
            const serialized = JSON.stringify(value);
            const size = this.getApproximateSize(serialized);
            
            // Create masked version for logging if needed
            const maskedValue = maskSensitiveData(value);
            console.log("[MemeoryCacheService#set]", maskedValue);
            
            
            // Check if setting this would exceed memory limit
            if (size > this.memoryLimit) {
                logger.warn('Cache item too large to store in memory', { 
                    key, 
                    size: this.formatBytes(size),
                    limit: this.formatBytes(this.memoryLimit),
                    valueSample: JSON.stringify(maskSensitiveData(value)).substring(0, 100) + '...'
                });
                return;
            }
            
            // If we already have this key, subtract its size from current usage
            if (this.cache.has(key)) {
                this.memoryUsage -= this.cache.get(key)!.size;
            }
            
            // Check if we need to free up space
            if (this.memoryUsage + size > this.memoryLimit) {
                this.evictItems(size);
            }
            
            // Calculate expiry time if TTL provided
            const expiry = ttl || this.ttl ? Date.now() + ((ttl || this.ttl!) * 1000) : null;
            
            // Store the item
            this.cache.set(key, {
                value,
                expiry,
                size,
                lastAccessed: Date.now()
            });
            
            // Update memory usage
            this.memoryUsage += size;
            
            // Log if we're approaching memory limit (over 90%)
            if (this.memoryUsage > this.memoryLimit * 0.9) {
                logger.warn('Memory cache is approaching limit', {
                    used: this.formatBytes(this.memoryUsage),
                    limit: this.formatBytes(this.memoryLimit),
                    usage: `${Math.round((this.memoryUsage / this.memoryLimit) * 100)}%`
                });
            }
        } catch (error) {
            logger.error('Memory cache set error', error, { 
                key,
                valueType: value ? typeof value : 'null/undefined',
                valuePreview: value ? JSON.stringify(maskSensitiveData(value)).substring(0, 50) + '...' : 'none'
            });
        }
    }

    async del(key: string): Promise<void> {
        try {
            if (key.includes('*') || key.includes('?')) {
                // Handle wildcard pattern
                const pattern = new RegExp('^' + key.replace(/\*/g, '.*').replace(/\?/g, '.') + '$');
                const keysToDelete = Array.from(this.cache.keys()).filter(k => pattern.test(k));
                
                for (const k of keysToDelete) {
                    if (this.cache.has(k)) {
                        this.memoryUsage -= this.cache.get(k)!.size;
                        this.cache.delete(k);
                    }
                }
                
                if (keysToDelete.length > 0) {
                    logger.debug(`Deleted ${keysToDelete.length} keys matching pattern: ${key}`);
                }
            } else {
                // Regular key deletion
                if (this.cache.has(key)) {
                    this.memoryUsage -= this.cache.get(key)!.size;
                    this.cache.delete(key);
                }
            }
        } catch (error) {
            logger.error('Memory cache delete error', error, { key });
        }
    }

    async flush(): Promise<void> {
        try {
            this.cache.clear();
            this.memoryUsage = 0;
            logger.info('Memory cache flushed');
        } catch (error) {
            logger.error('Memory cache flush error', error);
        }
    }

    async multi(): Promise<ChainableCommander | null> {
        logger.warn('Memory cache does not support transactions, returning null');
        return null;
    }

    async getAllKeys(): Promise<string[]> {
        return Array.from(this.cache.keys());
    }
    
    // Utility method for debugging - get cache statistics
    async getStats(): Promise<any> {
        const stats = {
            itemCount: this.cache.size,
            memoryUsage: this.memoryUsage,
            memoryLimit: this.memoryLimit,
            utilizationPercentage: Math.round((this.memoryUsage / this.memoryLimit) * 100),
            largestItems: [] as {key: string, size: number, expires: string, lastAccessed: string}[],
            ttlDistribution: {
                noExpiry: 0,
                lessThan1Minute: 0,
                lessThan1Hour: 0,
                lessThan1Day: 0,
                moreThan1Day: 0
            },
            expiryCount: 0
        };
        
        // Track top 5 largest items
        const items = Array.from(this.cache.entries())
            .map(([key, item]) => ({
                key,
                size: item.size,
                expires: item.expiry ? new Date(item.expiry).toISOString() : 'never',
                lastAccessed: new Date(item.lastAccessed).toISOString()
            }))
            .sort((a, b) => b.size - a.size)
            .slice(0, 5);
            
        stats.largestItems = items;
        
        // Calculate TTL distribution
        const now = Date.now();
        for (const [_, item] of this.cache.entries()) {
            if (item.expiry === null) {
                stats.ttlDistribution.noExpiry++;
            } else {
                const ttlMs = item.expiry - now;
                if (ttlMs <= 0) {
                    stats.expiryCount++;
                } else if (ttlMs < 60000) { // Less than 1 minute
                    stats.ttlDistribution.lessThan1Minute++;
                } else if (ttlMs < 3600000) { // Less than 1 hour
                    stats.ttlDistribution.lessThan1Hour++;
                } else if (ttlMs < 86400000) { // Less than 1 day
                    stats.ttlDistribution.lessThan1Day++;
                } else {
                    stats.ttlDistribution.moreThan1Day++;
                }
            }
        }
        
        return stats;
    }

    // Clean up expired items
    private cleanup(): void {
        try {
            const now = Date.now();
            let expiredCount = 0;
            
            for (const [key, item] of this.cache.entries()) {
                if (item.expiry !== null && item.expiry < now) {
                    this.memoryUsage -= item.size;
                    this.cache.delete(key);
                    expiredCount++;
                }
            }
            
            if (expiredCount > 0) {
                logger.debug(`Cleaned up ${expiredCount} expired items from memory cache`);
            }
        } catch (error) {
            logger.error('Error during memory cache cleanup', error);
        }
    }

    // Evict items to make room for new ones using a combined strategy:
    // 1. First remove expired items
    // 2. Then use LRU (Least Recently Used) strategy
    private evictItems(neededSpace: number): void {
        try {
            // Step 1: Remove expired items
            const now = Date.now();
            for (const [key, item] of this.cache.entries()) {
                if (item.expiry !== null && item.expiry < now) {
                    this.memoryUsage -= item.size;
                    this.cache.delete(key);
                }
            }
            
            // Step 2: If we still need more space, use LRU strategy
            if (this.memoryUsage + neededSpace > this.memoryLimit) {
                // Sort items by lastAccessed (oldest first)
                const items = Array.from(this.cache.entries())
                    .sort((a, b) => a[1].lastAccessed - b[1].lastAccessed);
                
                // Remove oldest items until we have enough space
                let freedSpace = 0;
                let removedCount = 0;
                
                for (const [key, item] of items) {
                    // Stop if we've freed enough space
                    if (this.memoryUsage + neededSpace - freedSpace <= this.memoryLimit) {
                        break;
                    }
                    
                    this.cache.delete(key);
                    freedSpace += item.size;
                    removedCount++;
                }
                
                this.memoryUsage -= freedSpace;
                
                if (removedCount > 0) {
                    logger.info(`Evicted ${removedCount} items from memory cache using LRU strategy, freed ${this.formatBytes(freedSpace)}`);
                }
            }
        } catch (error) {
            logger.error('Error during memory cache eviction', error);
        }
    }

    // Helper method to get approximate size of an item in bytes
    private getApproximateSize(value: string): number {
        // Each character is approximately 2 bytes in JavaScript strings,
        // plus some overhead for the Map storage
        return Math.max(value.length * 2, 100) + 100; // Minimum 200 bytes per entry with overhead
    }

    // Format bytes for logging
    private formatBytes(bytes: number): string {
        const units = ['B', 'KB', 'MB', 'GB'];
        let size = bytes;
        let unitIndex = 0;
        
        while (size >= 1024 && unitIndex < units.length - 1) {
            size /= 1024;
            unitIndex++;
        }
        
        return `${size.toFixed(2)} ${units[unitIndex]}`;
    }
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
            logger.info('Redis connection established successfully');
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
            logger.debug('Using Redis cache service', { 
                ttl: options.ttl,
                host: options.redis?.host || 'localhost', 
                port: options.redis?.port || 6379
            });
            return new RedisCacheService(options);
        case 'memory':
            logger.debug('Using Memory cache service', { 
                ttl: options.ttl, 
                memoryLimit: options.memoryLimit || '100MB',
                checkPeriod: options.checkPeriod
            });
            return new MemoryCacheService(options);
        default:
            logger.error(`Unsupported cache type: ${cacheType}`);
            throw new Error(`Unsupported cache type: ${cacheType}`);
    }
}

// Example usage with memory cache
export const cacheService = createCacheService({
    type: "redis", // Change to "memory" to use memory cache
    // Optional memory cache configuration when using memory type:
    // memoryLimit: 200 * 1024 * 1024, // 200MB
    // ttl: 3600, // Default TTL in seconds
    // checkPeriod: 60000, // Cleanup every minute (in milliseconds)
});

// import Redis, { ChainableCommander } from 'ioredis';

// type CacheOptions = {
//     type: 'redis' | 'memory';
//     ttl?: number;
//     checkPeriod?: number;
//     memoryLimit?: number; // In bytes, defaults to 100MB if not specified
//     redis?: {
//         host: string;
//         port: number;
//         password?: string;
//     };
// };

// export interface ICacheService {
//     get<T>(key: string): Promise<T | null>;
//     set(key: string, value: any, ttl?: number): Promise<void>;
//     del(key: string): Promise<void>;
//     flush(): Promise<void>;
//     multi(): Promise<ChainableCommander | null>;
//     getAllKeys(): Promise<string[]>;
// }

// // Cache item structure
// interface CacheItem {
//     value: any;
//     expiry: number | null; // Timestamp when item expires, null if no expiry
//     size: number; // Approximate size in bytes
//     lastAccessed: number; // Timestamp when item was last accessed
// }

// // Memory cache service implementation
// class MemoryCacheService implements ICacheService {
//     private cache: Map<string, CacheItem> = new Map();
//     private memoryUsage: number = 0;
//     private memoryLimit: number;
//     private cleanupTimer: NodeJS.Timeout | null = null;
//     private ttl: number | undefined;

//     constructor(options: CacheOptions) {
//         // Default to 100MB if not specified
//         this.memoryLimit = options.memoryLimit || 100 * 1024 * 1024;
//         this.ttl = options.ttl;
        
//         // Setup cleanup interval if checkPeriod is specified
//         if (options.checkPeriod) {
//             this.cleanupTimer = setInterval(() => {
//                 this.cleanup();
//             }, options.checkPeriod);
//         }

//         logger.info('Memory cache initialized', { 
//             memoryLimit: this.formatBytes(this.memoryLimit),
//             defaultTTL: this.ttl ? `${this.ttl}s` : 'unlimited'
//         });
//     }

//     async get<T>(key: string): Promise<T | null> {
//         try {
//             // Handle wildcard patterns similar to Redis
//             if (key.includes('*') || key.includes('?')) {
//                 const pattern = new RegExp('^' + key.replace(/\*/g, '.*').replace(/\?/g, '.') + '$');
//                 const matchingKeys = Array.from(this.cache.keys()).filter(k => pattern.test(k));
                
//                 if (matchingKeys.length === 0) {
//                     return null;
//                 }
                
//                 if (matchingKeys.length === 1) {
//                     return this.getSingleItem(matchingKeys[0]) as T;
//                 }
                
//                 const resultMap: Record<string, any> = {};
//                 for (const matchingKey of matchingKeys) {
//                     const value = this.getSingleItem(matchingKey);
//                     if (value !== null) {
//                         resultMap[matchingKey] = value;
//                     }
//                 }
                
//                 return Object.keys(resultMap).length > 0 ? resultMap as unknown as T : null;
//             }
            
//             // Regular key lookup
//             return this.getSingleItem(key) as T;
//         } catch (error) {
//             logger.error('Memory cache get error', error, { key });
//             return null;
//         }
//     }

//     // Helper method to get and update a single cache item
//     private getSingleItem(key: string): any | null {
//         const item = this.cache.get(key);
        
//         if (!item) {
//             return null;
//         }
        
//         // Check if item has expired
//         if (item.expiry !== null && item.expiry < Date.now()) {
//             this.del(key);
//             return null;
//         }
        
//         // Update last accessed time
//         item.lastAccessed = Date.now();
//         return item.value;
//     }

//     async set(key: string, value: any, ttl?: number): Promise<void> {
//         try {
//             // Calculate size of the item (approximate)
//             const serialized = JSON.stringify(value);
//             const size = this.getApproximateSize(serialized);
            
//             // Check if setting this would exceed memory limit
//             if (size > this.memoryLimit) {
//                 logger.warn('Cache item too large to store in memory', { 
//                     key, 
//                     size: this.formatBytes(size),
//                     limit: this.formatBytes(this.memoryLimit)
//                 });
//                 return;
//             }
            
//             // If we already have this key, subtract its size from current usage
//             if (this.cache.has(key)) {
//                 this.memoryUsage -= this.cache.get(key)!.size;
//             }
            
//             // Check if we need to free up space
//             if (this.memoryUsage + size > this.memoryLimit) {
//                 this.evictItems(size);
//             }
            
//             // Calculate expiry time if TTL provided
//             const expiry = ttl || this.ttl ? Date.now() + ((ttl || this.ttl!) * 1000) : null;
            
//             // Store the item
//             this.cache.set(key, {
//                 value,
//                 expiry,
//                 size,
//                 lastAccessed: Date.now()
//             });
            
//             // Update memory usage
//             this.memoryUsage += size;
            
//             // Log if we're approaching memory limit (over 90%)
//             if (this.memoryUsage > this.memoryLimit * 0.9) {
//                 logger.warn('Memory cache is approaching limit', {
//                     used: this.formatBytes(this.memoryUsage),
//                     limit: this.formatBytes(this.memoryLimit),
//                     usage: `${Math.round((this.memoryUsage / this.memoryLimit) * 100)}%`
//                 });
//             }
//         } catch (error) {
//             logger.error('Memory cache set error', error, { key });
//         }
//     }

//     async del(key: string): Promise<void> {
//         try {
//             if (key.includes('*') || key.includes('?')) {
//                 // Handle wildcard pattern
//                 const pattern = new RegExp('^' + key.replace(/\*/g, '.*').replace(/\?/g, '.') + '$');
//                 const keysToDelete = Array.from(this.cache.keys()).filter(k => pattern.test(k));
                
//                 for (const k of keysToDelete) {
//                     if (this.cache.has(k)) {
//                         this.memoryUsage -= this.cache.get(k)!.size;
//                         this.cache.delete(k);
//                     }
//                 }
                
//                 if (keysToDelete.length > 0) {
//                     logger.debug(`Deleted ${keysToDelete.length} keys matching pattern: ${key}`);
//                 }
//             } else {
//                 // Regular key deletion
//                 if (this.cache.has(key)) {
//                     this.memoryUsage -= this.cache.get(key)!.size;
//                     this.cache.delete(key);
//                 }
//             }
//         } catch (error) {
//             logger.error('Memory cache delete error', error, { key });
//         }
//     }

//     async flush(): Promise<void> {
//         try {
//             this.cache.clear();
//             this.memoryUsage = 0;
//             logger.info('Memory cache flushed');
//         } catch (error) {
//             logger.error('Memory cache flush error', error);
//         }
//     }

//     async multi(): Promise<ChainableCommander | null> {
//         logger.warn('Memory cache does not support transactions, returning null');
//         return null;
//     }

//     async getAllKeys(): Promise<string[]> {
//         return Array.from(this.cache.keys());
//     }

//     // Clean up expired items
//     private cleanup(): void {
//         try {
//             const now = Date.now();
//             let expiredCount = 0;
            
//             for (const [key, item] of this.cache.entries()) {
//                 if (item.expiry !== null && item.expiry < now) {
//                     this.memoryUsage -= item.size;
//                     this.cache.delete(key);
//                     expiredCount++;
//                 }
//             }
            
//             if (expiredCount > 0) {
//                 logger.debug(`Cleaned up ${expiredCount} expired items from memory cache`);
//             }
//         } catch (error) {
//             logger.error('Error during memory cache cleanup', error);
//         }
//     }

//     // Evict items to make room for new ones using a combined strategy:
//     // 1. First remove expired items
//     // 2. Then use LRU (Least Recently Used) strategy
//     private evictItems(neededSpace: number): void {
//         try {
//             // Step 1: Remove expired items
//             const now = Date.now();
//             for (const [key, item] of this.cache.entries()) {
//                 if (item.expiry !== null && item.expiry < now) {
//                     this.memoryUsage -= item.size;
//                     this.cache.delete(key);
//                 }
//             }
            
//             // Step 2: If we still need more space, use LRU strategy
//             if (this.memoryUsage + neededSpace > this.memoryLimit) {
//                 // Sort items by lastAccessed (oldest first)
//                 const items = Array.from(this.cache.entries())
//                     .sort((a, b) => a[1].lastAccessed - b[1].lastAccessed);
                
//                 // Remove oldest items until we have enough space
//                 let freedSpace = 0;
//                 let removedCount = 0;
                
//                 for (const [key, item] of items) {
//                     // Stop if we've freed enough space
//                     if (this.memoryUsage + neededSpace - freedSpace <= this.memoryLimit) {
//                         break;
//                     }
                    
//                     this.cache.delete(key);
//                     freedSpace += item.size;
//                     removedCount++;
//                 }
                
//                 this.memoryUsage -= freedSpace;
                
//                 if (removedCount > 0) {
//                     logger.info(`Evicted ${removedCount} items from memory cache using LRU strategy, freed ${this.formatBytes(freedSpace)}`);
//                 }
//             }
//         } catch (error) {
//             logger.error('Error during memory cache eviction', error);
//         }
//     }

//     // Helper method to get approximate size of an item in bytes
//     private getApproximateSize(value: string): number {
//         // Each character is approximately 2 bytes in JavaScript strings
//         return value.length * 2;
//     }

//     // Format bytes for logging
//     private formatBytes(bytes: number): string {
//         const units = ['B', 'KB', 'MB', 'GB'];
//         let size = bytes;
//         let unitIndex = 0;
        
//         while (size >= 1024 && unitIndex < units.length - 1) {
//             size /= 1024;
//             unitIndex++;
//         }
        
//         return `${size.toFixed(2)} ${units[unitIndex]}`;
//     }
// }

// class RedisCacheService implements ICacheService {
//     private client: Redis;

//     constructor(options: CacheOptions) {
//         this.client = new Redis({
//             host: options.redis?.host || 'localhost',
//             port: options.redis?.port || 6379,
//             password: options.redis?.password,
//             retryStrategy(times: any) {
//                 const delay = Math.min(times * 50, 2000);
//                 return delay;
//             },
//             maxRetriesPerRequest: 3
//         });

//         this.client.on('connect', () => {
//             logger.info('Redis connection established successfully');
//         });
//         this.client.on('error', (error: any) => {
//             logger.error('Redis connection error', error, {});
//         });
//     }

//     async get<T>(key: string): Promise<T | null> {
//         try {
//             // Check if the key contains a wildcard pattern
//             if (key.includes('*') || key.includes('?')) {
//                 // Get all keys matching the pattern
//                 const keys = await this.client.keys(key);
                
//                 if (keys.length === 0) {
//                     return null;
//                 }
                
//                 // If only one key matches, return its value
//                 if (keys.length === 1) {
//                     const data = await this.client.get(keys[0]);
//                     return data ? JSON.parse(data) : null;
//                 }
                
//                 // If multiple keys match, return a map of key-value pairs
//                 const resultMap: Record<string, any> = {};
                
//                 // Get all values in a single pipeline
//                 const pipeline = this.client.pipeline();
//                 keys.forEach(k => pipeline.get(k));
                
//                 const results = await pipeline.exec();
//                 if (!results) {
//                     return null;
//                 }
                
//                 // Process results
//                 results.forEach((result, index) => {
//                     if (result && result[0] === null && result[1]) {
//                         try {
//                             const value = JSON.parse(result[1] as string);
//                             resultMap[keys[index]] = value;
//                         } catch (e) {
//                             logger.error('Error parsing cached value', e, { key: keys[index] });
//                         }
//                     }
//                 });
                
//                 return resultMap as unknown as T;
//             }
            
//             // Original behavior for exact key match
//             const data = await this.client.get(key);
//             return data ? JSON.parse(data) : null;
//         } catch (error) {
//             logger.error('Redis get error', error, { key });
//             return null;
//         }
//     }

//     async set(key: string, value: any, ttl?: number): Promise<void> {
//         try {
//             const serializedValue = JSON.stringify(value);
//             if (ttl) {
//                 await this.client.setex(key, ttl, serializedValue);
//             } else {
//                 await this.client.set(key, serializedValue);
//             }
//         } catch (error) {
//             logger.error('Redis set error', error, { key });
//         }
//     }

//     async del(key: string): Promise<void> {
//         try {
//             if (key.includes('*')) {
//                 // Handle wildcard pattern
//                 let cursor = '0';
//                 const keysToDelete: string[] = [];

//                 do {
//                     const reply = await new Promise<[cursor: string, elements: string[]] | undefined>((resolve, reject) => {
//                         this.client.scan(
//                             cursor,
//                             'MATCH', key,
//                             'COUNT', '100',
//                             (err, result) => err ? reject(err) : resolve(result)
//                         );
//                     });

//                     if(!reply){
//                         logger.warn("[Redis] DEL -> reply is undefined. Returning...", reply)
//                         return;
//                     }
//                     cursor = reply[0]; // First element is the new cursor
//                     keysToDelete.push(...reply[1]); // Second element is the array of keys
//                 } while (cursor !== '0');

//                 if (keysToDelete.length > 0) {
//                     // Delete in batches to avoid overwhelming Redis
//                     const batchSize = 100;
//                     for (let i = 0; i < keysToDelete.length; i += batchSize) {
//                         const batch = keysToDelete.slice(i, i + batchSize);
//                         await this.client.del(batch);
//                     }
//                 }
//             } else {
//                 // Original behavior for exact key match
//                 await this.client.del(key);
//             }
//         } catch (error) {
//             logger.error('Redis delete error', error, { error, key });
//         }
//     }

//     async flush(): Promise<void> {
//         try {
//             await this.client.flushall();
//         } catch (error) {
//             logger.error('Redis flush error', error, { error });
//         }
//     }

//     async multi(): Promise<any> {
//         return this.client.multi();
//     }

//     async getAllKeys(): Promise<string[]> {
//         return this.client.keys('*');
//     }
// }

// // Factory function to create cache service
// export function createCacheService(options: CacheOptions): ICacheService {
//     const cacheType = options.type;
//     logger.info(`Initializing cache service with strategy: ${cacheType}`);

//     switch (cacheType) {
//         case 'redis':
//             logger.debug('Using Redis cache service', { 
//                 ttl: options.ttl,
//                 host: options.redis?.host || 'localhost', 
//                 port: options.redis?.port || 6379
//             });
//             return new RedisCacheService(options);
//         case 'memory':
//             logger.debug('Using Memory cache service', { 
//                 ttl: options.ttl, 
//                 memoryLimit: options.memoryLimit || '100MB',
//                 checkPeriod: options.checkPeriod
//             });
//             return new MemoryCacheService(options);
//         default:
//             logger.error(`Unsupported cache type: ${cacheType}`);
//             throw new Error(`Unsupported cache type: ${cacheType}`);
//     }
// }

// // Example usage with memory cache
// export const cacheService = createCacheService({
//     type: "memory", // Change to "memory" to use memory cache
//     // Optional memory cache configuration:
//     // memoryLimit: 200 * 1024 * 1024, // 200MB
//     // ttl: 3600, // Default TTL in seconds
//     // checkPeriod: 60000, // Cleanup every minute
// });