import { ICacheService } from './cacheUtils';

type GeoParams = {
  lat: number;
  lng: number;
  resolution?: number;
  extraKey?: string;
};

export class GeoCache {
  private engine: ICacheService;
  private defaultTTL: number;
  private resolution: number;

  constructor(engine: ICacheService, config?: { defaultTTL?: number; resolution?: number }) {
    this.engine = engine;
    this.defaultTTL = config?.defaultTTL ?? 60;
    this.resolution = config?.resolution ?? 0.001;
  }

  private toBucket(coord: number): number {
    return Math.floor(coord / this.resolution) * this.resolution;
  }

  private buildKey(params: GeoParams): string {
    const latBucket = this.toBucket(params.lat);
    const lngBucket = this.toBucket(params.lng);
    return `geo:${latBucket}:${lngBucket}${params.extraKey ? `:${params.extraKey}` : ''}`;
  }

  async cache<T>(
    params: GeoParams,
    fetcher: () => Promise<T>,
    ttl?: number
  ): Promise<T> {
    const key = this.buildKey(params);
    const cached = await this.engine.get<T>(key);

    if (cached) return cached;

    const result = await fetcher();
    await this.engine.set(key, result, ttl ?? this.defaultTTL);
    return result;
  }

  async invalidate(params: GeoParams) {
    const key = this.buildKey(params);
    await this.engine.del(key);
  }
}
