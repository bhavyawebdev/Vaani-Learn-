-- =========================================================================
-- VAANILEARN AI — MIGRATION 002: DOCUMENTS, CHUNKS, SESSIONS & FULL RLS
-- Compatible with Supabase PostgreSQL + pgvector
-- =========================================================================

-- 1. Enable pgvector extension
CREATE EXTENSION IF NOT EXISTS vector;

-- 2. Documents Table
CREATE TABLE IF NOT EXISTS public.documents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    storage_path TEXT NOT NULL,
    file_size_bytes BIGINT NOT NULL,
    page_count INT DEFAULT 0,
    language VARCHAR(10) DEFAULT 'en',
    status VARCHAR(20) DEFAULT 'processing',
    extracted_metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

ALTER TABLE public.documents ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own documents" ON public.documents;
DROP POLICY IF EXISTS "Users can insert own documents" ON public.documents;
DROP POLICY IF EXISTS "Users can update own documents" ON public.documents;
DROP POLICY IF EXISTS "Users can delete own documents" ON public.documents;

CREATE POLICY "Users can view own documents"
    ON public.documents FOR SELECT
    TO authenticated
    USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own documents"
    ON public.documents FOR INSERT
    TO authenticated
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own documents"
    ON public.documents FOR UPDATE
    TO authenticated
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own documents"
    ON public.documents FOR DELETE
    TO authenticated
    USING (auth.uid() = user_id);

-- 3. Document Chunks Table
CREATE TABLE IF NOT EXISTS public.document_chunks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    document_id UUID NOT NULL REFERENCES public.documents(id) ON DELETE CASCADE,
    page_number INT NOT NULL,
    chunk_index INT NOT NULL,
    chunk_text TEXT NOT NULL,
    token_count INT DEFAULT 0,
    embedding vector(768),
    created_at TIMESTAMPTZ DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

CREATE INDEX IF NOT EXISTS document_chunks_embedding_hnsw_idx
    ON public.document_chunks
    USING hnsw (embedding vector_cosine_ops);

CREATE INDEX IF NOT EXISTS document_chunks_doc_idx
    ON public.document_chunks (document_id, page_number, chunk_index);

ALTER TABLE public.document_chunks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own document chunks" ON public.document_chunks;
DROP POLICY IF EXISTS "Users can insert own document chunks" ON public.document_chunks;
DROP POLICY IF EXISTS "Users can update own document chunks" ON public.document_chunks;
DROP POLICY IF EXISTS "Users can delete own document chunks" ON public.document_chunks;

CREATE POLICY "Users can view own document chunks"
    ON public.document_chunks FOR SELECT
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.documents d
            WHERE d.id = document_chunks.document_id AND d.user_id = auth.uid()
        )
    );

CREATE POLICY "Users can insert own document chunks"
    ON public.document_chunks FOR INSERT
    TO authenticated
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.documents d
            WHERE d.id = document_chunks.document_id AND d.user_id = auth.uid()
        )
    );

CREATE POLICY "Users can update own document chunks"
    ON public.document_chunks FOR UPDATE
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.documents d
            WHERE d.id = document_chunks.document_id AND d.user_id = auth.uid()
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.documents d
            WHERE d.id = document_chunks.document_id AND d.user_id = auth.uid()
        )
    );

CREATE POLICY "Users can delete own document chunks"
    ON public.document_chunks FOR DELETE
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.documents d
            WHERE d.id = document_chunks.document_id AND d.user_id = auth.uid()
        )
    );

-- 4. Voice Learning Sessions
CREATE TABLE IF NOT EXISTS public.voice_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    document_id UUID REFERENCES public.documents(id) ON DELETE SET NULL,
    session_title TEXT NOT NULL,
    session_language VARCHAR(10) DEFAULT 'en',
    duration_seconds INT DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

ALTER TABLE public.voice_sessions
    ADD COLUMN IF NOT EXISTS duration_seconds INT DEFAULT 0;
ALTER TABLE public.voice_sessions
    ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL;

ALTER TABLE public.voice_sessions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can manage own voice sessions" ON public.voice_sessions;

CREATE POLICY "Users can manage own voice sessions"
    ON public.voice_sessions FOR ALL
    TO authenticated
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

-- 5. Chat Messages
CREATE TABLE IF NOT EXISTS public.chat_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID NOT NULL REFERENCES public.voice_sessions(id) ON DELETE CASCADE,
    sender VARCHAR(10) NOT NULL,
    text_content TEXT NOT NULL,
    audio_storage_url TEXT,
    audio_duration_seconds NUMERIC(5, 2) DEFAULT 0,
    grounded_chunk_ids UUID[],
    cosine_similarity NUMERIC(5, 4),
    gemini_model VARCHAR(50) DEFAULT 'gemini-2.0-flash',
    created_at TIMESTAMPTZ DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

ALTER TABLE public.chat_messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can read own session messages" ON public.chat_messages;
DROP POLICY IF EXISTS "Users can insert own session messages" ON public.chat_messages;

CREATE POLICY "Users can read own session messages"
    ON public.chat_messages FOR SELECT
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.voice_sessions vs
            WHERE vs.id = chat_messages.session_id AND vs.user_id = auth.uid()
        )
    );

CREATE POLICY "Users can insert own session messages"
    ON public.chat_messages FOR INSERT
    TO authenticated
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.voice_sessions vs
            WHERE vs.id = chat_messages.session_id AND vs.user_id = auth.uid()
        )
    );

-- 6. Storage DELETE policy for users' own uploaded PDFs
DROP POLICY IF EXISTS "Users can delete own study materials" ON storage.objects;

CREATE POLICY "Users can delete own study materials"
    ON storage.objects FOR DELETE
    TO authenticated
    USING (bucket_id = 'study-materials' AND (storage.foldername(name))[1] = auth.uid()::text);

