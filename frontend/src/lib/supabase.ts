import { createClient, type SupabaseClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

/**
 * Supabase handles authentication only (login/signup/OTP). All business data
 * flows through our FastAPI backend with the Supabase JWT as a bearer token.
 * When env vars are absent (e.g. local UI work), this is null and the app
 * falls back to demo mode.
 */
export const supabase: SupabaseClient | null =
  url && anonKey ? createClient(url, anonKey) : null
