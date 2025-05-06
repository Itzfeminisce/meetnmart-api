import { createClient } from '@supabase/supabase-js'
import { getEnvVar } from './env'

const supabaseClient = createClient(
  getEnvVar("SUPABASE_URL"),
  getEnvVar("SUPABASE_SERVICE_ROLE_KEY")
)

export { supabaseClient }