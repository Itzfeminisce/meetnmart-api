import { ICacheService, marketPlaceCacheService } from "../../utils/cacheUtils";

export interface MarketWithMap {
  place_id: string;
  name: string;
  lat: string;
  lon: string;
  type: string;
  address: string;
  map_url: string;
  distance: number;
  rating?: number;
  user_ratings_total?: number;
  price_level?: number;
  open_now?: boolean;
  cached?: boolean;
  cached_at?: string;
}

export interface SearchConfig {
  radius: number;
  limit?: number;
  query?: string | false;
  pageToken?: string;
  region?: string;
  types?: string[];
  keywords?: string[];
  minRating?: number;
  openNow?: boolean;
  priceLevel?: number[];
}

export interface MapConfig {
  width: number;
  height: number;
  zoom: number;
  format: 'png' | 'jpg';
  mapType?: 'roadmap' | 'satellite' | 'terrain' | 'hybrid';
  markerColor?: string;
  markerSize?: 'tiny' | 'small' | 'mid' | 'normal';
}

export interface Coordinates {
  lat: number;
  lng: number;
}

export interface GooglePlace {
  place_id: string;
  name: string;
  geometry: {
    location: {
      lat: number;
      lng: number;
    };
  };
  types: string[];
  formatted_address?: string;
  vicinity?: string;
  rating?: number;
  user_ratings_total?: number;
  price_level?: number;
  opening_hours?: {
    open_now: boolean;
  };
}

export interface GooglePlacesResponse {
  results: GooglePlace[];
  status: string;
  error_message?: string;
  next_page_token?: string;
}

export interface ServiceConfig {
  apiKey: string;
  cacheManager?: ICacheService;
  logger?: (message: string, level?: 'info' | 'warn' | 'error' | 'debug') => void;
  timeout?: number;
  retryAttempts?: number;
  retryDelay?: number;
  enableCache?: boolean;
  cacheExpiration?: number; // in seconds
  enableRateLimiting?: boolean;
  requestsPerSecond?: number;
}

export interface SearchMetrics {
  totalRequests: number;
  cacheHits: number;
  cacheHitRate: number;
  avgResponseTime: number;
  errors: number;
  quotaExceeded: number;
}

export class GoogleMapsAPIError extends Error {
  constructor(
    message: string,
    public status: string,
    public quotaExceeded: boolean = false,
    public retryable: boolean = false
  ) {
    super(message);
    this.name = 'GoogleMapsAPIError';
  }
}

export class GoogleMapsMarketService {
  private readonly apiKey: string;
  private readonly cacheManager: ICacheService;
  private readonly logger: (message: string, level?: 'info' | 'warn' | 'error' | 'debug') => void;
  private readonly timeout: number;
  private readonly retryAttempts: number;
  private readonly retryDelay: number;
  private readonly enableCache: boolean;
  private readonly cacheExpiration: number;
  private readonly enableRateLimiting: boolean;
  private readonly requestsPerSecond: number;
  private readonly baseUrl = 'https://maps.googleapis.com/maps/api/place';
  
  // Rate limiting and metrics
  private requestQueue: Array<() => Promise<void>> = [];
  private requestCount = 0;
  private lastRequestTime = 0;
  private metrics: SearchMetrics = {
    totalRequests: 0,
    cacheHits: 0,
    cacheHitRate: 0,
    avgResponseTime: 0,
    errors: 0,
    quotaExceeded: 0
  };

  constructor(config: ServiceConfig) {
    this.apiKey = config.apiKey;
    this.cacheManager = config.cacheManager || marketPlaceCacheService;
    this.logger = config.logger || (() => { });
    this.timeout = config.timeout || 10000;
    this.retryAttempts = config.retryAttempts || 3;
    this.retryDelay = config.retryDelay || 1000;
    this.enableCache = config.enableCache ?? true;
    this.cacheExpiration = config.cacheExpiration || 3600; // 1 hour default
    this.enableRateLimiting = config.enableRateLimiting ?? true;
    this.requestsPerSecond = config.requestsPerSecond || 10;

    this.logger('GoogleMapsMarketService initialized', 'info');
  }

