import { createClient, SupabaseClient } from '@supabase/supabase-js';

// Resolve Supabase credentials safely from Vite import.meta.env or process.env
const supabaseUrl: string =
  (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.VITE_SUPABASE_URL) ||
  (typeof process !== 'undefined' && process.env && process.env.SUPABASE_URL) ||
  '';

const supabaseAnonKey: string =
  (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.VITE_SUPABASE_ANON_KEY) ||
  (typeof process !== 'undefined' && process.env && process.env.SUPABASE_ANON_KEY) ||
  '';

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn(
    '[SupabaseClient] Warning: SUPABASE_URL or SUPABASE_ANON_KEY is missing. ' +
    'Please set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY (or SUPABASE_URL and SUPABASE_ANON_KEY) in your environment variables.'
  );
}

export const supabase: SupabaseClient = createClient(
  supabaseUrl || 'https://placeholder.supabase.co',
  supabaseAnonKey || 'placeholder-anon-key',
  {
    auth: {
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: true,
    },
  }
);

/**
 * Returns the dynamic redirect URL matching the active domain and port.
 * Works seamlessly across local development (e.g. localhost:3000, localhost:5173)
 * and production (e.g. Vercel deployment URLs, custom domains).
 */
export const getResetPasswordRedirectUrl = (): string => {
  if (typeof window !== 'undefined' && window.location && window.location.origin) {
    // Using origin with hash fallback ensures full SPA compatibility without server 404s
    return `${window.location.origin}/#reset-password`;
  }
  return 'http://localhost:3000/#reset-password';
};

/**
 * Helper to update user password in Supabase Auth.
 * Supabase JS v2 uses `supabase.auth.updateUser({ password })`.
 * This wrapper provides compatibility for both conventions.
 */
export const updateUserPassword = async (newPassword: string) => {
  return await supabase.auth.updateUser({
    password: newPassword,
  });
};

// Polyfill alias on supabase.auth if updatePassword is used directly
if (supabase.auth && !(supabase.auth as any).updatePassword) {
  (supabase.auth as any).updatePassword = (newPassword: string) => {
    return supabase.auth.updateUser({ password: newPassword });
  };
}
