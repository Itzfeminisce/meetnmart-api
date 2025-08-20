import { searchFeeds, searchProducts, searchSellers } from "../functions";
import { GetNearbySellerResponse } from "../globals";
import { logger } from "../logger";
import { cacheService } from "../utils/cacheUtils";
import { eventManager } from "../utils/eventUtils";
import { getSocketIO } from "../utils/socketio";
import { generateCacheKey } from "./cacheKeyStrategy";
import { generateMarketNotification } from "./notification.messages";
import { NotificationHandler } from "./notification/handler";
import { Notification, NotificationChannel } from "./notification/types";

eventManager.on(
  "notification:notify_non_reachable_sellers_new_buyer_joins",
  async (payload: { availableSellers: GetNearbySellerResponse[]; buyerId: string }) => {

    const { availableSellers, buyerId } = payload;

    // Sort priority logic
    const sortedSellers = availableSellers
      .sort((a, b) =>
        Number(b.seller_status.is_premium) - Number(a.seller_status.is_premium) ||
        Number(b.seller_status.is_verified) - Number(a.seller_status.is_verified) ||
        Number(b.seller_status.is_reachable) - Number(a.seller_status.is_reachable)
      )
      .slice(0, 5); // Take top 5 sellers

    const notification = new NotificationHandler();

    const notificationsPayload = sortedSellers.map((seller) => {
      const isPremium = seller.seller_status.is_premium;

      const channels: NotificationChannel[] = [
        ...(isPremium ? ["email"] as NotificationChannel[] : []),
        "firebase",
        "in-app"
      ];

      const { title, description } = generateMarketNotification({
        seller_status: {
          is_premium: seller.seller_status.is_premium,
          is_reachable: seller.seller_status.is_reachable,
          is_verified: seller.seller_status.is_verified
        }
      });


      const notificationPayload: Notification = {
        recipient_id: seller.seller_id,
        sender_id: buyerId,
        title,
        type: "system",
        description,
        metadata: {
          buyerId,
        }
      };


      return notification.sendNotification(notificationPayload, channels);
    });

    logger.info("Dispatching notifications to top sellers", {
      buyerId,
      count: notificationsPayload.length
    });

    const response = await Promise.all(notificationsPayload);

    logger.info("Notification dispatch complete", {
      successCount: response.length,
      response
    });
  }
);


interface TriggerHandleSearchExpandedResultsProps {
  client: Express.Request['client']
  user: Express.Request['user']
  params: {
    user_lat: number,
    user_lng: number,
    radius_meters: string,
    search_term: string | null,
    page: number,
    per_page: number,
  }
}
eventManager.on("trigger_handle_search_expanded_results", async (payload: TriggerHandleSearchExpandedResultsProps) => {
  const { client, user, params } = payload;

  const page = params.page ?? 1;
  const pageSize = params.per_page ?? 20;
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;
  const searchTerm = params.search_term?.trim();

  const response: any[] = [];
  const socket = getSocketIO();
  const socketId = await socket.getSocketId(user.id);

  if (!searchTerm) {
    socket.getIO().to(socketId).emit("search_expanded_results", response);
    return;
  }

  // Run both searches in parallel
  const [
    productResultPromise,
    sellerResultPromise,
    feedResultPromise,
  ] = await Promise.allSettled([
    searchProducts({
      client,
      user,
      param: { search_term: searchTerm, pagination: { from, to } }
    }),
    searchSellers({
      client,
      user,
      param: { search_term: searchTerm, pagination: { from, to } }
    }),
    searchFeeds({
      client,
      user,
      param: { search_term: searchTerm, pagination: { from, to } }
    }),
  ]);

  // Handle product result
  if (productResultPromise.status === 'fulfilled') {
    const { data: products, count: productCount } = productResultPromise.value;

    const product_results = {
      data: products,
      meta: {
        page,
        per_page: pageSize,
        total_pages: Math.ceil(productCount / pageSize),
        has_next_page: page < Math.ceil(productCount / pageSize),
        has_prev_page: page > 1,
      },
    };

    const productCacheKey = generateCacheKey(`${searchTerm}:${page}`, {
      base: "product_search_result:"
    });

    await cacheService.set(productCacheKey, product_results);

    response.push({
      type: `Product${product_results.meta.total_pages > 1 ? "s" : ""}`,
      id: "PRODUCT",
      count: product_results.meta.total_pages,
      key: productCacheKey,
    });
  }

  // Handle seller result
  if (sellerResultPromise.status === 'fulfilled') {
    const { data: sellers, count: sellerCount } = sellerResultPromise.value;


    const seller_results = {
      data: sellers,
      meta: {
        page,
        per_page: pageSize,
        total_pages: Math.ceil(sellerCount / pageSize),
        has_next_page: page < Math.ceil(sellerCount / pageSize),
        has_prev_page: page > 1,
      },
    };


    const sellerCacheKey = generateCacheKey(`${searchTerm}:${page}`, {
      base: "seller_search_result:"
    });

    await cacheService.set(sellerCacheKey, seller_results);

    response.push({
      type: `Seller${seller_results.meta.total_pages > 1 ? "s" : ""}`,
      id: "SELLER",
      count: seller_results.meta.total_pages,
      key: sellerCacheKey,
    });
  }


  if (feedResultPromise.status === 'fulfilled') {
    const { data: feeds, count: feedCount } = feedResultPromise.value;


    const feed_results = {
      data: feeds,
      meta: {
        page,
        per_page: pageSize,
        total_pages: Math.ceil(feedCount / pageSize),
        has_next_page: page < Math.ceil(feedCount / pageSize),
        has_prev_page: page > 1,
      },
    };

    const feedCacheKey = generateCacheKey(`${searchTerm}:${page}`, {
      base: "feed_search_result:"
    });

    await cacheService.set(feedCacheKey, feed_results);

    response.push({
      type: `Feed${feed_results.meta.total_pages > 1 ? "s" : ""}`,
      id: "FEED",
      count: feed_results.meta.total_pages,
      key: feedCacheKey,
    });
  }

  socket.getIO().to(socketId).emit("search_expanded_results", response);
});



