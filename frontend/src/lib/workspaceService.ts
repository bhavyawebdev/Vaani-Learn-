import { supabase, isSupabaseConfigured } from './supabase';
import { extractPdfContent, findRelevantChunks } from './pdfProcessor';
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

  const { data, error } = await supabase
    .from('document_chunks')
    .select('id, document_id, page_number, chunk_index, chunk_text, token_count')
    .eq('document_id', documentId)
    .order('chunk_index', { ascending: true });

  if (error || !data) return [];
  return data as DocumentChunk[];
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
  };

  // 4. Persist extracted chunks & mark document 'ready' in Supabase
  if (isSupabaseConfigured && persistedDocId) {
    if (documentChunks.length > 0) {
      // Insert in batches of 50 to stay well within payload limits
      for (let i = 0; i < documentChunks.length; i += 50) {
        const batch = documentChunks.slice(i, i + 50).map((chunk) => ({
          document_id: persistedDocId,
          page_number: chunk.page_number,
          chunk_index: chunk.chunk_index,
          chunk_text: chunk.chunk_text,
          token_count: chunk.token_count,
        }));
        const chunkInsert = await supabase.from('document_chunks').insert(batch);
        if (chunkInsert.error) {
          console.warn('[Chunk insert warning]', chunkInsert.error.message);
          break;
        }
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

  // 5. Notify FastAPI backend if running locally (non-blocking)
  if (API_BASE_URL) {
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('language', language);
      formData.append('user_id', userId);
      if (persistedDocId) formData.append('document_id', persistedDocId);
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
 * Answers a learner's question using ONLY real chunks extracted from the user's PDF
 * (via FastAPI Gemini backend if running, or direct grounded excerpt retrieval).
 */
export async function askTutorQuestion(params: {
  document: StudyDocument;
  chunks: DocumentChunk[];
  query: string;
  language: DialectCode;
  sessionId?: string;
}): Promise<{
  answerText: string;
  pillars: Array<{ label: string; title: string; summary: string }>;
  citations: Array<{ page: number; relevance_score: number; source: string; excerpt?: string }>;
}> {
  const { document, chunks, query, language, sessionId } = params;

  const combinedChunks: DocumentChunk[] = [...chunks];
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

  // 1. Try FastAPI + Gemini backend if running
  if (API_BASE_URL) {
    try {
      const response = await fetch(`${API_BASE_URL}/voice/query`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          document_id: document.id,
          text_query: query,
          language,
          session_id: sessionId || null,
          document_title: document.title,
          context_chunks: relevantChunks.map((c) => ({
            page_number: c.page_number,
            chunk_text: c.chunk_text,
          })),
        }),
      });

      if (response.ok) {
        const data = await response.json();
        return {
          answerText: data.answer_text,
          pillars: buildPillarsFromChunks(relevantChunks),
          citations: data.grounded_citations || [],
        };
      }
    } catch {
      // Backend offline -> fall back gracefully to real document-grounded retrieval
    }
  }

  // 2. Direct Grounded Retrieval from the user's real PDF chunks (zero dummy data)
  if (!relevantChunks.length) {
    const emptyMsg =
      language === 'hi'
        ? `"${document.title}" में पठनीय टेक्स्ट नहीं मिला। कृपया सुनिश्चित करें कि यह स्कैन की गई छवि के बजाय चयन योग्य टेक्स्ट वाली PDF है।`
        : language === 'gu'
        ? `"${document.title}" માં વાંચી શકાય તેવું લખાણ મળ્યું નથી. કૃપા કરીને ખાતરી કરો કે PDF માં ટેક્સ્ટ ઉપલબ્ધ છે.`
        : `No extractable text was found inside "${document.title}". If this PDF is a scanned image, please upload a text-searchable PDF.`;
    return { answerText: emptyMsg, pillars: [], citations: [] };
  }

  const primary = relevantChunks[0];
  const secondary = relevantChunks[1];

  const cleanSnippet = (raw: string, max = 380) =>
    raw.length > max ? `${raw.slice(0, max).trim()}…` : raw;

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
        .map((fact, idx) => `${idx + 1}. Based on Page ${relevantChunks[Math.min(idx, relevantChunks.length - 1)].page_number}: "${fact}" — Can you explain this concept in your own words?`)
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
    if (secondary && secondary.page_number !== primary.page_number) {
      answerText += `\n\nRelated detail (Page ${secondary.page_number}): ${cleanSnippet(secondary.chunk_text, 220)}`;
    }
  }

  const citations = relevantChunks.slice(0, 2).map((c) => ({
    page: c.page_number,
    relevance_score: Number(c.relevanceScore.toFixed(3)),
    source: document.title,
    excerpt: cleanSnippet(c.chunk_text, 160),
  }));

  return { answerText, pillars: buildPillarsFromChunks(relevantChunks), citations };
}

