import { supabase, isSupabaseConfigured } from './supabase';
import {
  detectChaptersInChunks,
  extractPdfContent,
  extractQueryTerms,
  findRelevantChunks,
} from './pdfProcessor';
import type {
  DialectCode,
  DocumentChunk,
  StudyDocument,
  TutorMessage,
  VoiceSession,
} from '../types/workspace';

const API_BASE_URL = (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/+$/, '') || '';
export const MAX_PDF_BYTES = 50 * 1024 * 1024; // 50 MB limit
export const MAX_PDF_LIMIT_NOTE = 'You cannot upload more than 50 MB of PDF.';
const documentChunksCache = new Map<string, DocumentChunk[]>();
let backendUnavailableUntil = 0;

function isBackendTemporarilyOffline(): boolean {
  return Date.now() < backendUnavailableUntil;
}

function markBackendOffline(): void {
  backendUnavailableUntil = Date.now() + 20_000;
}

function isNetworkOrTimeoutError(err: any): boolean {
  const msg = String(err?.message || '').toLowerCase();
  const name = String(err?.name || '').toLowerCase();
  return (
    name === 'aborterror' ||
    name === 'timeouterror' ||
    msg.includes('failed to fetch') ||
    msg.includes('networkerror') ||
    msg.includes('timed out') ||
    msg.includes('aborted')
  );
}

function isMissingTableError(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  return (
    error.code === '42P01' ||
    error.code === 'PGRST205' ||
    Boolean(error.message?.includes('does not exist') || error.message?.includes('schema cache'))
  );
}

export interface WorkspaceLoadResult {
  documents: StudyDocument[];
  sessions: VoiceSession[];
  needsSchemaSetup: boolean;
  errorMessage?: string;
}

/**
 * Fetches real documents and learning sessions belonging to the signed-in user.
 * Never returns dummy data.
 */
export async function fetchWorkspaceData(userId: string): Promise<WorkspaceLoadResult> {
  if (!isSupabaseConfigured || !userId) {
    return { documents: [], sessions: [], needsSchemaSetup: false };
  }

  const [docsRes, sessionsRes] = await Promise.all([
    supabase
      .from('documents')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false }),
    supabase
      .from('voice_sessions')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false }),
  ]);

  if (isMissingTableError(docsRes.error) || isMissingTableError(sessionsRes.error)) {
    return {
      documents: [],
      sessions: [],
      needsSchemaSetup: true,
      errorMessage:
        'Database tables for documents & sessions are not initialized yet. Run backend/migrations/002_documents_storage_and_sessions.sql in Supabase SQL Editor.',
    };
  }

  if (docsRes.error) {
    return {
      documents: [],
      sessions: [],
      needsSchemaSetup: false,
      errorMessage: docsRes.error.message,
    };
  }

  return {
    documents: (docsRes.data || []) as StudyDocument[],
    sessions: (sessionsRes.data || []) as VoiceSession[],
    needsSchemaSetup: false,
  };
}

export async function fetchDocumentChunks(documentId: string): Promise<DocumentChunk[]> {
  if (!isSupabaseConfigured || documentId.startsWith('local-')) return [];

  const cached = documentChunksCache.get(documentId);
  if (cached && cached.length > 0) {
    return cached;
  }

  // Paginate in 1,000-row batches so 500+ page PDFs load completely instead of hitting PostgREST's 1000-row cap
  const allChunks: DocumentChunk[] = [];
  const pageSize = 1000;
  let from = 0;

  while (true) {
    const { data, error } = await supabase
      .from('document_chunks')
      .select('id, document_id, page_number, chunk_index, chunk_text, token_count')
      .eq('document_id', documentId)
      .order('chunk_index', { ascending: true })
      .range(from, from + pageSize - 1);

    if (error || !data || data.length === 0) break;
    allChunks.push(...(data as DocumentChunk[]));
    if (data.length < pageSize) break;
    from += pageSize;
  }

  if (allChunks.length > 0) {
    documentChunksCache.set(documentId, allChunks);
  }
  return allChunks;
}

