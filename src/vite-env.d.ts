/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL?: string
  readonly VITE_SUPABASE_ANON_KEY?: string
  /** Domain for the synthetic email behind each username. Defaults to student-tracker.app. */
  readonly VITE_AUTH_EMAIL_DOMAIN?: string
}
