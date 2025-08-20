import { Whispa } from "./Whispa";

const whispa = new Whispa();

const result = whispa.process({
  text: "Abeg find me good rice seller for Lekki area",
  user_id: "buyer123",
  user_type: "buyer",
  location: { latitude: 6.4474, longitude: 3.4106, address: "Lekki Phase 1" },
//   context: { recent_orders: [...], preferences: {...} }
});

// AI returns:
// {
//   intent: "search_products",
//   entities: { product: "rice", location: "Lekki", quality: "good" },
//   response: "I'll find top-rated rice sellers in Lekki for you!",
//   actions: [
//     { name: "search_products", params: { product: "rice" }, priority: 1 },
//     { name: "filter_by_location", params: { area: "Lekki" }, priority: 2 },
//     { name: "calculate_distances", params: { user_location: "..." }, priority: 3 }
//   ],
//   data_requests: [
//     { source: "sellers", filters: { product_category: "grains", near_location: {...} }},
//     { source: "seller_ratings", filters: { minimum_rating: 4.0 }}
//   ]
// }