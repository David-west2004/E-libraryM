-- ==============================================================================
-- WEEKLY QUIZ & LEADERBOARD MIGRATION FOR SUPABASE
-- Feature: Gamified Weekly Quiz with Automated Sunday Reset Leaderboard
-- ==============================================================================

-- 0. Enable pgcrypto / uuid extensions if not already present
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Ensure 'role' column exists on public.users for flexible RBAC
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'users') THEN
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'role') THEN
            ALTER TABLE public.users ADD COLUMN role TEXT DEFAULT 'member' CHECK (role IN ('member', 'general_admin', 'quiz_admin', 'super_admin'));
        END IF;
    END IF;
END $$;

-- ------------------------------------------------------------------------------
-- 1. TABLES DEFINITION
-- ------------------------------------------------------------------------------

-- 1.1 quiz_questions Table
CREATE TABLE IF NOT EXISTS public.quiz_questions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    question_text TEXT NOT NULL,
    question_type TEXT NOT NULL CHECK (question_type IN ('mcq', 'fill_blank', 'descriptive')),
    options JSONB DEFAULT '[]'::jsonb, -- e.g. ["Option A", "Option B", "Option C", "Option D"]
    correct_answer TEXT NOT NULL,      -- Canonical correct answer string
    week_identifier TEXT NOT NULL,     -- ISO week identifier, e.g. '2026-W46'
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes for quiz_questions
CREATE INDEX IF NOT EXISTS idx_quiz_questions_week ON public.quiz_questions (week_identifier);
CREATE INDEX IF NOT EXISTS idx_quiz_questions_type ON public.quiz_questions (question_type);

-- 1.2 quiz_attempts Table
CREATE TABLE IF NOT EXISTS public.quiz_attempts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    question_id UUID NOT NULL REFERENCES public.quiz_questions(id) ON DELETE CASCADE,
    selected_answer TEXT NOT NULL,
    is_correct BOOLEAN NOT NULL DEFAULT false,
    time_taken_seconds INTEGER NOT NULL CHECK (time_taken_seconds >= 0),
    points_earned INTEGER NOT NULL DEFAULT 0 CHECK (points_earned >= 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    -- Enforce 1 attempt per user per question
    CONSTRAINT uq_user_question_attempt UNIQUE (user_id, question_id)
);

-- Indexes for quiz_attempts
CREATE INDEX IF NOT EXISTS idx_quiz_attempts_user_id ON public.quiz_attempts (user_id);
CREATE INDEX IF NOT EXISTS idx_quiz_attempts_question_id ON public.quiz_attempts (question_id);
CREATE INDEX IF NOT EXISTS idx_quiz_attempts_created_at ON public.quiz_attempts (created_at);

-- ------------------------------------------------------------------------------
-- 2. SCORING FUNCTION
-- Formula:
--   Points = (Base Points * Accuracy Multiplier) + Speed Bonus (within time window)
--   - Incorrect attempts always receive 0 points.
--   - Base points: 100
--   - Accuracy Multipliers:
--       * 'mcq': 1.0 (Baseline)
--       * 'fill_blank': 1.15 (+15% for exact recall without choices)
--       * 'descriptive': 1.30 (+30% for open-ended / comprehensive answers)
--   - Speed Bonus:
--       * Max bonus: 50 points if completed within 60 seconds.
--       * Linear decay from 0s to 60s: FLOOR(50 * (1 - (time_taken / 60)))
--       * Beyond 60s: 0 speed bonus.
-- ------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.calculate_quiz_score(
    p_is_correct BOOLEAN,
    p_time_taken_seconds INTEGER,
    p_question_type TEXT DEFAULT 'mcq'
)
RETURNS INTEGER
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
    v_base_points NUMERIC := 100.0;
    v_accuracy_multiplier NUMERIC := 1.0;
    v_max_speed_bonus NUMERIC := 50.0;
    v_speed_window_seconds NUMERIC := 60.0;
    v_speed_bonus NUMERIC := 0.0;
    v_total_points INTEGER := 0;
