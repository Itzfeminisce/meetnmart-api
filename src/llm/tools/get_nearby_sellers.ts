import { ActionContext } from "../type";
import { products, users } from "./data";
import { calculateDistance } from "./helpers";

export const get_nearby_sellers = async (params: any, context: ActionContext) => {

    const sellers = users
        .filter(u => u.type === 'seller')
        .map(seller => {
            const distance = calculateDistance({ lat: context.user.lat, lng: context.user.lng }, seller.location);
            const sellerProducts = products
                .filter(p => p.sellerId === seller.id && p.available);

            return {
                ...seller,
                distance,
                productCount: sellerProducts.length,
                categories: [...new Set(sellerProducts.map(p => p.category))],
                hasCategory: params.category ? sellerProducts.some(p => p.category === params.category) : true
            };
        })
        .filter(s => {
            if (s.distance > params.maxDistance) return false;
            if (params.minRating && (!s.rating || s.rating < params.minRating)) return false;
            if (params.category && !s.hasCategory) return false;
            return true;
        })
        .sort((a, b) => a.distance - b.distance);

    return {
        sellers,
        count: sellers.length,
        searchRadius: params.maxDistance
    };
}