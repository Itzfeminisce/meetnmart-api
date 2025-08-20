export interface SystemCapabilities {
  actions: Record<string, ActionConfig>;
  data_sources: Record<string, DataSourceConfig>;
  location_services: LocationConfig;
  user_management: UserConfig;
}

export interface ActionConfig {
  description: string;
  required_entities: string[];
  data_dependencies: string[];
  user_types: string[];
}

export interface DataSourceConfig {
  description: string;
  fields: string[];
  filters: string[];
}

export interface LocationConfig {
  distance_calculation: boolean;
  geolocation_api: boolean;
  supported_areas: string[];
  radius_km: number;
}

export interface UserConfig {
  types: Record<string, UserTypeConfig>;
  preferences: string[];
  history_tracking: boolean;
}

export interface UserTypeConfig {
  capabilities: string[];
  default_actions: string[];
  restricted_actions: string[];
}

export const SYSTEM_CAPABILITIES: SystemCapabilities = {
  actions: {
    // Product Discovery
    search_products: {
      description: "Find products by name, category, or description",
      required_entities: ["product"],
      data_dependencies: ["products", "categories"],
      user_types: ["buyer", "seller"]
    },
    filter_by_location: {
      description: "Filter results by user location or specified area",
      required_entities: ["location"],
      data_dependencies: ["user_location", "seller_locations"],
      user_types: ["buyer"]
    },
    calculate_distances: {
      description: "Calculate distances between buyer and sellers",
      required_entities: ["location"],
      data_dependencies: ["user_location", "seller_locations"],
      user_types: ["buyer"]
    },
    get_nearby_sellers: {
      description: "Find sellers within specified radius",
      required_entities: ["location", "radius"],
      data_dependencies: ["seller_locations", "seller_ratings"],
      user_types: ["buyer"]
    },
    
    // Seller Management
    find_sellers: {
      description: "Search for sellers by product, rating, or location",
      required_entities: ["product"],
      data_dependencies: ["sellers", "seller_ratings", "seller_products"],
      user_types: ["buyer"]
    },
    get_seller_profile: {
      description: "Get detailed seller information",
      required_entities: ["seller_id"],
      data_dependencies: ["seller_profiles", "seller_ratings", "seller_reviews"],
      user_types: ["buyer", "delivery_partner"]
    },
    recommend_sellers: {
      description: "AI-powered seller recommendations based on user history",
      required_entities: ["product"],
      data_dependencies: ["user_history", "seller_ratings", "seller_match_score"],
      user_types: ["buyer"]
    },
    
    // Order Management
    create_order: {
      description: "Create new order with selected products and seller",
      required_entities: ["product", "seller_id", "quantity"],
      data_dependencies: ["product_pricing", "seller_availability"],
      user_types: ["buyer"]
    },
    track_order: {
      description: "Get order status and delivery updates",
      required_entities: ["order_id"],
      data_dependencies: ["order_status", "delivery_tracking"],
      user_types: ["buyer", "seller", "delivery_partner"]
    },
    update_order: {
      description: "Modify existing order (quantity, delivery address)",
      required_entities: ["order_id"],
      data_dependencies: ["order_details", "modification_rules"],
      user_types: ["buyer"]
    },
    cancel_order: {
      description: "Cancel order with reason",
      required_entities: ["order_id", "reason"],
      data_dependencies: ["order_status", "cancellation_policy"],
      user_types: ["buyer", "seller"]
    },
    
    // User Account
    update_profile: {
      description: "Update user profile information",
      required_entities: ["profile_field", "new_value"],
      data_dependencies: ["user_profile"],
      user_types: ["buyer", "seller", "delivery_partner"]
    },
    get_order_history: {
      description: "Retrieve user's past orders",
      required_entities: [],
      data_dependencies: ["user_orders", "order_details"],
      user_types: ["buyer", "seller"]
    },
    save_preferences: {
      description: "Save user shopping preferences",
      required_entities: ["preferences"],
      data_dependencies: ["user_profile"],
      user_types: ["buyer"]
    },
    
    // Delivery Management
    assign_delivery: {
      description: "Assign delivery partner to order",
      required_entities: ["order_id", "delivery_partner_id"],
      data_dependencies: ["delivery_partners", "delivery_routes"],
      user_types: ["seller", "admin"]
    },
    optimize_route: {
      description: "Calculate optimal delivery route",
      required_entities: ["delivery_addresses"],
      data_dependencies: ["delivery_locations", "traffic_data"],
      user_types: ["delivery_partner"]
    },
    update_delivery_status: {
      description: "Update delivery progress",
      required_entities: ["order_id", "status"],
      data_dependencies: ["delivery_tracking"],
      user_types: ["delivery_partner"]
    },
    
    // Communication
    contact_seller: {
      description: "Connect buyer with seller",
      required_entities: ["seller_id"],
      data_dependencies: ["seller_contact", "communication_preferences"],
      user_types: ["buyer"]
    },
    send_notification: {
      description: "Send updates to user",
      required_entities: ["user_id", "message"],
      data_dependencies: ["notification_preferences"],
      user_types: ["system"]
    },
    
    // Analytics & Support
    log_interaction: {
      description: "Track user interactions for analytics",
      required_entities: ["interaction_type"],
      data_dependencies: ["user_analytics"],
      user_types: ["system"]
    },
    create_support_ticket: {
      description: "Create customer support request",
      required_entities: ["issue_type", "description"],
      data_dependencies: ["support_categories"],
      user_types: ["buyer", "seller", "delivery_partner"]
    }
  },

  data_sources: {
    products: {
      description: "Product catalog with details",
      fields: ["id", "name", "category", "description", "images", "base_price"],
      filters: ["category", "price_range", "availability"]
    },
    categories: {
      description: "Product categories and subcategories",
      fields: ["id", "name", "parent_category", "product_count"],
      filters: ["level", "popularity"]
    },
    sellers: {
      description: "Seller profiles and business info",
      fields: ["id", "name", "business_name", "location", "contact", "verification_status"],
      filters: ["location", "rating", "verification_status", "product_categories"]
    },
    seller_products: {
      description: "Products offered by each seller",
      fields: ["seller_id", "product_id", "price", "stock", "availability"],
      filters: ["seller_id", "product_id", "availability"]
    },
    seller_ratings: {
      description: "Seller ratings and reviews",
      fields: ["seller_id", "average_rating", "total_reviews", "recent_reviews"],
      filters: ["rating_range", "review_date"]
    },
    user_orders: {
      description: "User order history",
      fields: ["order_id", "user_id", "products", "seller_id", "status", "date"],
      filters: ["user_id", "date_range", "status", "seller_id"]
    },
    user_location: {
      description: "User's current or saved locations",
      fields: ["user_id", "latitude", "longitude", "address", "location_name"],
      filters: ["user_id", "location_type"]
    },
    seller_locations: {
      description: "Seller business locations",
      fields: ["seller_id", "latitude", "longitude", "address", "service_radius"],
      filters: ["seller_id", "location_area"]
    },
    delivery_tracking: {
      description: "Real-time delivery status",
      fields: ["order_id", "delivery_partner_id", "status", "location", "eta"],
      filters: ["order_id", "delivery_partner_id", "status"]
    }
  },

  location_services: {
    distance_calculation: true,
    geolocation_api: true,
    supported_areas: [
      "Ondo", "Oyo", "Ekiti",  "Lagos", "Abuja", "Port Harcourt", "Kano", "Ibadan", 
      "Benin City", "Kaduna", "Jos", "Ilorin", "Warri"
    ],
    radius_km: 50
  },

  user_management: {
    types: {
      buyer: {
        capabilities: ["search", "order", "track", "rate", "communicate"],
        default_actions: ["search_products", "find_sellers", "track_order"],
        restricted_actions: ["assign_delivery", "update_seller_profile"]
      },
      seller: {
        capabilities: ["manage_products", "process_orders", "communicate", "analytics"],
        default_actions: ["get_orders", "update_order_status", "manage_inventory"],
        restricted_actions: ["search_products", "create_order"]
      },
      delivery_partner: {
        capabilities: ["pickup", "deliver", "track", "communicate"],
        default_actions: ["get_assigned_orders", "update_delivery_status", "optimize_route"],
        restricted_actions: ["create_order", "manage_products"]
      }
    },
    preferences: [
      "preferred_sellers", "favorite_products", "delivery_address", 
      "notification_settings", "payment_methods", "language"
    ],
    history_tracking: true
  }
};