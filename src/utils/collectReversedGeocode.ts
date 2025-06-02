export async function collectReverseGeocode({ lng, lat }: { lng: number; lat: number }): Promise<{
    address: string;
    components?: {
      road?: string;
      neighbourhood?: string;
      suburb?: string;
      city?: string;
      state?: string;
      country?: string;
      postcode?: string;
    };
  }> {
    const endpoint = `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json`;
  
    try {
      const res = await fetch(endpoint, {
        headers: {
          'User-Agent': 'MeetnMartBot/1.0 (contact@meetnmart.com)', // REQUIRED
        },
      });
  
      if (!res.ok) {
        throw new Error(`Nominatim error: ${res.statusText}`);
      }
  
      const json = await res.json() as any
  
      return {
        address: json.display_name,
        components: {
          road: json.address?.road,
          neighbourhood: json.address?.neighbourhood,
          suburb: json.address?.suburb,
          city: json.address?.city || json.address?.town || json.address?.village,
          state: json.address?.state,
          country: json.address?.country,
          postcode: json.address?.postcode,
        },
      };
    } catch (err) {
      console.error('Reverse geocode failed:', err);
      return {
        address: 'Unknown location',
      };
    }
  }
  