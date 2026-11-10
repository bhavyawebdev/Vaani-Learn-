export type DialectCode = 'en' | 'hi' | 'gu';

export type DocumentStatus = 'uploading' | 'processing' | 'ready' | 'failed';

export interface StudyDocument {
  id: string;
  user_id: string;
  title: string;
  storage_path: string;
  file_size_bytes: number;
  page_count: number;
  language: DialectCode;
  status: DocumentStatus;
  extracted_metadata: {
    chunk_count?: number;
    vocab_count?: number;
    char_count?: number;
    preview_snippet?: string;
    custom_notes?: string;
    table_of_contents?: Array<{ title: string; page: number }>;
    [key: string]: unknown;
  };
  created_at: string;
}

export interface DocumentChunk {
  id?: string;
  document_id: string;
  page_number: number;
  chunk_index: number;
  chunk_text: string;
  token_count: number;
}

export interface VoiceSession {
  id: string;
  user_id: string;
  document_id: string | null;
  session_title: string;
  session_language: DialectCode;
  duration_seconds: number;
  created_at: string;
  updated_at?: string;
}

export interface TutorMessage {
  id: string;
  session_id?: string;
  sender: 'user' | 'ai';
  text: string;
  language: DialectCode;
  wasVoice?: boolean;
  audioUrl?: string | null;
  ttsFailed?: boolean;
  pillars?: Array<{
    label: string;
    title: string;
    summary: string;
  }>;
  citations?: Array<{
    page: number;
    relevance_score: number;
    source: string;
    excerpt?: string;
  }>;
  created_at: string;
}