export async function fetchSessionMessages(sessionId: string): Promise<TutorMessage[]> {
  if (!isSupabaseConfigured || sessionId.startsWith('local-')) return [];

  const { data, error } = await supabase
    .from('chat_messages')
    .select('*')
    .eq('session_id', sessionId)
    .order('created_at', { ascending: true });

  if (error || !data) return [];

  return data.map((row) => ({
    id: row.id,
    session_id: row.session_id,
    sender: row.sender as 'user' | 'ai',
    text: row.text_content,
    language: 'en',
    created_at: row.created_at,
  }));
}

export interface UploadPdfResult {
  document: StudyDocument;
  chunks: DocumentChunk[];
  schemaWarning?: string;
}

/**
 * Uploads any user-selected PDF, extracts real pages & text chunks, persists to
 * Supabase Storage + PostgreSQL (with backend FastAPI enhancement when available).
 */
export async function uploadAndProcessPdf(params: {
  file: File;
  userId: string;
  language: DialectCode;
  onOptimisticCreated?: (pendingDoc: StudyDocument) => void;
  onProgress?: (percent: number, stageLabel: string) => void;
}): Promise<UploadPdfResult> {
  const { file, userId, language, onOptimisticCreated, onProgress } = params;

  if (!file.name.toLowerCase().endsWith('.pdf') && file.type !== 'application/pdf') {
    throw new Error('Only PDF files (.pdf) are supported.');
  }
  if (file.size > MAX_PDF_BYTES) {
    throw new Error(MAX_PDF_LIMIT_NOTE);
  }

  onProgress?.(15, 'Preparing file upload...');

  const sanitizedFileName = file.name.replace(/[^\w.\-() ]+/g, '_');
  const storagePath = `${userId}/${Date.now()}_${sanitizedFileName}`;
  const tempId = `local-${Date.now()}`;

  const optimisticDoc: StudyDocument = {
    id: tempId,
    user_id: userId,
    title: file.name,
    storage_path: storagePath,
    file_size_bytes: file.size,
    page_count: 0,
    language,
    status: 'processing',
    extracted_metadata: {},
    created_at: new Date().toISOString(),
  };

  onOptimisticCreated?.(optimisticDoc);

  let persistedDocId: string | null = null;
  let persistedDoc: StudyDocument | null = null;
  let schemaWarning: string | undefined;

  // 1. Upload binary PDF to Supabase Storage bucket 'study-materials'
  if (isSupabaseConfigured) {
    const storageRes = await supabase.storage
      .from('study-materials')
      .upload(storagePath, file, {
        contentType: 'application/pdf',
        upsert: false,
      });

    if (storageRes.error) {
      console.warn('[Storage upload warning]', storageRes.error.message);
    }

    // 2. Insert initial 'processing' document row in public.documents
    const insertRes = await supabase
      .from('documents')
      .insert({
        user_id: userId,
        title: file.name,
        storage_path: storagePath,
        file_size_bytes: file.size,
        page_count: 0,
        language,
        status: 'processing',
        extracted_metadata: {},
      })
      .select()
      .single();

    if (insertRes.error) {
      if (isMissingTableError(insertRes.error)) {
        schemaWarning =
          'PDF extracted in-browser. To persist across reloads, run backend/migrations/002_documents_storage_and_sessions.sql in Supabase SQL Editor.';
      } else {
        schemaWarning = insertRes.error.message;
      }
    } else if (insertRes.data) {
      persistedDoc = insertRes.data as StudyDocument;
      persistedDocId = persistedDoc.id;
    }
  }

  // 3. Extract real text and page count from the PDF
  onProgress?.(45, 'Extracting text & page structure...');
  const extracted = await extractPdfContent(file);
  const effectiveDocId = persistedDocId || tempId;
  onProgress?.(70, 'Processing text & indexing chunks...');

  const documentChunks: DocumentChunk[] = extracted.chunks.map((c) => ({
    ...c,
    document_id: effectiveDocId,
  }));

  const metadata = {
    chunk_count: documentChunks.length,
    vocab_count: extracted.vocabCount,
    char_count: extracted.charCount,
    preview_snippet: extracted.previewSnippet,
    table_of_contents: extracted.tableOfContents,
  };

  // 4. Persist extracted chunks & mark document 'ready' in Supabase
  if (isSupabaseConfigured && persistedDocId) {
    if (documentChunks.length > 0) {
      // Insert in parallel 100-row batches (4 concurrent requests) for fast 500+ page persistence
      const batches: Array<
        Array<{
          document_id: string;
          page_number: number;
          chunk_index: number;
          chunk_text: string;
          token_count: number;
        }>
      > = [];
      for (let i = 0; i < documentChunks.length; i += 100) {
        batches.push(
          documentChunks.slice(i, i + 100).map((chunk) => ({
            document_id: persistedDocId!,
            page_number: chunk.page_number,
            chunk_index: chunk.chunk_index,
            chunk_text: chunk.chunk_text,
            token_count: chunk.token_count,
          }))
        );
      }
      for (let b = 0; b < batches.length; b += 4) {
        await Promise.all(
          batches.slice(b, b + 4).map(async (batch) => {
            const res = await supabase.from('document_chunks').insert(batch);
            if (res.error) {
              console.warn('[Chunk insert warning]', res.error.message);
            }
          })
        );
      }
    }

    const updateRes = await supabase
      .from('documents')
      .update({
        page_count: extracted.pageCount,
        status: 'ready',
        extracted_metadata: metadata,
      })
      .eq('id', persistedDocId)
      .select()
      .single();

    if (updateRes.data) {
      persistedDoc = updateRes.data as StudyDocument;
    }
  }

  // 5. Notify FastAPI backend ONLY if Supabase did not already store chunks (avoids duplicate inserts on large PDFs)
  if (API_BASE_URL && !persistedDocId) {
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('language', language);
      formData.append('user_id', userId);
      fetch(`${API_BASE_URL}/documents/upload`, {
        method: 'POST',
        body: formData,
      }).catch(() => {
        // Backend server may be offline; browser extraction + Supabase persistence already succeeded
      });
    } catch {
      // Safe no-op
    }
  }

  const finalDocument: StudyDocument = persistedDoc || {
    ...optimisticDoc,
    id: effectiveDocId,
    page_count: extracted.pageCount,
    status: 'ready',
    extracted_metadata: metadata,
  };

  if (documentChunks.length > 0) {
    documentChunksCache.set(finalDocument.id, documentChunks);
  }

  onProgress?.(100, 'Ready');

  return {
    document: finalDocument,
    chunks: documentChunks,
    schemaWarning,
  };
}

