import axios, { AxiosInstance } from 'axios';

function getEnvVar(key: string): string {
  const value = process.env[key];
  if (!value) {
    throw new Error(`Environment variable ${key} is not set`);
  }
  return value;
}

interface Coordinates {
  lat: number;
  lng: number;
}

interface NearbyPlace {
  place_id: string;
  osm_id: string;
  osm_type: string;
  licence: string;
  lat: string;
  lon: string;
  display_name: string;
  class: string;
  type: string;
  importance: number;
  icon?: string;
  address?: Record<string, string>;
  distance?: number;
}

interface StaticMapConfig {
  width: number;
  height: number;
  zoom: number;
  format: 'png' | 'jpg';
  maptype?: 'streets' | 'satellite' | 'hybrid' | 'dark' | 'light';
  markers?: Array<{
    lat: number;
    lng: number;
    size: 'small' | 'medium' | 'large';
    color: 'blue' | 'gray' | 'red' | 'yellow' | 'orange' | 'green' | 'purple';
  }>;
}

interface PlaceWithMap extends NearbyPlace {
  staticMapUrl: string;
}

interface LocationIQConfig {
  apiKey?: string;
  baseUrl?: string;
  timeout?: number;
}

interface SearchConfig {
  radius: number; // in meters
  tag: string; // single tag like 'supermarket' or 'marketplace'
  limit?: number;
  format?: 'json' | 'xml';
}

export class LocationIQMarketsService {
  private readonly client: AxiosInstance;
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly staticMapBaseUrl: string;

  constructor(config: LocationIQConfig = {}) {
    this.apiKey = config.apiKey || getEnvVar("LOCATION_IQ_PK_KEY");
    this.baseUrl = config.baseUrl || 'https://us1.locationiq.com/v1';
    this.staticMapBaseUrl = 'https://maps.locationiq.com/v3';
    
    console.log('Initializing LocationIQ service with base URL:', this.baseUrl);
    
    this.client = axios.create({
      baseURL: this.baseUrl,
      timeout: config.timeout || 10000,
      headers: {
        'Content-Type': 'application/json',
      },
    });
  }

  async findMarketsNearby(
    coordinates: Coordinates,
    searchConfig: SearchConfig,
    mapConfig: StaticMapConfig
  ): Promise<PlaceWithMap[]> {
    try {
      console.log('Finding markets near coordinates:', coordinates);
      console.log('Search config:', searchConfig);
      
      const places = await this.searchNearbyPlaces(coordinates, searchConfig);
      console.log(`Found ${places.length} places`);
      
      const placesWithMaps = places.map(place => {
        const staticMapUrl = this.generateStaticMapUrl(
          { lat: parseFloat(place.lat), lng: parseFloat(place.lon) },
          mapConfig
        );
        
        return {
          ...place,
          staticMapUrl,
        };
      });

      console.log('Successfully generated static maps for all places');
      return placesWithMaps;
    } catch (error) {
      console.error('Error finding markets:', error);
      throw new Error(`Failed to find markets: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  private async searchNearbyPlaces(
    coordinates: Coordinates,
    config: SearchConfig
  ): Promise<NearbyPlace[]> {
    try {
      // Validate coordinates
      if (!coordinates.lat || !coordinates.lng || 
          Math.abs(coordinates.lat) > 90 || Math.abs(coordinates.lng) > 180) {
        throw new Error(`Invalid coordinates: lat=${coordinates.lat}, lng=${coordinates.lng}`);
      }

      const params = new URLSearchParams({
        key: this.apiKey,
        lat: coordinates.lat.toString(),
        lon: coordinates.lng.toString(),
        // tag: config.tag,
        // radius: config.radius.toString(),
        // format: config.format || 'json',
        // ...(config.limit && { limit: config.limit.toString() }),
      });

      const url = `/nearby?${params.toString()}`;
      console.log('Making request to:', `${this.baseUrl}${url}`);
      console.log('Request params:', Object.fromEntries(params.entries()));
      
      const response = await this.client.get(url);
      console.log('Response status:', response.status);
      console.log('Response data:', response.data);
      
      if (!response.data) {
        throw new Error('No data received from LocationIQ API');
      }

      // Handle both array and single object responses
      const places = Array.isArray(response.data) ? response.data : [response.data];
      
      return places.map((item: any) => ({
        place_id: item.place_id,
        osm_id: item.osm_id,
        osm_type: item.osm_type,
        licence: item.licence,
        lat: item.lat,
        lon: item.lon,
        display_name: item.display_name,
        class: item.class,
        type: item.type,
        importance: item.importance,
        icon: item.icon,
        address: item.address,
        distance: this.calculateDistance(
          coordinates,
          { lat: parseFloat(item.lat), lng: parseFloat(item.lon) }
        ),
      }));
    } catch (error) {
      console.error('Error in searchNearbyPlaces:', error);
      if (axios.isAxiosError(error)) {
        console.error('Request details:', {
          url: error.config?.url,
          method: error.config?.method,
          status: error.response?.status,
          statusText: error.response?.statusText,
          data: error.response?.data,
        });
      }
      throw error;
    }
  }

  private generateStaticMapUrl(
    center: Coordinates,
    config: StaticMapConfig
  ): string {
    const params = new URLSearchParams({
      key: this.apiKey,
      center: `${center.lat},${center.lng}`,
      zoom: config.zoom.toString(),
      size: `${config.width}x${config.height}`,
      format: config.format,
      ...(config.maptype && { maptype: config.maptype }),
    });

    // Add markers
    if (config.markers && config.markers.length > 0) {
      const markersParam = config.markers
        .map(marker => 
          `size:${marker.size}|color:${marker.color}|${marker.lat},${marker.lng}`
        )
        .join('|');
      params.append('markers', markersParam);
    } else {
      // Default marker at center
      params.append('markers', `size:medium|color:red|${center.lat},${center.lng}`);
    }

    const url = `${this.staticMapBaseUrl}/staticmap?${params.toString()}`;
    console.log('Generated static map URL:', url);
    return url;
  }

  private calculateDistance(point1: Coordinates, point2: Coordinates): number {
    const R = 6371e3; // Earth's radius in meters
    const φ1 = (point1.lat * Math.PI) / 180;
    const φ2 = (point2.lat * Math.PI) / 180;
    const Δφ = ((point2.lat - point1.lat) * Math.PI) / 180;
    const Δλ = ((point2.lng - point1.lng) * Math.PI) / 180;

    const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
              Math.cos(φ1) * Math.cos(φ2) *
              Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    return R * c;
  }

  // Static factory methods
  static createDefaultMapConfig(overrides: Partial<StaticMapConfig> = {}): StaticMapConfig {
    return {
      width: 400,
      height: 300,
      zoom: 15,
      format: 'png',
      maptype: 'streets',
      ...overrides,
    };
  }

  static createDefaultSearchConfig(overrides: Partial<SearchConfig> = {}): SearchConfig {
    return {
      radius: 1000, // 1km default
      tag: 'supermarket', // Use single tag
      limit: 10,
      format: 'json',
      ...overrides,
    };
  }
}

// Usage example:
/*
const service = new LocationIQMarketsService();

const userCoordinates = { lat: 40.7128, lng: -74.0060 };
const searchConfig = LocationIQMarketsService.createDefaultSearchConfig({
  radius: 2000,
  tag: 'marketplace',
  limit: 5
});
const mapConfig = LocationIQMarketsService.createDefaultMapConfig({
  width: 600,
  height: 400,
  zoom: 14
});

const markets = await service.findMarketsNearby(
  userCoordinates,
  searchConfig,
  mapConfig
);
*/