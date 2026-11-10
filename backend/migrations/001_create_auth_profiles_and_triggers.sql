-- =========================================================================
-- VAANILEARN AI — MIGRATION 001: USER PROFILES & AUTH TRIGGER
-- Compatible with Supabase Auth & PostgreSQL
-- =========================================================================

-- 1. Create public.profiles Table
CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    full_name TEXT NOT NULL,
    email TEXT UNIQUE NOT NULL,
    avatar_url TEXT,
    created_at TIMESTAMPTZ DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- 2. Enable Row Level Security (RLS)
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if any to avoid duplication
DROP POLICY IF EXISTS "Users can view own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
DROP POLICY IF EXISTS "Deny all public profile insert" ON public.profiles;

-- RLS Policy: Authenticated users can view ONLY their own profile record
CREATE POLICY "Users can view own profile"
    ON public.profiles
    FOR SELECT
    TO authenticated
    USING (auth.uid() = id);

-- RLS Policy: Authenticated users can update ONLY their own profile record
CREATE POLICY "Users can update own profile"
    ON public.profiles
    FOR UPDATE
    TO authenticated
    USING (auth.uid() = id)
    WITH CHECK (auth.uid() = id);

-- 3. Trigger Function: Automatically create profile upon Supabase auth.users creation
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
    user_full_name TEXT;
BEGIN
    -- Extract full_name from signup metadata or fall back to email username
    user_full_name := COALESCE(
        NULLIF(TRIM(NEW.raw_user_meta_data->>'full_name'), ''),
        NULLIF(TRIM(NEW.raw_user_meta_data->>'name'), ''),
        split_part(NEW.email, '@', 1),
        'Learner'
    );

    INSERT INTO public.profiles (
        id,
        full_name,
        email,
        avatar_url,
        created_at,
        updated_at
    )
    VALUES (
        NEW.id,
        user_full_name,
        NEW.email,
        NEW.raw_user_meta_data->>'avatar_url',
        NOW(),
        NOW()
    )
    ON CONFLICT (id) DO UPDATE
    SET
        full_name = EXCLUDED.full_name,
        email = EXCLUDED.email,
        updated_at = NOW();

    RETURN NEW;
END;
$$;

-- 4. Trigger Definition
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

CREATE TRIGGER on_auth_user_created
    AFTER INSERT OR UPDATE OF email, raw_user_meta_data ON auth.users
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_new_user();

-- 5. Prepare Supabase Storage Bucket for Study Materials
INSERT INTO storage.buckets (id, name, public)
VALUES ('study-materials', 'study-materials', false)
ON CONFLICT (id) DO NOTHING;

-- Storage RLS: Users can access their own uploaded files
DROP POLICY IF EXISTS "Users can read own study materials" ON storage.objects;
DROP POLICY IF EXISTS "Users can upload study materials" ON storage.objects;

CREATE POLICY "Users can read own study materials"
    ON storage.objects FOR SELECT
    TO authenticated
    USING (bucket_id = 'study-materials' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "Users can upload study materials"
    ON storage.objects FOR INSERT
    TO authenticated
    WITH CHECK (bucket_id = 'study-materials' AND (storage.foldername(name))[1] = auth.uid()::text);

