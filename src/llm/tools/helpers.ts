import { User } from "../type";

  // Helper methods
 export function calculateDistance(pos1: { lat: number, lng: number }, pos2: { lat: number, lng: number }): number {
    const R = 6371;
    const dLat = (pos2.lat - pos1.lat) * Math.PI / 180;
    const dLng = (pos2.lng - pos1.lng) * Math.PI / 180;
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(pos1.lat * Math.PI / 180) * Math.cos(pos2.lat * Math.PI / 180) *
      Math.sin(dLng / 2) * Math.sin(dLng / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }

 export function isWithinBounds(location: { lat: number, lng: number }, bounds: { north: number, south: number, east: number, west: number }): boolean {
    return location.lat <= bounds.north &&
      location.lat >= bounds.south &&
      location.lng <= bounds.east &&
      location.lng >= bounds.west;
  }

 export function getRecommendationReasons(seller: User, distance: number, categoryMatches: number, productCount: number): string[] {
    const reasons = [];
    if (seller.rating && seller.rating >= 4) reasons.push('High rated seller');
    if (seller.verified) reasons.push('Verified seller');
    if (distance <= 2) reasons.push('Very close to you');
    if (categoryMatches > 0) reasons.push('Sells your preferred categories');
    if (productCount >= 10) reasons.push('Wide product selection');
    return reasons;
  }
