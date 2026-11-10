import { createClient } from '@supabase/supabase-js';

const rawSupabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

/**
 * Defensive URL sanitization:
 * Supabase client requires the base project URL (e.g. https://xyz.supabase.co).
 * If the user copied the REST URL with `/rest/v1/` or trailing slashes, strip them
 * so requests to `/auth/v1/signup` don't fail with "Invalid path specified in request URL".
 */
export function sanitizeSupabaseUrl(url?: string): string {
  if (!url) return '';
  return url
    .trim()
    .replace(/\/rest\/v1\/?$/i, '')
    .replace(/\/auth\/v1\/?$/i, '')
    .replace(/\/+$/, '');
}

const cleanedSupabaseUrl = sanitizeSupabaseUrl(rawSupabaseUrl);

// Check if credentials are provided and not default placeholders
export const isSupabaseConfigured = Boolean(
  cleanedSupabaseUrl && 
  supabaseAnonKey && 
  cleanedSupabaseUrl !== 'https://your-project-ref.supabase.co' &&
  supabaseAnonKey !== 'your-supabase-anon-public-key' &&
  cleanedSupabaseUrl.startsWith('https://')
);

if (!isSupabaseConfigured) {
  console.warn(
    '[VaaniLearn AI] Supabase credentials not fully configured in .env. Using fallback client. ' +
    'Provide VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to connect real Supabase Auth & Brevo SMTP.'
  );
}

// Fallback dummy URL to prevent createClient throwing during build or before keys are set
const effectiveUrl = isSupabaseConfigured ? cleanedSupabaseUrl : 'https://placeholder-project.supabase.co';
const effectiveKey = isSupabaseConfigured ? supabaseAnonKey!.trim() : 'placeholder-anon-key-for-development';

export const supabase = createClient(effectiveUrl, effectiveKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    storage: window.localStorage,
    storageKey: 'vaanilearn-auth-token',
  },
});
