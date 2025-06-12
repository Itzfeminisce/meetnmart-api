import { createClient, SupabaseClient, } from '@supabase/supabase-js'
import { getEnvVar } from './env'
import { getSocketIO } from './socketio'
import { Request } from 'express'
import { Unauthorized } from './responses'
import { DATABASE_CACHE_TABLE_NAME } from './cacheUtils'

const supabaseClient = createClient(
  getEnvVar("SUPABASE_URL"),
  getEnvVar("SUPABASE_SERVICE_ROLE_KEY")
)

export const setupSupabaseRealtime = () => {
  if (!getSocketIO) return;
  const channel = supabaseClient.channel('events');

  channel
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: DATABASE_CACHE_TABLE_NAME, filter: 'column_name=eq.socket' },
      async (_) => {
        getSocketIO().broadcast("events:user_joined", "refetch");
      }
    )
    .on(
      'postgres_changes',
      { event: 'DELETE', schema: 'public', table: DATABASE_CACHE_TABLE_NAME, filter: 'column_name=eq.socket' },
      async (_) => {
        getSocketIO().broadcast("events:user_joined", "refetch");
      }
    )
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'markets' },
      async (_) => {
        getSocketIO().broadcast("markets:new_market_added", "refetch");
      }
    )
    .on(
      'postgres_changes',
      { event: 'UPDATE', schema: 'public', table: 'profiles' },
      (payload) => {
        getSocketIO().broadcast("profiles:update", { evt: "refetch:is_reachable", val: payload.old.is_reachable });
      }
    )
    .subscribe();
}


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
    const {error } = await supabaseClient.auth.setSession({
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