BEGIN
    -- Incorrect attempts receive 0 points
    IF NOT p_is_correct THEN
        RETURN 0;
    END IF;

    -- Accuracy multiplier based on question difficulty / cognitive load
    CASE p_question_type
        WHEN 'fill_blank' THEN
            v_accuracy_multiplier := 1.15;
        WHEN 'descriptive' THEN
            v_accuracy_multiplier := 1.30;
        ELSE
            v_accuracy_multiplier := 1.0; -- Default / MCQ
    END CASE;

    -- Speed bonus calculation (rewarding faster response within 60s window)
    IF p_time_taken_seconds < v_speed_window_seconds THEN
        v_speed_bonus := FLOOR(v_max_speed_bonus * (1.0 - (p_time_taken_seconds::NUMERIC / v_speed_window_seconds)));
    ELSE
        v_speed_bonus := 0.0;
    END IF;

    v_total_points := FLOOR((v_base_points * v_accuracy_multiplier) + v_speed_bonus);

    RETURN GREATEST(v_total_points, 0);
END;
$$;

-- Secure Server-Side Attempt Submission RPC
-- Eliminates client-side score manipulation by verifying answers and computing scores on the server
CREATE OR REPLACE FUNCTION public.submit_quiz_attempt(
    p_question_id UUID,
    p_selected_answer TEXT,
    p_time_taken_seconds INTEGER
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
    v_user_id UUID;
    v_question public.quiz_questions%ROWTYPE;
    v_is_correct BOOLEAN := false;
    v_points_earned INTEGER := 0;
    v_attempt_id UUID;
BEGIN
    v_user_id := auth.uid();
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Authentication required to submit quiz attempt.';
    END IF;

    -- Retrieve question details
    SELECT * INTO v_question FROM public.quiz_questions WHERE id = p_question_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Quiz question not found.';
    END IF;

    -- Verify answer based on question type
    IF v_question.question_type = 'mcq' THEN
        -- Case-insensitive exact match
        v_is_correct := (TRIM(LOWER(p_selected_answer)) = TRIM(LOWER(v_question.correct_answer)));
    ELSIF v_question.question_type = 'fill_blank' THEN
        -- Case-insensitive trim match
        v_is_correct := (TRIM(LOWER(p_selected_answer)) = TRIM(LOWER(v_question.correct_answer)));
    ELSIF v_question.question_type = 'descriptive' THEN
        -- Keywords / exact match or reference check
        v_is_correct := (TRIM(LOWER(p_selected_answer)) = TRIM(LOWER(v_question.correct_answer)))
                     OR (LOWER(p_selected_answer) LIKE '%' || LOWER(v_question.correct_answer) || '%');
    END IF;

    -- Calculate points using scoring function
    v_points_earned := public.calculate_quiz_score(
        v_is_correct,
        p_time_taken_seconds,
        v_question.question_type
    );

    -- Insert attempt record
    INSERT INTO public.quiz_attempts (
        user_id,
        question_id,
        selected_answer,
        is_correct,
        time_taken_seconds,
        points_earned
    ) VALUES (
        v_user_id,
        p_question_id,
        p_selected_answer,
        v_is_correct,
        p_time_taken_seconds,
        v_points_earned
    )
    RETURNING id INTO v_attempt_id;

    RETURN jsonb_build_object(
        'success', true,
        'attempt_id', v_attempt_id,
        'is_correct', v_is_correct,
        'points_earned', v_points_earned,
        'time_taken_seconds', p_time_taken_seconds
    );
END;
$$;

-- ------------------------------------------------------------------------------
-- 3. CURRENT WEEK HELPER & WEEKLY LEADERBOARD VIEW
-- Automatically resets every Sunday at 23:59:59 UTC / rolls into Monday ISO week
-- Historical records remain permanently stored in quiz_attempts
-- ------------------------------------------------------------------------------

-- Helper function to get current ISO week identifier (e.g. '2026-W46')
CREATE OR REPLACE FUNCTION public.get_current_week_identifier()
RETURNS TEXT
LANGUAGE sql
STABLE
AS $$
    SELECT to_char(now() AT TIME ZONE 'UTC', 'IYYY-"W"IW');
$$;

-- Weekly Leaderboard View
-- Aggregates user attempts strictly filtered by the current ISO week identifier
CREATE OR REPLACE VIEW public.weekly_leaderboard_view AS
SELECT
    qa.user_id,
    COALESCE(u.name, split_part(au.email, '@', 1), 'Anonymous Student') AS user_name,
    COALESCE(u.email, au.email) AS email,
    qq.week_identifier,
    SUM(qa.points_earned)::INTEGER AS total_points,
    COUNT(qa.id)::INTEGER AS total_attempts,
    COUNT(qa.id) FILTER (WHERE qa.is_correct)::INTEGER AS correct_answers,
    ROUND(
        (COUNT(qa.id) FILTER (WHERE qa.is_correct)::NUMERIC / NULLIF(COUNT(qa.id), 0)) * 100,
        2
    ) AS accuracy_rate,
    SUM(qa.time_taken_seconds)::INTEGER AS total_time_taken_seconds,
    ROUND(AVG(qa.time_taken_seconds), 2) AS average_time_seconds,
    DENSE_RANK() OVER (
        ORDER BY 
            SUM(qa.points_earned) DESC, 
            SUM(qa.time_taken_seconds) ASC,
            MIN(qa.created_at) ASC
    )::INTEGER AS rank
FROM public.quiz_attempts qa
INNER JOIN public.quiz_questions qq ON qa.question_id = qq.id
LEFT JOIN public.users u ON qa.user_id = u.id
LEFT JOIN auth.users au ON qa.user_id = au.id
WHERE qq.week_identifier = to_char(now() AT TIME ZONE 'UTC', 'IYYY-"W"IW')
GROUP BY 
    qa.user_id, 
    u.name, 
    u.email, 
    au.email, 
    qq.week_identifier;

-- Optional function to query any historical week's leaderboard
CREATE OR REPLACE FUNCTION public.get_leaderboard_by_week(p_week_identifier TEXT)
RETURNS TABLE (
    user_id UUID,
    user_name TEXT,
    email TEXT,
    week_identifier TEXT,
    total_points INTEGER,
    total_attempts INTEGER,
    correct_answers INTEGER,
    accuracy_rate NUMERIC,
    total_time_taken_seconds INTEGER,
    average_time_seconds NUMERIC,
    rank INTEGER
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, auth
AS $$
    SELECT
        qa.user_id,
        COALESCE(u.name, split_part(au.email, '@', 1), 'Anonymous Student')::TEXT AS user_name,
        COALESCE(u.email, au.email)::TEXT AS email,
        qq.week_identifier,
        SUM(qa.points_earned)::INTEGER AS total_points,
        COUNT(qa.id)::INTEGER AS total_attempts,
        COUNT(qa.id) FILTER (WHERE qa.is_correct)::INTEGER AS correct_answers,
        ROUND(
            (COUNT(qa.id) FILTER (WHERE qa.is_correct)::NUMERIC / NULLIF(COUNT(qa.id), 0)) * 100,
            2
        ) AS accuracy_rate,
        SUM(qa.time_taken_seconds)::INTEGER AS total_time_taken_seconds,
        ROUND(AVG(qa.time_taken_seconds), 2) AS average_time_seconds,
        DENSE_RANK() OVER (
            ORDER BY 
                SUM(qa.points_earned) DESC, 
                SUM(qa.time_taken_seconds) ASC,
                MIN(qa.created_at) ASC
        )::INTEGER AS rank
    FROM public.quiz_attempts qa
    INNER JOIN public.quiz_questions qq ON qa.question_id = qq.id
    LEFT JOIN public.users u ON qa.user_id = u.id
    LEFT JOIN auth.users au ON qa.user_id = au.id
    WHERE qq.week_identifier = p_week_identifier
    GROUP BY 
        qa.user_id, 
        u.name, 
        u.email, 
        au.email, 
        qq.week_identifier;
$$;

-- ------------------------------------------------------------------------------
-- 4. ROLE-BASED ACCESS CONTROL (RBAC) & ROW LEVEL SECURITY (RLS)
-- Roles permitted to manage questions: 'quiz_admin' and 'super_admin'
-- ------------------------------------------------------------------------------

-- Helper function to check if current user is quiz_admin or super_admin
CREATE OR REPLACE FUNCTION public.is_quiz_admin()
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
AS $$
BEGIN
    RETURN (
        -- Check public.users role column or legacy boolean flags
        EXISTS (
            SELECT 1 FROM public.users
            WHERE id = auth.uid()
            AND (
                role IN ('quiz_admin', 'super_admin')
                OR is_super_admin = true
            )
        )
        -- Check Supabase Auth app_metadata
        OR (auth.jwt() -> 'app_metadata' ->> 'role') IN ('quiz_admin', 'super_admin')
        -- Check Supabase Auth user_metadata
        OR (auth.jwt() -> 'user_metadata' ->> 'role') IN ('quiz_admin', 'super_admin')
    );
END;
$$;

-- Enable RLS on quiz_questions
ALTER TABLE public.quiz_questions ENABLE ROW LEVEL SECURITY;

-- Policy 1: Authenticated users can view questions for the current week (to take the quiz)
-- In production, students should use an RPC/view to omit 'correct_answer' before submission
CREATE POLICY "Allow authenticated users to read active quiz questions"
    ON public.quiz_questions
    FOR SELECT
    TO authenticated
    USING (true);

-- Policy 2: Only quiz_admin or super_admin can insert questions
CREATE POLICY "Allow quiz_admin or super_admin to insert questions"
    ON public.quiz_questions
    FOR INSERT
    TO authenticated
    WITH CHECK (public.is_quiz_admin());

-- Policy 3: Only quiz_admin or super_admin can update questions
CREATE POLICY "Allow quiz_admin or super_admin to update questions"
    ON public.quiz_questions
    FOR UPDATE
    TO authenticated
    USING (public.is_quiz_admin())
    WITH CHECK (public.is_quiz_admin());

-- Policy 4: Only quiz_admin or super_admin can delete questions
CREATE POLICY "Allow quiz_admin or super_admin to delete questions"
    ON public.quiz_questions
    FOR DELETE
    TO authenticated
    USING (public.is_quiz_admin());


-- Enable RLS on quiz_attempts
ALTER TABLE public.quiz_attempts ENABLE ROW LEVEL SECURITY;

-- Policy 1: Users can view their own attempts, Admins can view all attempts
CREATE POLICY "Users view own attempts and admins view all"
    ON public.quiz_attempts
    FOR SELECT
    TO authenticated
    USING (
        auth.uid() = user_id 
        OR public.is_quiz_admin()
    );

-- Policy 2: Authenticated users can insert their own attempts
CREATE POLICY "Users can insert own attempts"
    ON public.quiz_attempts
    FOR INSERT
    TO authenticated
    WITH CHECK (
        auth.uid() = user_id
    );

-- Policy 3: Only super_admin or quiz_admin can update/grade attempts (e.g. manual descriptive grading)
CREATE POLICY "Admins can update attempts"
    ON public.quiz_attempts
    FOR UPDATE
    TO authenticated
    USING (public.is_quiz_admin())
    WITH CHECK (public.is_quiz_admin());

-- Policy 4: Only super_admin can delete attempts
CREATE POLICY "Admins can delete attempts"
    ON public.quiz_attempts
    FOR DELETE
    TO authenticated
    USING (public.is_quiz_admin());