  async findMarketsNearby(
    coords: Coordinates,
    searchConfig: SearchConfig,
    mapConfig: MapConfig
  ): Promise<MarketWithMap[]> {
    const startTime = Date.now();
    const requestId = `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    try {
      this.validateInputs(coords, searchConfig, mapConfig);
      this.logger(`[${requestId}] Starting market search`, 'debug');

      // Generate cache key
      const cacheKey = this.generateCacheKey(coords, searchConfig, mapConfig);
      
      // Try cache first
      if (this.enableCache) {
        const cached = await this.getCachedResult(cacheKey);
        if (cached) {
          this.metrics.cacheHits++;
          this.updateMetrics(startTime, false);
          this.logger(`[${requestId}] Cache hit for key: ${cacheKey}`, 'debug');
          return cached.map(market => ({ ...market, cached: true, cached_at: new Date().toISOString() }));
        }
      }

      // Rate limiting
      if (this.enableRateLimiting) {
        await this.applyRateLimit();
      }

      // Make API request with retry logic
      const markets = await this.executeSearchWithRetry(coords, searchConfig, mapConfig, requestId);
      
      // Cache successful results
      if (this.enableCache && markets.length > 0) {
        await this.cacheResult(cacheKey, markets);
        this.logger(`[${requestId}] Cached ${markets.length} markets`, 'debug');
      }

      this.updateMetrics(startTime, false);
      this.logger(`[${requestId}] Successfully found ${markets.length} markets`, 'info');
      
      return markets;

    } catch (error: any) {
      this.updateMetrics(startTime, true);
      this.logger(`[${requestId}] Error finding markets: ${error.message}`, 'error');
      
      if (error instanceof GoogleMapsAPIError && error.quotaExceeded) {
        this.metrics.quotaExceeded++;
      }
      
      throw error;
    }
  }

  private async executeSearchWithRetry(
    coords: Coordinates,
    searchConfig: SearchConfig,
    mapConfig: MapConfig,
    requestId: string
  ): Promise<MarketWithMap[]> {
    let lastError: Error;
    
    for (let attempt = 1; attempt <= this.retryAttempts; attempt++) {
      try {
        this.logger(`[${requestId}] Attempt ${attempt}/${this.retryAttempts}`, 'debug');
        
        const url = this.buildSearchUrl(coords, searchConfig);
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), this.timeout);
        
        this.logger(`[${requestId}] API call: ${url}`, 'debug');
        
        const response = await fetch(url, {
          signal: controller.signal,
          headers: {
            'User-Agent': 'GoogleMapsMarketService/1.0',
            'Accept': 'application/json',
          }
        });
        
        clearTimeout(timeoutId);
        
        if (!response.ok) {
          throw new GoogleMapsAPIError(
            `HTTP ${response.status}: ${response.statusText}`,
            response.status.toString(),
            response.status === 429,
            response.status >= 500 || response.status === 429
          );
        }

        const data = await response.json() as GooglePlacesResponse;
        
        if (data.status === 'OVER_QUERY_LIMIT') {
          throw new GoogleMapsAPIError(
            'Google Places API quota exceeded',
            data.status,
            true,
            true
          );
        }
        
        if (data.status !== 'OK' && data.status !== 'ZERO_RESULTS') {
          throw new GoogleMapsAPIError(
            data.error_message || `Google Places API error: ${data.status}`,
            data.status,
            false,
            data.status === 'UNKNOWN_ERROR'
          );
        }

        return this.processPlacesResponse(data, coords, mapConfig, searchConfig);

      } catch (error: any) {
        lastError = error;
        
        if (error.name === 'AbortError') {
          lastError = new GoogleMapsAPIError('Request timeout', 'TIMEOUT', false, true);
        }
        
        const isRetryable = error instanceof GoogleMapsAPIError ? error.retryable : true;
        
        if (attempt < this.retryAttempts && isRetryable) {
          const delay = this.retryDelay * Math.pow(2, attempt - 1); // Exponential backoff
          this.logger(`[${requestId}] Retrying in ${delay}ms after error: ${error.message}`, 'warn');
          await new Promise(resolve => setTimeout(resolve, delay));
          continue;
        }
        
        break;
      }
    }
    
    throw lastError;
  }

  private processPlacesResponse(
    data: GooglePlacesResponse,
    coords: Coordinates,
    mapConfig: MapConfig,
    searchConfig: SearchConfig
  ): MarketWithMap[] {
    let results = data.results;
    
    // Apply filters
    if (searchConfig.minRating) {
      results = results.filter(place => (place.rating || 0) >= searchConfig.minRating!);
    }
    
    if (searchConfig.openNow) {
      results = results.filter(place => place.opening_hours?.open_now === true);
    }
    
    if (searchConfig.priceLevel?.length) {
      results = results.filter(place => 
        place.price_level !== undefined && 
        searchConfig.priceLevel!.includes(place.price_level)
      );
    }

    // Apply limit
    if (searchConfig.limit) {
      results = results.slice(0, searchConfig.limit);
    }

    return results.map((place): MarketWithMap => ({
      place_id: place.place_id,
      name: place.name,
      lat: place.geometry.location.lat.toString(),
      lon: place.geometry.location.lng.toString(),
      type: this.getBestPlaceType(place.types),
      address: place.formatted_address || place.vicinity || 'N/A',
      map_url: this.generateStaticMapUrl(place.geometry.location, mapConfig),
      distance: this.calculateDistance(coords, place.geometry.location),
      rating: place.rating,
      user_ratings_total: place.user_ratings_total,
      price_level: place.price_level,
      open_now: place.opening_hours?.open_now,
      cached: false
    }));
  }

  private getBestPlaceType(types: string[]): string {
    const preferredTypes = [
      'supermarket',
      'grocery_or_supermarket',
      'food',
      'meal_takeaway',
      'restaurant',
      'store',
      'establishment'
    ];
    
    for (const preferred of preferredTypes) {
      if (types.includes(preferred)) {
        return preferred;
      }
    }
    
    return types[0] || 'unknown';
  }

  private buildSearchUrl(coords: Coordinates, searchConfig: SearchConfig): string {
    const base = `${this.baseUrl}`;
    const { 
      query, 
      radius, 
      pageToken, 
      region = "NG", 
      keywords = ['market', 'stores', 'canteen', 'supermarket', 'grocery'], 
      types = ['grocery_or_supermarket', 'supermarket', 'food'] 
    } = searchConfig;
    
    const params = new URLSearchParams();
    params.append('location', `${coords.lat},${coords.lng}`);
    params.append('key', this.apiKey);
    
    if (pageToken) params.append('pagetoken', pageToken);
    if (region) params.append('region', region);

    if (query) {
      params.append('query', query);
      if (radius) params.append('radius', radius.toString());
      return `${base}/textsearch/json?${params.toString()}`;
    }

    if (!radius) {
      throw new Error('Nearby search requires radius parameter');
    }

    params.append('radius', radius.toString());
    params.append('keyword', keywords.join(' '));
    
    if (types.length > 0) {
      params.append('type', types[0]);
    }

    return `${base}/nearbysearch/json?${params.toString()}`;
  }

  private generateStaticMapUrl(location: { lat: number; lng: number }, mapConfig: MapConfig): string {
  
    const roundedLat = location.lat.toFixed(4)
    const roundedLng = location.lng.toFixed(4)
  
    const params = new URLSearchParams({
      lat: roundedLat,
      lng: roundedLng
    })
  
    return `https://sshunoitrbfjwjxvxtbd.supabase.co/functions/v1/static-map?${params.toString()}`
  }
  // private generateStaticMapUrl(location: { lat: number; lng: number }, mapConfig: MapConfig): string {
  //   const {
  //     width,
  //     height,
  //     zoom,
  //     format,
  //     mapType = 'roadmap',
  //     markerColor = 'red',
  //     markerSize = 'normal'
  //   } = mapConfig;

