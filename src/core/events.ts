import { GetNearbySellerResponse } from "../globals";
import { logger } from "../logger";
import { eventManager } from "../utils/eventUtils";
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