/**
 * Fetches a publicly accessible PDF URL into a browser File object for indexing.
 */
export async function fetchPdfFileFromUrl(rawUrl: string): Promise<File> {
  const trimmed = rawUrl.trim();
  if (!trimmed || (!trimmed.startsWith('http://') && !trimmed.startsWith('https://'))) {
    throw new Error('Please enter a valid http:// or https:// PDF URL.');
  }

  let response: Response;
  try {
    response = await fetch(trimmed);
  } catch {
    throw new Error(
      'Unable to fetch that URL directly (the remote host may block browser CORS). Download the PDF and upload it from your device.'
    );
  }

  if (!response.ok) {
    throw new Error(`Failed to fetch PDF (HTTP ${response.status}).`);
  }

  const blob = await response.blob();
  if (blob.size > MAX_PDF_BYTES) {
    throw new Error(MAX_PDF_LIMIT_NOTE);
  }

  const pathname = new URL(trimmed).pathname;
  const rawName = pathname.split('/').pop() || 'imported-document.pdf';
  const filename = rawName.toLowerCase().endsWith('.pdf') ? rawName : `${rawName}.pdf`;

  return new File([blob], filename, { type: 'application/pdf' });
}

export async function deleteUserDocument(doc: StudyDocument): Promise<void> {
  documentChunksCache.delete(doc.id);
  if (!isSupabaseConfigured || doc.id.startsWith('local-')) return;

  if (doc.storage_path) {
    await supabase.storage.from('study-materials').remove([doc.storage_path]);
  }

  const { error } = await supabase.from('documents').delete().eq('id', doc.id);
  if (error && !isMissingTableError(error)) {
    throw new Error(error.message);
  }
}

/**
 * Updates a study material's name (title) and/or user-edited study notes.
 */
