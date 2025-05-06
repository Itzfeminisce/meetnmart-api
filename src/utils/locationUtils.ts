import { logger } from "../logger";
import { cacheService } from "./cacheUtils";
import axios from "axios";

type LocationMetadata = any

/**
 * Fetches detailed location information from a remote IP geolocation service with caching
 * @param ip - The IP address to get location for
 * @returns Promise containing detailed location information or null if not found
 */
export const getLocationByIp = async (ip: string): Promise<LocationMetadata | null> => {
    try {
        // Generate cache key for detailed location
        const cacheKey = `location:${ip}`;
        
        // Try to get from cache first
        const cachedLocation = await cacheService.get(cacheKey);
        if (cachedLocation) {
            logger.info(`Cache hit for detailed location: ${ip}`);
            return cachedLocation as LocationMetadata;
        }

        logger.info(`Fetching detailed location for IP: ${ip}`);
        const response = await axios.get(`https://ipapi.co/${ip}/json/`);
        
        if (response.data) {
            const locationData: LocationMetadata = {
                location: `${response.data.city}, ${response.data.country_name}`,
                city: response.data.city,
                country: response.data.country_name,
                region: response.data.region,
                latitude: response.data.latitude,
                longitude: response.data.longitude,
                timezone: response.data.timezone,
                isp: response.data.org,
                device: response.data.device || 'Unknown',
                browser: response.data.browser || 'Unknown'
            };
            
            // Cache the result for 24 hours
            await cacheService.set(cacheKey, locationData, 86400);
            logger.info(`Cached detailed location for IP: ${ip}`);
            
            return locationData;
        }
        
        return null;
    } catch (error) {
        logger.error(`Error fetching detailed location for IP ${ip}:`, error);
        return null;
    }
};
