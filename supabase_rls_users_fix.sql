-- =============================================================================
-- RLS FIX for public.users table
-- Run this in your Supabase SQL Editor if the Member Directory shows 0 members
-- even though users exist in the database.
--
-- BACKGROUND:
--   The backend server.ts uses SUPABASE_SERVICE_ROLE_KEY (or falls back to ANON_KEY).
--   The service-role key bypasses RLS automatically, so if you have that key set
--   the query below is not necessary — just ensure the env var is correct.
--
--   If you're using only SUPABASE_ANON_KEY on the backend, RLS on public.users
--   will block SELECT * unless a permissive policy exists.
-- =============================================================================

-- Option A (Recommended — backend uses service key, so RLS not needed here):
-- Disable RLS on public.users entirely since access is controlled via backend auth.
ALTER TABLE public.users DISABLE ROW LEVEL SECURITY;

-- -----------------------------------------------------------------------
-- Option B (If you want RLS ON but still allow the backend service role):
-- The service role bypasses RLS by default in Supabase, so no extra policy
-- is needed. Just ensure SUPABASE_SERVICE_ROLE_KEY is set on your server.
-- -----------------------------------------------------------------------

-- Option C (If you must keep RLS ON with ANON_KEY on backend):
-- Add a policy that allows full read access to the users table.
-- WARNING: This allows any authenticated browser user to read all profiles.
-- Only use if you intentionally want that behaviour.
--
-- ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
-- CREATE POLICY "Service can read all users"
--     ON public.users
--     FOR SELECT
--     USING (true);

-- =============================================================================
-- VERIFICATION QUERY
-- After applying the fix, run this to confirm rows are returned:
-- =============================================================================
-- SELECT id, email, name, is_admin, is_super_admin, created_at
-- FROM public.users
-- ORDER BY created_at DESC
-- LIMIT 10;
