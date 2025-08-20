import { createClient, SupabaseClient, } from '@supabase/supabase-js'
import { getEnvVar } from './env'
import { getSocketIO } from './socketio'
import { NextFunction, Request, Response } from 'express'
import { Unauthorized } from './responses'
import { DATABASE_CACHE_TABLE_NAME } from './cacheUtils'
import { CallAction } from '../events'

const supabaseClient = createClient(
  getEnvVar("SUPABASE_URL"),
  getEnvVar("SUPABASE_SERVICE_ROLE_KEY")
)

// Separate channels for different event types
const notificationChannel = supabaseClient.channel('events:notifications');
const userPresenceChannel = supabaseClient.channel('events:user_presence');
const marketChannel = supabaseClient.channel('events:markets');
const profileChannel = supabaseClient.channel('events:profiles');
const conversationChannel = supabaseClient.channel('events:conversations');
const messagesChannel = supabaseClient.channel('events:messages');

export const setupSupabaseRealtime = () => {
  console.log('🔄 Setting up Supabase realtime...');

  // Early return if no SocketIO
  if (!getSocketIO) return () => (req: Request, res: Response, next: NextFunction) => next();

  // // Setup notification channel with user-specific filtering
  // const setupNotificationChannel = (userId?: string) => {
  //   const filter = userId ? `recipient_id=eq.${userId}` : undefined;

  //   notificationChannel.on(
  //     'postgres_changes',
  //     {
  //       event: 'INSERT',
  //       schema: 'public',
  //       table: 'notifications',
  //       filter,
  //     },
  //     (payload) => {
  //       console.log('📬 New notification received:', payload.new);
  //       const socketData = {
  //         evt: "refetch",
  //         val: payload.new,
  //         userId: payload.new?.recipient_id
  //       };

  //       console.log({socketData});


  //       // if (userId) {
  //       //   // Send to specific user
  //       //   getSocketIO().getIO().to(`user:${userId}`).emit("notification:insert", socketData);
  //       // } else {
  //       //   // Broadcast to all
  //       //   getSocketIO().broadcast("notification:insert", socketData);
  //       // }
  //     }
  //   );
  // };

  const socket = getSocketIO()
 
  // Setup notification channel
  conversationChannel
    .on('postgres_changes', {
      event: 'UPDATE',
      schema: 'public',
      table: 'conversation_participants',
      filter: 'unread_count=gt.0'
    }, async (payload) => {
      console.log('💬 New conversation created:', payload.new)
      
        const recipientId = payload.new?.user_id
        const recipientSocketId = await socket.getSocketId(recipientId)

        if (recipientSocketId) {
          socket.getIO().to(recipientSocketId).emit(CallAction.IncomingChat, "refetch")
        }
      // const recipientId = payload.new?.user2_id // Assuming user2 is the recipient
      // Get recipient's socket ID
      // const recipientSocketId = await socket.getSocketId(recipientId);

    })
  // Setup user presence channel
  notificationChannel
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'notifications',
        // filter,
      },
      async (payload) => {
        // console.log('📬 New notification received:', payload.new.id);

        const recipientId = payload.new?.recipient_id
        const recipientSocketId = await socket.getSocketId(recipientId)

        if (recipientSocketId) {
          socket.getIO().to(recipientSocketId).emit("notification:insert", payload.new)
        }
      })


  userPresenceChannel
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: DATABASE_CACHE_TABLE_NAME,
        filter: 'column_name=eq.socket'
      },
      async (payload) => {
        console.log('🔌 User joined event:', payload.new);
        socket.broadcast("events:user_joined", {
          evt: "refetch",
          userId: payload.new?.user_id,
          action: "joined"
        });
      }
    )
    .on(
      'postgres_changes',
      {
        event: 'DELETE',
        schema: 'public',
        table: DATABASE_CACHE_TABLE_NAME,
        filter: 'column_name=eq.socket'
      },
      async (payload) => {
        console.log('🔌 User left event:', payload.old);
        socket.broadcast("events:user_left", {
          evt: "refetch",
          userId: payload.old?.user_id,
          action: "left"
        });
      }
    );

  // Setup market channel
  marketChannel
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'markets' },
      async (payload) => {
        console.log('🏪 New market added:', payload.new);
        socket.broadcast("markets:new_market_added", {
          evt: "refetch",
          val: payload.new,
          marketId: payload.new?.id
        });
      }
    );

  // Setup profile channel
  profileChannel
    .on(
      'postgres_changes',
      { event: 'UPDATE', schema: 'public', table: 'profiles' },
      (payload) => {
        // console.log('👤 Profile updated:', payload.new?.id);
        // const socketData = {
        //   evt: "refetch:is_reachable",
        //   val: {
        //     old: payload.old,
        //     new: payload.new
        //   },
        //   userId: payload.new?.id
        // };

        // Broadcast profile update
        socket.broadcast("profiles:update", "refetch");

        // Also emit to specific user's room if they're connected
        // if (payload.new?.id) {
        //   socket.getIO().to(`user:${payload.new.id}`).emit("profiles:self_update", socketData);
        // }
      }
    );

  // Subscribe to all channels
  notificationChannel.subscribe();
  userPresenceChannel.subscribe();
  marketChannel.subscribe();
  profileChannel.subscribe();
  conversationChannel.subscribe();

  // Middleware to register user-specific event handlers
  // const registerSupabaseEventHandler = (req: Request, res: Response, next: NextFunction) => {
  //   const user = req.user;

  //   if (user?.id) {
  //     // Setup user-specific notification channel
  //     setupNotificationChannel(user.id);

  //     // Join user to their specific room for targeted events
  //     if (getSocketIO) {
  //       // This would typically be done in your socket connection handler
  //       console.log(`User ${user.id} registered for realtime events`);
  //     }
  //   }

  //   next();
  // };

  // return registerSupabaseEventHandler;
};

