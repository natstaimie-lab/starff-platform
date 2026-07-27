/**
 * Centralised, environment-based configuration.
 *
 * Values come from EXPO_PUBLIC_* variables (see .env.example). Expo inlines
 * these at build time, so switching between development / staging / production
 * is just a matter of building with the matching .env file.
 *
 * IMPORTANT: this file only ever reads the PUBLIC anon key + API URL. Secrets
 * (service key, DB URL, webhook secret) never live in the mobile app.
 */

export type AppEnv = 'development' | 'staging' | 'production';

function required(name: string, value: string | undefined): string {
  if (!value || value.startsWith('REPLACE_WITH')) {
    // Fail loud in dev; in production a bad build should be caught before release.
    console.warn(
      `[config] Missing required env var ${name}. Set it in your .env file.`,
    );
  }
  return value ?? '';
}

export const config = {
  appEnv: (process.env.EXPO_PUBLIC_APP_ENV as AppEnv) ?? 'development',
  apiUrl: required('EXPO_PUBLIC_API_URL', process.env.EXPO_PUBLIC_API_URL),
  supabaseUrl: required(
    'EXPO_PUBLIC_SUPABASE_URL',
    process.env.EXPO_PUBLIC_SUPABASE_URL,
  ),
  supabaseAnonKey: required(
    'EXPO_PUBLIC_SUPABASE_ANON_KEY',
    process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY,
  ),
  get isProduction() {
    return this.appEnv === 'production';
  },
} as const;
