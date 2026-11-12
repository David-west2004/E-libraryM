import { createClient, SupabaseClient } from '@supabase/supabase-js';

// Resolve Supabase credentials safely from Vite define or runtime
let supabaseUrl: string =
  (typeof import.meta !== 'undefined' && import.meta.env?.VITE_SUPABASE_URL) ||
  (typeof process !== 'undefined' && (process.env?.VITE_SUPABASE_URL || process.env?.SUPABASE_URL)) ||
  '';

let supabaseAnonKey: string =
  (typeof import.meta !== 'undefined' && import.meta.env?.VITE_SUPABASE_ANON_KEY) ||
  (typeof process !== 'undefined' && (process.env?.VITE_SUPABASE_ANON_KEY || process.env?.SUPABASE_ANON_KEY)) ||
  '';

export let supabase: SupabaseClient = createClient(
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

// If client-side credentials were placeholder, dynamically fetch from /api/auth/config
export const ensureSupabaseConfig = async (): Promise<SupabaseClient> => {
  if (supabaseUrl && !supabaseUrl.includes('placeholder')) {
    return supabase;
  }
  try {
    const res = await fetch('/api/auth/config');
    if (res.ok) {
      const data = await res.json();
      if (data.supabaseUrl && data.supabaseAnonKey) {
        supabaseUrl = data.supabaseUrl;
        supabaseAnonKey = data.supabaseAnonKey;
        supabase = createClient(supabaseUrl, supabaseAnonKey, {
          auth: {
            autoRefreshToken: true,
            persistSession: true,
            detectSessionInUrl: true,
          },
        });
      }
    }
  } catch (e) {
    console.warn('[SupabaseClient] Dynamic config fetch notice:', e);
  }
  return supabase;
};

if (typeof window !== 'undefined') {
  ensureSupabaseConfig();
}

/**
 * Returns the dynamic redirect URL matching the active domain and port.
 * Works seamlessly across local development (e.g. localhost:3000, localhost:5173)
 * and production (e.g. Vercel deployment URLs, custom domains).
 */
export const getResetPasswordRedirectUrl = (): string => {
  if (typeof window !== 'undefined' && window.location && window.location.origin) {
    return `${window.location.origin}/#reset-password`;
  }
  return 'https://dlcf-el.nxrlabz.com.ng/#reset-password';
};

/**
 * Helper to update user password in Supabase Auth.
 */
export const updateUserPassword = async (newPassword: string) => {
  await ensureSupabaseConfig();
  return await supabase.auth.updateUser({
    password: newPassword,
  });
};
