-- =========================================================================
-- VAANILEARN AI — SUPABASE POSTGRESQL + PGVECTOR DATABASE SCHEMA
-- Backs all screens: Landing, Login, Sign Up, PDF Library, & AI Voice Classroom
-- =========================================================================

-- 1. Enable pgvector extension
CREATE EXTENSION IF NOT EXISTS vector;

-- 2. User Profiles Table (Connected to Supabase Auth auth.users)
CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    full_name TEXT NOT NULL,
    email TEXT UNIQUE NOT NULL,
    avatar_url TEXT,
    created_at TIMESTAMPTZ DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- Enable Row Level Security (RLS)
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;

CREATE POLICY "Users can view own profile"
    ON public.profiles FOR SELECT
    TO authenticated
    USING (auth.uid() = id);

CREATE POLICY "Users can update own profile"
    ON public.profiles FOR UPDATE
    TO authenticated
    USING (auth.uid() = id)
    WITH CHECK (auth.uid() = id);

-- 3. Automatic Profile Creation Trigger
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
    user_full_name TEXT;
BEGIN
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

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

CREATE TRIGGER on_auth_user_created
    AFTER INSERT OR UPDATE OF email, raw_user_meta_data ON auth.users
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_new_user();

-- 4. Ingested Study Documents (Storage linked to Supabase Bucket 'study-materials')
CREATE TABLE IF NOT EXISTS public.documents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    title TEXT NOT NULL, -- e.g. "Indian History.pdf"
    storage_path TEXT NOT NULL, -- Path inside Supabase Storage bucket
    file_size_bytes BIGINT NOT NULL,
    page_count INT DEFAULT 0,
    language VARCHAR(10) DEFAULT 'gu',
    status VARCHAR(20) DEFAULT 'processing', -- 'uploading', 'processing', 'ready', 'failed'
    extracted_metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

ALTER TABLE public.documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own documents"
    ON public.documents FOR SELECT
    TO authenticated
    USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own documents"
    ON public.documents FOR INSERT
    TO authenticated
    WITH CHECK (auth.uid() = user_id);

-- 5. Document Chunks & Vector Embeddings (PyMuPDF segmented)
CREATE TABLE IF NOT EXISTS public.document_chunks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    document_id UUID NOT NULL REFERENCES public.documents(id) ON DELETE CASCADE,
    page_number INT NOT NULL,
    chunk_index INT NOT NULL,
    chunk_text TEXT NOT NULL,
    token_count INT DEFAULT 0,
    embedding vector(768), -- 768-dimensional vector from Gemini text-embedding-004
    created_at TIMESTAMPTZ DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

CREATE INDEX IF NOT EXISTS document_chunks_embedding_hnsw_idx 
    ON public.document_chunks 
    USING hnsw (embedding vector_cosine_ops);

-- 6. Voice Learning Sessions
CREATE TABLE IF NOT EXISTS public.voice_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    document_id UUID REFERENCES public.documents(id) ON DELETE SET NULL,
    session_title TEXT NOT NULL,
    session_language VARCHAR(10) DEFAULT 'gu',
    created_at TIMESTAMPTZ DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

ALTER TABLE public.voice_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own voice sessions"
    ON public.voice_sessions FOR ALL
    TO authenticated
    USING (auth.uid() = user_id);

-- 7. Chat Messages & Synthetic Voice Audio Cache
CREATE TABLE IF NOT EXISTS public.chat_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID NOT NULL REFERENCES public.voice_sessions(id) ON DELETE CASCADE,
    sender VARCHAR(10) NOT NULL, -- 'user' or 'ai'
    text_content TEXT NOT NULL,
    audio_storage_url TEXT,
    audio_duration_seconds NUMERIC(5, 2) DEFAULT 0,
    grounded_chunk_ids UUID[],
    cosine_similarity NUMERIC(5, 4),
    gemini_model VARCHAR(50) DEFAULT 'gemini-2.0-flash',
    created_at TIMESTAMPTZ DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

ALTER TABLE public.chat_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own session messages"
    ON public.chat_messages FOR SELECT
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.voice_sessions vs
            WHERE vs.id = chat_messages.session_id AND vs.user_id = auth.uid()
        )
    );

-- 8. Cosine Similarity Matching RPC Function for FastAPI
CREATE OR REPLACE FUNCTION match_document_chunks(
    query_embedding vector(768),
    match_document_id UUID,
    match_count INT DEFAULT 5
)
RETURNS TABLE (
    id UUID,
    page_number INT,
    chunk_text TEXT,
    similarity FLOAT
)
LANGUAGE plpgsql
AS $$
BEGIN
    RETURN QUERY
    SELECT
        dc.id,
        dc.page_number,
        dc.chunk_text,
        1 - (dc.embedding <=> query_embedding) AS similarity
    FROM public.document_chunks dc
    WHERE dc.document_id = match_document_id
    ORDER BY dc.embedding <=> query_embedding
    LIMIT match_count;
END;
$$;
