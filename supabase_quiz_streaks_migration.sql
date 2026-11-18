-- ============================================================
-- DLCF E-Library — Quiz Daily Streaks & Date-Based Questions
-- Run this in Supabase SQL Editor AFTER the base migration
-- ============================================================

-- 1. Add date_identifier to quiz_questions (daily expiry)
ALTER TABLE public.quiz_questions
  ADD COLUMN IF NOT EXISTS date_identifier DATE DEFAULT CURRENT_DATE;

CREATE INDEX IF NOT EXISTS idx_quiz_questions_date
  ON public.quiz_questions (date_identifier);

-- Backfill existing rows to today
UPDATE public.quiz_questions
  SET date_identifier = CURRENT_DATE
  WHERE date_identifier IS NULL;

-- ============================================================
-- 2. user_streaks — tracks consecutive daily participation
-- ============================================================
CREATE TABLE IF NOT EXISTS public.user_streaks (
  user_id                   UUID        PRIMARY KEY REFERENCES public.users(id) ON DELETE CASCADE,
  current_streak            INTEGER     NOT NULL DEFAULT 0,
  longest_streak            INTEGER     NOT NULL DEFAULT 0,
  last_participation_date   DATE,
  total_streak_bonus_points INTEGER     NOT NULL DEFAULT 0,
  -- Track which ISO-week each milestone was last awarded to prevent double-award
  streak_3_awarded_week     TEXT,
  streak_7_awarded_week     TEXT,
  created_at                TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at                TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Trigger: auto-update updated_at
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_user_streaks_updated_at ON public.user_streaks;
CREATE TRIGGER trg_user_streaks_updated_at
  BEFORE UPDATE ON public.user_streaks
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============================================================
-- 3. Fix quiz_attempts foreign key to reference public.users
--    (app uses custom auth, NOT Supabase auth.users)
-- ============================================================
-- Only run if the FK currently points to auth.users:
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints tc
    JOIN information_schema.referential_constraints rc ON tc.constraint_name = rc.constraint_name
    JOIN information_schema.table_constraints tc2 ON rc.unique_constraint_name = tc2.constraint_name
    WHERE tc.table_schema = 'public'
      AND tc.table_name   = 'quiz_attempts'
      AND tc.constraint_type = 'FOREIGN KEY'
      AND tc2.table_name = 'users'
      AND tc2.table_schema = 'auth'
  ) THEN
    ALTER TABLE public.quiz_attempts DROP CONSTRAINT IF EXISTS quiz_attempts_user_id_fkey;
    ALTER TABLE public.quiz_attempts
      ADD CONSTRAINT quiz_attempts_user_id_fkey
      FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;
  END IF;
END;
$$;

-- ============================================================
-- 4. RLS policies for user_streaks
-- ============================================================
ALTER TABLE public.user_streaks ENABLE ROW LEVEL SECURITY;

-- Users can read their own streak
CREATE POLICY "Users read own streak"
  ON public.user_streaks FOR SELECT
  USING (true);  -- leaderboard needs all streaks; server uses service key

-- Only service role / server writes streaks (no direct client writes)
CREATE POLICY "Service role manages streaks"
  ON public.user_streaks FOR ALL
  USING (true)
  WITH CHECK (true);

-- ============================================================
-- 5. Grant service role full access
-- ============================================================
GRANT ALL ON public.user_streaks TO service_role;
GRANT SELECT ON public.user_streaks TO anon, authenticated;