export async function getSupabaseClient(request: Request): Promise<SupabaseClient<any, "public", any>> {
  // Extract access token properly
  let accessToken = request.headers.authorization ?? ''
  if (accessToken.startsWith('Bearer ')) {
    accessToken = accessToken.substring(7) // Remove 'Bearer ' prefix
  }

  const refreshToken = (request.headers['x-supabase-refresh'] ?? '') as string

  if (!(accessToken && refreshToken)) {
    throw new Unauthorized('Unauthorized Access. Not logged in');
  }

  // Validate token format (basic JWT structure check)
  const jwtPattern = /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/
  if (!jwtPattern.test(accessToken)) {
    console.error('Invalid access token format')
    throw new Unauthorized('Invalid token format');
  }

  // Use ANON key instead of SERVICE_ROLE_KEY for user sessions
  const supabaseClient = createClient(
    getEnvVar("SUPABASE_URL"),
    getEnvVar("SUPABASE_ANON_KEY") // Changed from SUPABASE_SERVICE_ROLE_KEY
  )

  try {
    // Set the session with the tokens
    const { error } = await supabaseClient.auth.setSession({
      access_token: accessToken,
      refresh_token: refreshToken
    })

    if (error) {
      console.error('Error setting session:', error)
      throw new Unauthorized(`Session error: ${error.message}`);
    }

    // Verify the session is active
    const { data: { user }, error: userError } = await supabaseClient.auth.getUser()
    if (userError || !user) {
      console.error('Error getting user:', userError)
      throw new Unauthorized('No active user session');
    }

    console.log('Session set successfully for user:', user.id)
    return supabaseClient

  } catch (error) {
    console.error('Supabase client error:', error)
    if (error.message?.includes('JWT')) {
      throw new Unauthorized('Invalid or expired token');
    }
    throw error
  }
}

export { supabaseClient }

// import { createClient, SupabaseClient, } from '@supabase/supabase-js'
// import { getEnvVar } from './env'
// import { getSocketIO } from './socketio'
// import { NextFunction, Request, Response } from 'express'
// import { Unauthorized } from './responses'
// import { DATABASE_CACHE_TABLE_NAME } from './cacheUtils'

// const supabaseClient = createClient(
//   getEnvVar("SUPABASE_URL"),
//   getEnvVar("SUPABASE_SERVICE_ROLE_KEY")
// )

// const notificationChannel = supabaseClient.channel('events:notification');

// export const setupSupabaseRealtime = () => {
//   console.log('🔄 Setting up Supabase realtime...');

