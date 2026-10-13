import { createClient, type SupabaseClient } from '@supabase/supabase-js'

/** Raised when the build has no Supabase credentials; the app shows it instead of a blank page. */
export class ConfigError extends Error {
  override readonly name = 'ConfigError'
}

/**
 * Teachers sign in with a username, but Supabase Auth identifies accounts by
 * email. The username is stored as `<username>@<this domain>`. No mail is ever
 * sent to it (email confirmation is off), so it only has to pass validation.
 */
export const AUTH_EMAIL_DOMAIN: string =
  (import.meta.env.VITE_AUTH_EMAIL_DOMAIN as string | undefined) || 'student-tracker.app'

let client: SupabaseClient | null = null

export function getSupabase(): SupabaseClient {
  if (client) return client
  const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
  const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined
  if (!url || !key) {
    throw new ConfigError(
      'This build has no Supabase credentials. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.',
    )
  }
  client = createClient(url, key, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
  })
  return client
}

/** Test-only: swaps in a fake client, or clears it with `null`. */
export function setSupabaseForTests(next: SupabaseClient | null): void {
  client = next
}