  //   const params = new URLSearchParams({
  //     center: `${location.lat},${location.lng}`,
  //     zoom: zoom.toString(),
  //     size: `${width}x${height}`,
  //     format,
  //     maptype: mapType,
  //     markers: `color:${markerColor}|size:${markerSize}|${location.lat},${location.lng}`,
  //     key: this.apiKey
  //   });

  //   return `https://maps.googleapis.com/maps/api/staticmap?${params.toString()}`;
  // }

  private generateCacheKey(coords: Coordinates, searchConfig: SearchConfig, mapConfig: MapConfig): string {
    const keyData = {
      lat: Math.round(coords.lat * 10000) / 10000, // Round to ~11m precision
      lng: Math.round(coords.lng * 10000) / 10000,
      radius: searchConfig.radius,
      query: searchConfig.query,
      types: searchConfig.types?.sort(),
      keywords: searchConfig.keywords?.sort(),
      minRating: searchConfig.minRating,
      openNow: searchConfig.openNow,
      priceLevel: searchConfig.priceLevel?.sort(),
      limit: searchConfig.limit
    };
    
    return `markets_${JSON.stringify(keyData)}`.replace(/\s/g, '');
  }

  private async getCachedResult(cacheKey: string): Promise<MarketWithMap[] | null> {
    try {
      const cached = await this.cacheManager.get(cacheKey) as any;
      if (cached) {
        const parsedData = JSON.parse(cached);
        if (parsedData.timestamp && Date.now() - parsedData.timestamp < this.cacheExpiration * 1000) {
          return parsedData.data;
        }
      }
    } catch (error) {
      this.logger(`Cache read error for key ${cacheKey}: ${error}`, 'warn');
    }
    return null;
  }

