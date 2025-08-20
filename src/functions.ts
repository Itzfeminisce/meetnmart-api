import { logger } from "./logger";
import { InternalServerError } from "./utils/responses";
import { supabaseClient } from "./utils/supabase";


export const updateUserProfileById = async (userId: string, record: Record<string, any>) => {
  const { data, error } = await supabaseClient
    .from('profiles')
    .update(record)
    .eq('id', userId);


  if (error) {
    throw new Error(error.message || "Supabase update failed");
  }

  return data;
};



export interface UtilParam {
  client: Express.Request['client']
  user: Express.Request['user']
  param: {
    search_term: string,
    pagination: {
      from: number;
      to: number;

    }
  }
}

export async function searchSellers(arg: UtilParam) {
  const { data: results, error, count } = await arg.client
    .from('profiles')
    .select(`
    id,
    name,
    avatar,
    description,
    is_online,
    is_reachable,
    products (
      id,
      description,
      name,
      in_stock,
      image
    )
  `, { count: 'exact' }) // get total result count
    .or(`name.ilike.%${arg.param.search_term}%,description.ilike.%${arg.param.search_term}%`)
    .range(arg.param.pagination.from, arg.param.pagination.to);

  if (error) {
    console.error("Failed to find sellers by search term.", { error })
    logger.error("Error when finding sellers for search term", error, arg.param)
  }

  return {
    data: results,
    count,
  }
}


export async function searchProducts(arg: UtilParam) {
  const { data: results, error, count } = await arg.client
    .from('products')
    .select(`
        id,
        name,
        description,
        seller_id,
        image,
        in_stock,
        profiles (
          id,
          name,
          avatar,
          is_online,
          is_reachable
        )
      `, { count: 'exact' }) // this lets us know the total number of matches
    .eq('in_stock', true)
    .or(`description.ilike.%${arg.param.search_term}%,name.ilike.%${arg.param.search_term}%`)
    .range(arg.param.pagination.from, arg.param.pagination.to);

  if (error) {
    console.error("Failed to find products by search term.", { error })
    logger.error("Error when finding products for search term", error, arg.param)
  }
  return {
    data: results,
    count,
  }
}

export async function searchFeeds(arg: UtilParam) {
  const { data: results, count, error } = await arg.client
    .from('feeds')
    .select(`
        id,
        title,
        content,
        images
      `, { count: 'exact' }) // get total row count for pagination
    .or(`title.ilike.%${arg.param.search_term}%,content.ilike.%${arg.param.search_term}%,location.ilike.%${arg.param.search_term}%`)
    .range(arg.param.pagination.from, arg.param.pagination.to);

  if (error) {
    console.error("Failed to find feeds by search term.", { error })
    logger.error("Error when finding feeds for search term", error, arg.param)
  }
  return {
    data: results,
    count,
  }
}


interface CreateOrSendMessagePayload {
  to: string; // User ID of the recipient
  message: string; // Message content
}

export async function createOrSendMessage(validPayload: CreateOrSendMessagePayload,
  client: any, userId: string) {


  const { data, error } = await client.rpc("create_or_send_message", {
    p_user1: userId,
    p_user2: validPayload.to,
    p_content: validPayload.message,
    p_type: "text",
  })

  if (error) {
    console.error("Error creating conversation:", error);
    logger.error("Error creating conversation or sending message", error, {
      userId,
      validPayload
    });
  }

  return data
}
export async function markConversationAsRead(conversationId: string,
  client: any, userId: string) {

  const { data, error, } = await supabaseClient.from("conversation_participants")
    .update({ unread_count: 0, last_seen_at: new Date().toISOString() }) // ensure ISO string for timestamp
    .eq("conversation_id", conversationId)
    .eq("user_id", userId)

  if (error) {
    console.error("Error marking conversation as read:", error);
    logger.error("Error marking conversation as read", error, {
      conversationId,
      userId
    });
  }

  return data;
}