export async function updateDocumentDetails(
  doc: StudyDocument,
  updates: { title?: string; customNotes?: string }
): Promise<StudyDocument> {
  const cleanTitle = updates.title?.trim() || doc.title;
  const nextCustomNotes =
    updates.customNotes !== undefined
      ? updates.customNotes
      : doc.extracted_metadata?.custom_notes;

  const nextMetadata = {
    ...doc.extracted_metadata,
    ...(nextCustomNotes !== undefined ? { custom_notes: nextCustomNotes } : {}),
    ...(nextCustomNotes && nextCustomNotes.trim()
      ? { preview_snippet: nextCustomNotes.trim().slice(0, 220) }
      : {}),
  };

  if (isSupabaseConfigured && !doc.id.startsWith('local-')) {
    const { data, error } = await supabase
      .from('documents')
      .update({
        title: cleanTitle,
        extracted_metadata: nextMetadata,
      })
      .eq('id', doc.id)
      .select()
      .single();

    if (error && !isMissingTableError(error)) {
      throw new Error(error.message);
    }
    if (data) {
      return data as StudyDocument;
    }
  }

  return {
    ...doc,
    title: cleanTitle,
    extracted_metadata: nextMetadata,
  };
}

/**
 * Updates the text content of an extracted PDF page chunk in Supabase.
 */
export async function updateDocumentChunkText(
  chunkId: string | undefined,
  newText: string
): Promise<void> {
  const trimmed = newText.trim();
  if (!chunkId || !isSupabaseConfigured || chunkId.startsWith('local-')) return;

  const { error } = await supabase
    .from('document_chunks')
    .update({
      chunk_text: trimmed,
      token_count: trimmed.split(/\s+/).filter(Boolean).length,
    })
    .eq('id', chunkId);

  if (error && !isMissingTableError(error)) {
    throw new Error(error.message);
  }
}

export async function createOrGetSession(params: {
  userId: string;
  document: StudyDocument;
  language: DialectCode;
}): Promise<VoiceSession> {
  const { userId, document, language } = params;
  const fallbackSession: VoiceSession = {
    id: `local-session-${Date.now()}`,
    user_id: userId,
    document_id: document.id,
    session_title: document.title,
    session_language: language,
    duration_seconds: 0,
    created_at: new Date().toISOString(),
  };

  if (!isSupabaseConfigured || document.id.startsWith('local-')) {
    return fallbackSession;
  }

  const { data, error } = await supabase
    .from('voice_sessions')
    .insert({
      user_id: userId,
      document_id: document.id,
      session_title: document.title,
      session_language: language,
      duration_seconds: 0,
    })
    .select()
    .single();

  if (error || !data) {
    return fallbackSession;
  }

  return data as VoiceSession;
}

export async function persistSessionMessage(params: {
  sessionId: string;
  sender: 'user' | 'ai';
  text: string;
  similarity?: number;
  elapsedSecondsDelta?: number;
}): Promise<void> {
  const { sessionId, sender, text, similarity, elapsedSecondsDelta = 0 } = params;
  if (!isSupabaseConfigured || sessionId.startsWith('local-')) return;

  await supabase.from('chat_messages').insert({
    session_id: sessionId,
    sender,
    text_content: text,
    cosine_similarity: similarity ?? null,
  });

  if (elapsedSecondsDelta > 0) {
    const { data: current } = await supabase
      .from('voice_sessions')
      .select('duration_seconds')
      .eq('id', sessionId)
      .single();
    const nextDuration = (current?.duration_seconds || 0) + elapsedSecondsDelta;
    await supabase
      .from('voice_sessions')
      .update({
        duration_seconds: nextDuration,
        updated_at: new Date().toISOString(),
      })
      .eq('id', sessionId);
  }
}

/**
 * Sends ONE complete recorded audio question to the backend speech-to-text endpoint.
 * Falls back cleanly to the client speech-recognition buffer when backend/Gnani STT is offline.
 */