  private async cacheResult(cacheKey: string, data: MarketWithMap[]): Promise<void> {
    try {
      const cacheData = {
        data,
        timestamp: Date.now()
      };
      await this.cacheManager.set(cacheKey, JSON.stringify(cacheData), this.cacheExpiration);
    } catch (error) {
      this.logger(`Cache write error for key ${cacheKey}: ${error}`, 'warn');
    }
  }

  private async applyRateLimit(): Promise<void> {
    const now = Date.now();
    const timeSinceLastRequest = now - this.lastRequestTime;
    const minInterval = 1000 / this.requestsPerSecond;
    
    if (timeSinceLastRequest < minInterval) {
      const delay = minInterval - timeSinceLastRequest;
      await new Promise(resolve => setTimeout(resolve, delay));
    }
    
    this.lastRequestTime = Date.now();
  }

  private updateMetrics(startTime: number, isError: boolean): void {
    this.metrics.totalRequests++;
    if (isError) {
      this.metrics.errors++;
    }
    
    const responseTime = Date.now() - startTime;
    this.metrics.avgResponseTime = (this.metrics.avgResponseTime * (this.metrics.totalRequests - 1) + responseTime) / this.metrics.totalRequests;
    this.metrics.cacheHitRate = this.metrics.cacheHits / this.metrics.totalRequests;
  }

  private validateInputs(coords: Coordinates, searchConfig: SearchConfig, mapConfig: MapConfig): void {
    if (!coords || typeof coords.lat !== 'number' || typeof coords.lng !== 'number') {
      throw new Error('Valid coordinates (lat, lng) are required');
    }
    
    if (coords.lat < -90 || coords.lat > 90) {
      throw new Error('Latitude must be between -90 and 90');
    }
    
    if (coords.lng < -180 || coords.lng > 180) {
      throw new Error('Longitude must be between -180 and 180');
    }

    if (!searchConfig.radius || searchConfig.radius <= 0 || searchConfig.radius > 50000) {
      throw new Error('Radius must be between 1 and 50000 meters');
    }

    if (!mapConfig.width || !mapConfig.height || !mapConfig.zoom || !mapConfig.format) {
      throw new Error('Map config must include width, height, zoom, and format');
    }
    
    if (mapConfig.width > 4096 || mapConfig.height > 4096) {
      throw new Error('Map dimensions cannot exceed 4096x4096');
    }
  }

  private calculateDistance(from: Coordinates, to: { lat: number; lng: number }): number {
    const toRad = (value: number) => (value * Math.PI) / 180;
    const R = 6371000; // Earth's radius in meters
    const dLat = toRad(to.lat - from.lat);
    const dLon = toRad(to.lng - from.lng);
    const a = Math.sin(dLat / 2) ** 2 + 
              Math.cos(toRad(from.lat)) * Math.cos(toRad(to.lat)) * 
              Math.sin(dLon / 2) ** 2;
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return Math.round(R * c);
  }

  // Public utility methods
  public getMetrics(): SearchMetrics {
    return { ...this.metrics };
  }

  public async clearCache(): Promise<void> {
    try {
      // await this.cacheManager.clear();
      this.logger('Unable to  clear cache', 'info');
    } catch (error) {
      this.logger(`Failed to clear cache: ${error}`, 'error');
    }
  }

  public resetMetrics(): void {
    this.metrics = {
      totalRequests: 0,
      cacheHits: 0,
      cacheHitRate: 0,
      avgResponseTime: 0,
      errors: 0,
      quotaExceeded: 0
    };
    this.logger('Metrics reset', 'info');
  }
}