//   // Early return if no SocketIO
//   if (!getSocketIO) return () => (req: Request, res: Response, next: NextFunction) => next();


//   const channel = supabaseClient.channel('events');

//   const registerSupabaseEventHandler = (req: Request, res: Response, next: NextFunction) => {
//     const user = req.user;

//     channel.on(
//       'postgres_changes',
//       {
//         event: 'INSERT',
//         schema: 'public',
//         table: 'notifications',
//         // filter: `recipient_id=eq.${user.id}`,
//       },
//       (payload) => {
//         console.log('📬 New notification received:', payload.new);
//         getSocketIO().broadcast("notification:insert", { evt: "refetch", val: payload.new });
//       }
//     );

//     // channel.subscribe();
//     next();
//   };


//   // Set up global event handlers
//   channel
//     .on(
//       'postgres_changes',
//       { event: 'INSERT', schema: 'public', table: DATABASE_CACHE_TABLE_NAME, filter: 'column_name=eq.socket' },
//       async () => {
//         console.log('🔌 User joined event');
//         getSocketIO().broadcast("events:user_joined", "refetch");
//       }
//     )
//     .on(
//       'postgres_changes',
//       { event: 'DELETE', schema: 'public', table: DATABASE_CACHE_TABLE_NAME, filter: 'column_name=eq.socket' },
//       async (_) => {
//         console.log('🔌 User left event');
//         getSocketIO().broadcast("events:user_joined", "refetch");
//       }
//     )
//     .on(
//       'postgres_changes',
//       { event: 'INSERT', schema: 'public', table: 'markets' },
//       async (_) => {
//         console.log('🏪 New market added');
//         getSocketIO().broadcast("markets:new_market_added", "refetch");
//       }
//     )
//     .on(
//       'postgres_changes',
//       { event: 'UPDATE', schema: 'public', table: 'profiles' },
//       (payload) => {
//         console.log('👤 Profile updated');
//         getSocketIO().broadcast("profiles:update", { evt: "refetch:is_reachable", val: payload.old.is_reachable });
//       }
//     );

//   // ✅ Subscribe to the main channel
//   channel.subscribe();

//   return () => registerSupabaseEventHandler;
// };

// export async function getSupabaseClient(request: Request): Promise<SupabaseClient<any, "public", any>> {
//   // Extract access token properly
//   let accessToken = request.headers.authorization ?? ''
//   if (accessToken.startsWith('Bearer ')) {
//     accessToken = accessToken.substring(7) // Remove 'Bearer ' prefix
//   }

//   const refreshToken = (request.headers['x-supabase-refresh'] ?? '') as string


//   if (!(accessToken && refreshToken)) {
//     throw new Unauthorized('Unauthorized Access. Not logged in');
//   }

//   // Validate token format (basic JWT structure check)
//   const jwtPattern = /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/
//   if (!jwtPattern.test(accessToken)) {
//     console.error('Invalid access token format')
//     throw new Unauthorized('Invalid token format');
//   }

//   // Use ANON key instead of SERVICE_ROLE_KEY for user sessions
//   const supabaseClient = createClient(
//     getEnvVar("SUPABASE_URL"),
//     getEnvVar("SUPABASE_ANON_KEY") // Changed from SUPABASE_SERVICE_ROLE_KEY
//   )

//   try {
//     // Set the session with the tokens
//     const { error } = await supabaseClient.auth.setSession({
//       access_token: accessToken,
//       refresh_token: refreshToken
//     })

//     if (error) {
//       console.error('Error setting session:', error)
//       throw new Unauthorized(`Session error: ${error.message}`);
//     }

//     // Verify the session is active
//     const { data: { user }, error: userError } = await supabaseClient.auth.getUser()
//     if (userError || !user) {
//       console.error('Error getting user:', userError)
//       throw new Unauthorized('No active user session');
//     }

//     console.log('Session set successfully for user:', user.id)
//     return supabaseClient

//   } catch (error) {
//     console.error('Supabase client error:', error)
//     if (error.message?.includes('JWT')) {
//       throw new Unauthorized('Invalid or expired token');
//     }
//     throw error
//   }
// }


// export { supabaseClient }