export async function transcribeCompleteRecording(params: {
  audioBlob: Blob | null;
  mimeType: string;
  language: DialectCode;
  fallbackTranscript: string;
}): Promise<string> {
  const { audioBlob, mimeType, language, fallbackTranscript } = params;
  const cleanedFallback = fallbackTranscript.trim();

  if (API_BASE_URL && !isBackendTemporarilyOffline() && audioBlob && audioBlob.size > 0) {
    try {
      const formData = new FormData();
      const ext = mimeType.includes('mp4') ? 'mp4' : 'webm';
      formData.append('audio', audioBlob, `question.${ext}`);
      formData.append('language', language);
      formData.append('fallback_transcript', cleanedFallback);

      const response = await fetch(`${API_BASE_URL}/voice/transcribe`, {
        method: 'POST',
        body: formData,
        signal: AbortSignal.timeout(cleanedFallback ? 3_500 : 8_000),
      });

      if (response.ok) {
        const data = await response.json();
        const transcript = (data.transcript || '').trim();
        if (transcript) return transcript;
      } else if (!cleanedFallback) {
        const errPayload = await response.json().catch(() => null);
        if (errPayload?.detail) {
          throw new Error(errPayload.detail);
        }
      }
    } catch (err: any) {
      if (isNetworkOrTimeoutError(err)) {
        markBackendOffline();
      } else if (!cleanedFallback && err?.message) {
        throw err;
      }
    }
  }

  if (cleanedFallback) {
    return cleanedFallback;
  }

  throw new Error(
    'No speech was detected in your recording. Please try again and speak clearly before clicking Stop.'
  );
}

/**
 * Generates spoken audio for a final AI answer via backend Gnani TTS (when configured).
 * Returns null cleanly if browser fallback TTS should be used.
 */
export async function synthesizeTutorAudio(
  text: string,
  language: DialectCode
): Promise<string | null> {
  if (!API_BASE_URL || !text.trim()) return null;

  try {
    const response = await fetch(`${API_BASE_URL}/voice/synthesize`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, language }),
      signal: AbortSignal.timeout(10_000),
    });
    if (response.ok) {
      const data = await response.json();
      return data.audio_url || null;
    }
  } catch {
    // Graceful fallback to browser TTS
  }
  return null;
}

/**
 * Answers a learner's question using ONLY real chunks extracted from the currently selected PDF
 * (via FastAPI Gemini backend if running, or strict PDF-grounded fallback retrieval).
 */
