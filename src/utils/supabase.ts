
import { createClient, } from '@supabase/supabase-js'
import { getEnvVar } from './env'
import { getSocketIO } from './socketio'

const supabaseClient = createClient(
  getEnvVar("SUPABASE_URL"),
  getEnvVar("SUPABASE_SERVICE_ROLE_KEY")
)

const channel = supabaseClient.channel('table:user_socket_cache');


channel
  .on(
    'postgres_changes',
    { event: 'INSERT', schema: 'public', table: 'user_socket_cache' },
    async (_) => {
      getSocketIO().broadcast("user_socket_cache:user_joined", "refetch");
    }
  )
  .on(
    'postgres_changes',
    { event: 'DELETE', schema: 'public', table: 'user_socket_cache' },
    async (_) => {
      getSocketIO().broadcast("user_socket_cache:user_joined", "refetch");
    }
  )
  .subscribe();

export { supabaseClient }