export async function askTutorQuestion(params: {
  document: StudyDocument;
  chunks: DocumentChunk[];
  query: string;
  language: DialectCode;
  userId?: string;
  sessionId?: string;
  conversationHistory?: Array<{ sender: 'user' | 'ai'; text: string }>;
}): Promise<{
  answerText: string;
  audioUrl: string | null;
  pillars: Array<{ label: string; title: string; summary: string }>;
  citations: Array<{ page: number; relevance_score: number; source: string; excerpt?: string }>;
}> {
  const {
    document,
    chunks,
    query,
    language,
    userId,
    sessionId,
    conversationHistory = [],
  } = params;

  const resolvedChunks =
    chunks.length > 0 ? chunks : await fetchDocumentChunks(document.id).catch(() => []);

  const combinedChunks: DocumentChunk[] = [...resolvedChunks];
  const customNotes = document.extracted_metadata?.custom_notes?.trim();
  if (customNotes) {
    combinedChunks.unshift({
      document_id: document.id,
      page_number: 1,
      chunk_index: -1,
      chunk_text: customNotes,
      token_count: customNotes.split(/\s+/).length,
    });
  }

  const chapters = detectChaptersInChunks(
    combinedChunks,
    document.extracted_metadata?.table_of_contents
  );

  const isAskingChapterList =
    /\b(chapter|chapters|content|contents|table of contents|outline|syllabus|topics|units|modules|index)\b/i.test(
      query
    ) &&
    /\b(how many|count|number|what|which|list|all|tell|give|show|were|are)\b/i.test(query) &&
    !/\bexplain\b.*\b(first|second|third|1|2|3|4|5|6|7|8|9|10)\b/i.test(query);

  const specificChapterMatch = query.match(
    /\b(?:chapter|unit|module|part)\s*(\d+|first|second|third|fourth|fifth|one|two|three|four|five)\b|\b(first|second|third)\s+chapter\b/i
  );

  const wordToIndex: Record<string, number> = {
    first: 1, one: 1, '1': 1,
    second: 2, two: 2, '2': 2,
    third: 3, three: 3, '3': 3,
    fourth: 4, four: 4, '4': 4,
    fifth: 5, five: 5, '5': 5,
  };

  let targetChapterIndex: number | null = null;
  if (specificChapterMatch) {
    const token = (specificChapterMatch[1] || specificChapterMatch[2] || '').toLowerCase();
    targetChapterIndex = wordToIndex[token] || (Number.isFinite(Number(token)) ? Number(token) : null);
  }

  const isChapterOrOverview =
    isAskingChapterList ||
    targetChapterIndex !== null ||
    /\b(overview|summarize|summary)\b/i.test(query);

  // Determine exact RAG chunks for backend Gemini prompt
  let contextForBackend: DocumentChunk[] = [];
  if (isAskingChapterList) {
    contextForBackend = combinedChunks.slice(0, 14);
  } else if (targetChapterIndex !== null && chapters.length >= targetChapterIndex) {
    const startPage = chapters[targetChapterIndex - 1].page;
    const nextChapter = chapters[targetChapterIndex];
    const endPage = nextChapter ? Math.max(startPage, nextChapter.page - 1) : startPage + 12;
    const chapterScoped = combinedChunks.filter(
      (c) => c.page_number >= startPage && c.page_number <= endPage
    );
    contextForBackend = chapterScoped.length > 0 ? chapterScoped.slice(0, 12) : findRelevantChunks(query, combinedChunks, 8);
  } else {
    contextForBackend = findRelevantChunks(query, combinedChunks, 8);
  }

  const relevantChunks = findRelevantChunks(query, combinedChunks, 4);

  const buildPillarsFromChunks = (
    list: Array<DocumentChunk & { relevanceScore: number }>
  ) =>
    list.slice(0, 3).map((c, idx) => {
      const firstSentence =
        c.chunk_text.split(/(?<=[.!?])\s+/)[0]?.trim() || c.chunk_text.slice(0, 90);
      return {
        label: `PILLAR 0${idx + 1}`,
        title: c.chunk_index === -1 ? 'Saved Study Notes' : `Page ${c.page_number} Key Point`,
        summary:
          firstSentence.length > 130 ? `${firstSentence.slice(0, 127).trim()}…` : firstSentence,
      };
    });

  // 1. Try FastAPI + Gemini + Gnani TTS backend
  if (API_BASE_URL && !isBackendTemporarilyOffline()) {
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (session?.access_token) {
        headers.Authorization = `Bearer ${session.access_token}`;
      }

      const tocChunk =
        chapters.length > 0
          ? [
              {
                page_number: 1,
                chunk_index: -2,
                chunk_text: `Extracted Document Chapters / Table of Contents (${chapters.length} entries):\n${chapters
                  .map((ch, i) => `${i + 1}. ${ch.title} (Page ${ch.page})`)
                  .join('\n')}`,
              },
            ]
          : [];

      const response = await fetch(`${API_BASE_URL}/voice/query`, {
        method: 'POST',
        headers,
        signal: AbortSignal.timeout(9_000),
        body: JSON.stringify({
          document_id: document.id,
          user_id: userId || session?.user?.id || null,
          text_query: query,
          language,
          session_id: sessionId || null,
          document_title: document.title,
          conversation_history: conversationHistory.slice(-6),
          context_chunks: [
            ...tocChunk,
            ...contextForBackend.map((c) => ({
              page_number: c.page_number,
              chunk_index: c.chunk_index,
              chunk_text: c.chunk_text,
            })),
          ],
        }),
      });

      if (response.ok) {
        const data = await response.json();
        return {
          answerText: data.answer_text,
          audioUrl: data.audio_url || null,
          pillars: buildPillarsFromChunks(relevantChunks),
          citations: data.grounded_citations || [],
        };
      } else {
        const errData = await response.json().catch(() => null);
        if (response.status === 403 || response.status === 401) {
          throw new Error(errData?.detail || 'You do not have permission to access this PDF.');
        }
      }
    } catch (err: any) {
      if (isNetworkOrTimeoutError(err)) {
        markBackendOffline();
      } else if (err?.message) {
        throw err;
      }
      // Backend offline / timed out -> fall back immediately to strict PDF-only client RAG retrieval
    }
  }

  // 2. Direct PDF-Only Grounded RAG Retrieval (zero dummy data, never invents outside facts)
  if (!combinedChunks.length) {
    const emptyMsg =
      language === 'hi'
        ? `"${document.title}" में पठनीय टेक्स्ट नहीं मिला। कृपया सुनिश्चित करें कि यह स्कैन की गई छवि के बजाय चयन योग्य टेक्स्ट वाली PDF है।`
        : language === 'gu'
        ? `"${document.title}" માં વાંચી શકાય તેવું લખાણ મળ્યું નથી. કૃપા કરીને ખાતરી કરો કે PDF માં ટેક્સ્ટ ઉપલબ્ધ છે.`
        : `No extractable text was found inside "${document.title}". If this PDF is a scanned image, please upload a text-searchable PDF.`;
    return { answerText: emptyMsg, audioUrl: null, pillars: [], citations: [] };
  }

  const cleanSnippet = (raw: string, max = 380) =>
    raw.length > max ? `${raw.slice(0, max).trim()}…` : raw;

  // Accurate whole-PDF Chapter count / listing answer
  if (isAskingChapterList) {
    if (chapters.length > 0) {
      const answerText = `I analyzed all ${document.page_count || combinedChunks[combinedChunks.length - 1].page_number} pages of "${document.title}" and found ${chapters.length} ${
        chapters.length === 1 ? 'chapter' : 'chapters'
      } in original order:\n\n${chapters
        .map((ch, idx) => `${idx + 1}. ${ch.title} (Page ${ch.page})`)
        .join('\n')}`;

      return {
        answerText,
        audioUrl: null,
        pillars: chapters.slice(0, 3).map((ch, idx) => ({
          label: `CHAPTER 0${idx + 1}`,
          title: `Page ${ch.page}`,
          summary: ch.title,
        })),
        citations: chapters.slice(0, 2).map((ch) => ({
          page: ch.page,
          relevance_score: 0.98,
          source: document.title,
          excerpt: ch.title,
        })),
      };
    }

    const tocPages = combinedChunks.filter(
      (c) =>
        c.page_number <= 15 && /\b(contents|table of contents|index|syllabus)\b/i.test(c.chunk_text)
    );
    const frontExcerpt =
      tocPages.length > 0
        ? tocPages
            .slice(0, 3)
            .map((c) => `[Page ${c.page_number}]\n${cleanSnippet(c.chunk_text, 420)}`)
            .join('\n\n')
        : combinedChunks
            .slice(0, 3)
            .map((c) => `[Page ${c.page_number}]\n${cleanSnippet(c.chunk_text, 320)}`)
            .join('\n\n');

    return {
      answerText: `From "${document.title}", here are the opening contents/sections extracted from the document:\n\n${frontExcerpt}`,
      audioUrl: null,
      pillars: buildPillarsFromChunks(
        (tocPages.length > 0 ? tocPages : combinedChunks).slice(0, 3).map((c) => ({
          ...c,
          relevanceScore: 0.85,
        }))
      ),
      citations: (tocPages.length > 0 ? tocPages : combinedChunks).slice(0, 2).map((c) => ({
        page: c.page_number,
        relevance_score: 0.85,
        source: document.title,
        excerpt: cleanSnippet(c.chunk_text, 160),
      })),
    };
  }

  // Specific chapter explanation (e.g. "Explain the first chapter")
  if (targetChapterIndex !== null) {
    if (chapters.length >= targetChapterIndex) {
      const ch = chapters[targetChapterIndex - 1];
      const nextCh = chapters[targetChapterIndex];
      const endPage = nextCh ? Math.max(ch.page, nextCh.page - 1) : ch.page + 6;
      const chapterChunks = combinedChunks
        .filter((c) => c.page_number >= ch.page && c.page_number <= endPage)
        .slice(0, 3);

      if (chapterChunks.length > 0) {
        const answerText = `Based on ${ch.title} of "${document.title}" (starting on Page ${ch.page}):\n\n${chapterChunks
          .map((c) => cleanSnippet(c.chunk_text, 280))
          .join('\n\n')}`;
        return {
          answerText,
          audioUrl: null,
          pillars: buildPillarsFromChunks(
            chapterChunks.map((c) => ({ ...c, relevanceScore: 0.92 }))
          ),
          citations: chapterChunks.slice(0, 2).map((c) => ({
            page: c.page_number,
            relevance_score: 0.92,
            source: document.title,
            excerpt: cleanSnippet(c.chunk_text, 160),
          })),
        };
      }
    } else if (chapters.length === 0) {
      // Fallback to Page 1 ordered opening content if PDF has no chapter headings
      const openingChunks = combinedChunks.slice(0, 2);
      const answerText = `"${document.title}" does not contain labeled chapter headings. Here is how the document begins (Page ${openingChunks[0].page_number}):\n\n${cleanSnippet(openingChunks[0].chunk_text, 400)}`;
      return {
        answerText,
        audioUrl: null,
        pillars: buildPillarsFromChunks(openingChunks.map((c) => ({ ...c, relevanceScore: 0.8 }))),
        citations: [
          {
            page: openingChunks[0].page_number,
            relevance_score: 0.8,
            source: document.title,
            excerpt: cleanSnippet(openingChunks[0].chunk_text, 160),
          },
        ],
      };
    } else {
      return {
        answerText: `"${document.title}" only has ${chapters.length} detected chapters, so Chapter ${targetChapterIndex} was not found.`,
        audioUrl: null,
        pillars: [],
        citations: [],
      };
    }
  }

  // Strict BM25 keyword overlap verification
  const queryTerms = extractQueryTerms(query);
  const primary = relevantChunks[0];
  const secondary = relevantChunks[1];

  if (!isChapterOrOverview && queryTerms.length > 0 && primary.termHits === 0 && conversationHistory.length === 0) {
    const notFoundMsg =
      language === 'hi'
        ? `चुनी गई PDF ("${document.title}") में इस प्रश्न का उत्तर देने के लिए पर्याप्त जानकारी उपलब्ध नहीं है।`
        : language === 'gu'
        ? `પસંદ કરેલી PDF ("${document.title}") માં આ પ્રશ્નનો જવાબ આપવા માટે પૂરતી માહિતી ઉપલબ્ધ નથી.`
        : `The selected PDF ("${document.title}") does not contain enough information to answer this question.`;
    return { answerText: notFoundMsg, audioUrl: null, pillars: [], citations: [] };
  }

  const isQuizRequest = /quiz|question|test|rapid-fire|mcq/i.test(query);

  let answerText = '';
  if (isQuizRequest) {
    const sentences = relevantChunks
      .flatMap((c) => c.chunk_text.split(/(?<=[.!?])\s+/))
      .map((s) => s.trim())
      .filter((s) => s.length > 35 && s.length < 180);

    const facts = sentences.slice(0, 3);
    if (facts.length > 0) {
      const qList = facts
        .map(
          (fact, idx) =>
            `${idx + 1}. Based on Page ${
              relevantChunks[Math.min(idx, relevantChunks.length - 1)].page_number
            }: "${fact}" — Can you explain this concept in your own words?`
        )
        .join('\n\n');
      answerText = `Here are ${facts.length} grounded study questions from "${document.title}":\n\n${qList}`;
    } else {
      answerText = `From "${document.title}" (Page ${primary.page_number}):\n\n${cleanSnippet(primary.chunk_text)}`;
    }
  } else {
    const prefix =
      language === 'hi'
        ? `"${document.title}" (पृष्ठ ${primary.page_number}) के आधार पर:\n\n`
        : language === 'gu'
        ? `"${document.title}" (પાનું ${primary.page_number}) મુજબ:\n\n`
        : `From "${document.title}" (Page ${primary.page_number}):\n\n`;

    answerText = `${prefix}${cleanSnippet(primary.chunk_text)}`;
    if (secondary && secondary.page_number !== primary.page_number && secondary.termHits > 0) {
      answerText += `\n\nRelated detail (Page ${secondary.page_number}): ${cleanSnippet(secondary.chunk_text, 220)}`;
    }
  }

  const citations = relevantChunks
    .filter((c) => isChapterOrOverview || c.termHits > 0)
    .slice(0, 2)
    .map((c) => ({
      page: c.page_number,
      relevance_score: Number(c.relevanceScore.toFixed(3)),
      source: document.title,
      excerpt: cleanSnippet(c.chunk_text, 160),
    }));

  return {
    answerText,
    audioUrl: null,
    pillars: buildPillarsFromChunks(relevantChunks),
    citations,
  };
}

