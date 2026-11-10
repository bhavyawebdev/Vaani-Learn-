import React, { useState, useEffect, useRef } from 'react';
import {
  Mic,
  ArrowUp,
  ArrowRight,
  Sparkles,
  FileText,
  Volume2,
  Square,
  FileUp,
  AlertCircle,
  Loader2,
  BookOpen,
  FileCheck2,
  Languages,
  Headphones,
  Lock,
  Play,
  Paperclip,
  ThumbsUp,
  Copy,
  Check,
  BookmarkPlus,
  Pencil,
  Trash2,
  ExternalLink,
  Search,
} from 'lucide-react';
import type {
  DialectCode,
  DocumentChunk,
  StudyDocument,
  TutorMessage,
  VoiceSession,
} from '../../types/workspace';
import {
  askTutorQuestion,
  createOrGetSession,
  persistSessionMessage,
  MAX_PDF_LIMIT_NOTE,
} from '../../lib/workspaceService';
import {
  DIALECT_CONFIG,
  speakText,
  stopSpeaking,
  startVoiceRecognition,
  type SpeechRecognitionHandle,
} from '../../lib/voiceUtils';
import { formatShortDocTitle } from '../../lib/pdfProcessor';

interface TutorViewProps {
  userId: string;
  userName: string;
  sessionsCount: number;
  documents: StudyDocument[];
  selectedDocument: StudyDocument | null;
  documentChunks: DocumentChunk[];
  isLoadingChunks: boolean;
  activeLanguage: DialectCode;
  pendingPrompt: string | null;
  onConsumePendingPrompt: () => void;
  onSelectDocument: (doc: StudyDocument) => void;
  onSelectLanguage: (lang: DialectCode) => void;
  onTriggerUpload: () => void;
  onGoToLibrary: () => void;
  onEditDocumentNotes: (doc: StudyDocument, prefillNote?: string) => void;
  onDeleteDocument: (doc: StudyDocument) => void;
  onSessionCreated: (session: VoiceSession) => void;
}

const WAVE_BARS = [10, 18, 12, 24, 16, 28, 20, 26, 14, 22, 12, 18, 10, 14];

export const TutorView: React.FC<TutorViewProps> = ({
  userId,
  userName,
  sessionsCount,
  documents,
  selectedDocument,
  documentChunks,
  isLoadingChunks,
  activeLanguage,
  pendingPrompt,
  onConsumePendingPrompt,
  onSelectDocument,
  onSelectLanguage,
  onTriggerUpload,
  onGoToLibrary,
  onEditDocumentNotes,
  onDeleteDocument,
  onSessionCreated,
}) => {
  const readyDocs = documents.filter((d) => d.status === 'ready');
  const activeDoc =
    selectedDocument && readyDocs.some((d) => d.id === selectedDocument.id)
      ? selectedDocument
      : readyDocs[0] || null;

  const [messages, setMessages] = useState<TutorMessage[]>([]);
  const [inputText, setInputText] = useState('');
  const [isThinking, setIsThinking] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [speakingMessageId, setSpeakingMessageId] = useState<string | null>(null);
  const [playbackSpeed, setPlaybackSpeed] = useState<number>(1.0);
  const [voiceError, setVoiceError] = useState<string | null>(null);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);

  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [helpfulIds, setHelpfulIds] = useState<Record<string, boolean>>({});
  const [expandedExcerpts, setExpandedExcerpts] = useState<Record<string, boolean>>({});

  const recognitionRef = useRef<SpeechRecognitionHandle | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  const firstName = userName.split(/\s+/)[0] || 'Learner';

  // Reset conversation when switching documents
  useEffect(() => {
    setMessages([]);
    setActiveSessionId(null);
    setVoiceError(null);
    stopSpeaking();
    setSpeakingMessageId(null);
  }, [activeDoc?.id]);

  // Auto-scroll chat to bottom
  useEffect(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: 'smooth',
    });
  }, [messages, isThinking]);

  // Auto-run prompt triggered from Dashboard prompt card
  useEffect(() => {
    if (pendingPrompt && activeDoc && !isLoadingChunks) {
      const promptToRun = pendingPrompt;
      onConsumePendingPrompt();
      void handleSendQuery(promptToRun, false);
    }
  }, [pendingPrompt, activeDoc?.id, isLoadingChunks]);

  const handleSendQuery = async (customQuery?: string, viaVoice = false) => {
    const queryText = (customQuery ?? inputText).trim();
    if (!queryText || !activeDoc || isThinking) return;

    if (!customQuery) setInputText('');
    setVoiceError(null);

    const userMsg: TutorMessage = {
      id: `u-${Date.now()}`,
      sender: 'user',
      text: queryText,
      language: activeLanguage,
      wasVoice: viaVoice,
      created_at: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, userMsg]);
    setIsThinking(true);

    try {
      let currentSessionId = activeSessionId;
      if (!currentSessionId) {
        const createdSession = await createOrGetSession({
          userId,
          document: activeDoc,
          language: activeLanguage,
        });
        currentSessionId = createdSession.id;
        setActiveSessionId(currentSessionId);
        onSessionCreated(createdSession);
      }

      await persistSessionMessage({
        sessionId: currentSessionId,
        sender: 'user',
        text: queryText,
      });

      const { answerText, pillars, citations } = await askTutorQuestion({
        document: activeDoc,
        chunks: documentChunks,
        query: queryText,
        language: activeLanguage,
        sessionId: currentSessionId,
      });

      const aiMsg: TutorMessage = {
        id: `a-${Date.now()}`,
        session_id: currentSessionId,
        sender: 'ai',
        text: answerText,
        language: activeLanguage,
        pillars,
        citations,
        created_at: new Date().toISOString(),
      };

      setMessages((prev) => [...prev, aiMsg]);

      await persistSessionMessage({
        sessionId: currentSessionId,
        sender: 'ai',
        text: answerText,
        similarity: citations[0]?.relevance_score,
        elapsedSecondsDelta: 45,
      });
    } catch (err: any) {
      setVoiceError(err?.message || 'Unable to process question right now.');
    } finally {
      setIsThinking(false);
    }
  };

  const handleToggleMic = () => {
    if (isListening) {
      recognitionRef.current?.stop();
      setIsListening(false);
      return;
    }

    setVoiceError(null);
    setIsListening(true);
    recognitionRef.current = startVoiceRecognition({
      dialect: activeLanguage,
      onResult: (transcript) => {
        setInputText(transcript);
        void handleSendQuery(transcript, true);
      },
      onError: (msg) => setVoiceError(msg),
      onEnd: () => setIsListening(false),
    });
  };

  const handleSpeakMessage = (msg: TutorMessage) => {
    if (speakingMessageId === msg.id) {
      stopSpeaking();
      setSpeakingMessageId(null);
      return;
    }

    speakText(
      msg.text,
      msg.language || activeLanguage,
      () => setSpeakingMessageId(msg.id),
      () => setSpeakingMessageId(null)
    );
  };

  const handleCopyText = async (msg: TutorMessage) => {
    try {
      await navigator.clipboard.writeText(msg.text);
      setCopiedId(msg.id);
      setTimeout(() => setCopiedId(null), 2000);
    } catch {
      // Clipboard blocked
    }
  };

  const cycleSpeed = () => {
    const speeds = [1.0, 1.25, 1.5];
    setPlaybackSpeed(speeds[(speeds.indexOf(playbackSpeed) + 1) % speeds.length]);
  };

  // =========================================================================
  // SCREEN 1: EMPTY STATE (0 uploaded documents / notes)
  // =========================================================================
  if (readyDocs.length === 0) {
    return (
      <div className="max-w-5xl mx-auto space-y-5 animate-in fade-in duration-200">
        {/* Top Header */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2.5 text-[10px] font-semibold tracking-[0.12em] uppercase">
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#EFEFEE] text-[#474646]">
                <span className="w-1.5 h-1.5 rounded-full bg-[#1A1C1B]" />
                ACOUSTIC RETRIEVAL STUDIO
              </span>
              <span className="text-[#747878] normal-case tracking-normal text-xs font-medium">
                Session {String(sessionsCount).padStart(2, '0')}
              </span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-[#1A1C1B] mt-2">
              My Tutor
            </h1>
            <p className="text-xs sm:text-sm text-[#5E5E5E] mt-1">
              Ask questions and learn directly from your study materials in your preferred tongue.
            </p>
          </div>

          {/* Language Switcher Pills */}
          <div className="inline-flex flex-wrap items-center bg-white border border-[#EAEAEA] p-1 rounded-full self-start lg:self-auto max-w-full">
            {(['en', 'hi', 'gu'] as DialectCode[]).map((code) => (
              <button
                key={code}
                type="button"
                onClick={() => onSelectLanguage(code)}
                className={`px-2.5 sm:px-3.5 py-1.5 rounded-full text-xs font-medium transition inline-flex items-center gap-1.5 ${
                  activeLanguage === code
                    ? 'bg-black text-white shadow-xs'
                    : 'text-[#5E5E5E] hover:text-black'
                }`}
              >
                <span>{DIALECT_CONFIG[code].nativeLabel}</span>
                <span className="text-[10px] opacity-70 uppercase">{code}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Active Corpus Selector Bar */}
        <div className="bg-white rounded-2xl border border-[#EAEAEA] px-4 sm:px-5 py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-[#F4F4F2] flex items-center justify-center text-[#747878] flex-shrink-0">
              <FileText className="w-4 h-4" />
            </div>
            <div>
              <p className="text-[10px] font-semibold tracking-[0.12em] text-[#747878] uppercase">
                ACTIVE CORPUS
              </p>
              <p className="text-xs sm:text-sm font-semibold text-[#1A1C1B]">
                No document selected — Choose a study material
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 self-end sm:self-auto">
            <span className="px-3 py-1.5 rounded-full bg-[#F4F4F2] text-[11px] font-medium text-[#5E5E5E]">
              0 Documents available
            </span>
            <button
              type="button"
              onClick={onGoToLibrary}
              className="px-3.5 py-1.5 rounded-full bg-white border border-[#E2E2E0] hover:border-black text-xs font-medium text-[#1A1C1B] transition"
            >
              ↕ Select Source
            </button>
          </div>
        </div>

        {/* Central Empty State Card */}
        <div className="bg-white rounded-[28px] border border-[#EAEAEA] p-6 sm:p-10 text-center space-y-6 shadow-[0_6px_28px_rgba(0,0,0,0.02)]">
          <div className="flex flex-col items-center max-w-lg mx-auto">
            <div className="relative inline-flex items-center justify-center mb-4">
              <div className="w-16 h-16 rounded-full bg-[#F4F4F2] flex items-center justify-center text-[#1A1C1B]">
                <BookOpen className="w-7 h-7 stroke-[1.75]" />
              </div>
              <div className="absolute -bottom-1 -right-1 w-7 h-7 rounded-full bg-black text-white flex items-center justify-center border-2 border-white shadow-sm">
                <Mic className="w-3.5 h-3.5" />
              </div>
            </div>

            <span className="px-3 py-1 rounded-full bg-[#EFEFEE] text-[#5E5E5E] text-[10px] font-semibold tracking-[0.12em] uppercase">
              SYNCHRONOUS AUDIO GROUNDING
            </span>

            <h2 className="text-xl sm:text-2xl font-bold text-[#1A1C1B] mt-3 tracking-tight">
              Your AI tutor is ready.
            </h2>
            <p className="text-xs sm:text-sm text-[#5E5E5E] mt-2 leading-relaxed">
              Select a study material from your library and ask your first question. VaaniLearn
              grounds every explanation directly in your uploaded textbook chapters or notes.
            </p>

            <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
              <button
                type="button"
                onClick={onGoToLibrary}
                className="bg-black hover:bg-neutral-800 text-white text-xs sm:text-sm font-medium px-5 py-3 rounded-full inline-flex items-center gap-2 shadow-xs transition"
              >
                <span>Go to My Library to Upload PDF</span>
                <ArrowRight className="w-4 h-4" />
              </button>

              <button
                type="button"
                onClick={onTriggerUpload}
                className="bg-white hover:bg-[#F4F4F2] text-[#1A1C1B] text-xs sm:text-sm font-medium px-5 py-3 rounded-full border border-[#E2E2E0] inline-flex items-center gap-2 transition"
              >
                <FileUp className="w-4 h-4" />
                <span>Upload PDF Directly</span>
              </button>
            </div>

            <p className="mt-3 text-[11px] text-[#747878]">{MAX_PDF_LIMIT_NOTE}</p>
          </div>

          {/* 3 Grounded Capability Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-left pt-2">
            <div className="bg-[#F9F9F7] border border-[#F1F1EF] rounded-2xl p-4 space-y-2.5">
              <div className="w-8 h-8 rounded-lg bg-white border border-[#EAEAEA] flex items-center justify-center text-[#1A1C1B]">
                <FileCheck2 className="w-4 h-4" />
              </div>
              <div>
                <h3 className="text-xs sm:text-sm font-bold text-[#1A1C1B]">
                  Strict Grounded Retrieval
                </h3>
                <p className="text-[11px] sm:text-xs text-[#5E5E5E] mt-1 leading-relaxed">
                  No hallucinations. References exact pages, numbered sections, and direct quotes.
                </p>
              </div>
            </div>

            <div className="bg-[#F9F9F7] border border-[#F1F1EF] rounded-2xl p-4 space-y-2.5">
              <div className="w-8 h-8 rounded-lg bg-white border border-[#EAEAEA] flex items-center justify-center text-[#1A1C1B]">
                <Languages className="w-4 h-4" />
              </div>
              <div>
                <h3 className="text-xs sm:text-sm font-bold text-[#1A1C1B]">Trilingual Fluency</h3>
                <p className="text-[11px] sm:text-xs text-[#5E5E5E] mt-1 leading-relaxed">
                  Natural spoken dialogue in Hindi, Gujarati, and Indian English with clear nuance.
                </p>
              </div>
            </div>

            <div className="bg-[#F9F9F7] border border-[#F1F1EF] rounded-2xl p-4 space-y-2.5">
              <div className="w-8 h-8 rounded-lg bg-white border border-[#EAEAEA] flex items-center justify-center text-[#1A1C1B]">
                <Headphones className="w-4 h-4" />
              </div>
              <div>
                <h3 className="text-xs sm:text-sm font-bold text-[#1A1C1B]">Listen &amp; Learn</h3>
                <p className="text-[11px] sm:text-xs text-[#5E5E5E] mt-1 leading-relaxed">
                  Full acoustic playback with adjustable speed, clean phonetics, and transcripts.
                </p>
              </div>
            </div>
          </div>

          <div className="pt-4 border-t border-[#F1F1EF] flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-[11px] text-[#747878]">
            <span className="inline-flex items-center justify-center sm:justify-start gap-1.5">
              <Lock className="w-3.5 h-3.5" />
              <span>Supabase Vector Memory</span>
            </span>
            <span>Model: Grounded Vaani (Multilingual) • Latency: &lt;140ms Voice Pipeline</span>
          </div>
        </div>

        {/* Disabled Query Bar in Empty State */}
        <div className="space-y-2">
          <div className="bg-white border border-[#EAEAEA] rounded-full px-3.5 sm:px-4 py-2.5 flex items-center justify-between gap-2 sm:gap-3 opacity-80">
            <div className="flex items-center gap-2.5 text-xs text-[#858383] min-w-0 flex-1">
              <Search className="w-4 h-4 flex-shrink-0" />
              <span className="truncate">
                Upload or select a study material to start asking questions...
              </span>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              <span className="px-2.5 py-1 rounded-full bg-[#F4F4F2] text-[10px] font-semibold tracking-wider text-[#747878] uppercase">
                DOC REQUIRED
              </span>
              <span className="w-8 h-8 rounded-full bg-[#C8C6C5] text-white flex items-center justify-center">
                <Mic className="w-3.5 h-3.5" />
              </span>
            </div>
          </div>
          <p className="text-center text-[11px] text-[#858383]">
            • AI tutor references only approved textbook chapters • Supabase Encrypted •
          </p>
        </div>
      </div>
    );
  }

  // =========================================================================
  // SCREEN 2: DYNAMIC STATE (User has uploaded PDFs / notes)
  // =========================================================================
  return (
    <div className="max-w-5xl mx-auto flex flex-col min-h-[calc(100dvh-7.5rem)] space-y-5 animate-in fade-in duration-200">
      {/* Top Dynamic Header (Document Switcher + Dialect Switcher + CRUD actions) */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-4 border-b border-[#EAEAEA]">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-[#1A1C1B]">
              My Tutor
            </h1>
            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-[#EFEFEE] text-[#474646] text-[10px] font-semibold tracking-wider uppercase">
              <span className="w-1.5 h-1.5 rounded-full bg-[#1A1C1B]" />
              AUDIO-GUIDED
            </span>
          </div>
          <p className="text-xs sm:text-sm text-[#5E5E5E] mt-1">
            Ask questions and understand your study materials in real-time dialect.
          </p>
        </div>

        <div className="flex flex-col sm:flex-row sm:items-center gap-2.5">
          {/* Active Study Material Pill + Rename/Edit/Delete CRUD Controls */}
          {activeDoc && (
            <div className="bg-white border border-[#EAEAEA] rounded-2xl px-3 py-1.5 flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <FileText className="w-4 h-4 text-[#1A1C1B] flex-shrink-0" />
                <div className="min-w-0">
                  <select
                    value={activeDoc.id}
                    onChange={(e) => {
                      const next = readyDocs.find((d) => d.id === e.target.value);
                      if (next) onSelectDocument(next);
                    }}
                    className="text-xs font-semibold text-[#1A1C1B] bg-transparent outline-none cursor-pointer w-full max-w-[150px] sm:max-w-[210px] truncate block"
                    aria-label="Select study document"
                  >
                    {readyDocs.map((doc) => (
                      <option key={doc.id} value={doc.id}>
                        {doc.title}
                      </option>
                    ))}
                  </select>
                  <p className="text-[10px] text-[#747878]">
                    Active • {activeDoc.page_count}{' '}
                    {activeDoc.page_count === 1 ? 'Page' : 'Pages'}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-1 border-l border-[#F1F1EF] pl-1.5 flex-shrink-0">
                <button
                  type="button"
                  onClick={() => onEditDocumentNotes(activeDoc)}
                  className="p-1.5 text-[#5E5E5E] hover:text-black hover:bg-[#F4F4F2] rounded-lg transition"
                  title="Edit notes & rename material"
                  aria-label="Edit notes and rename material"
                >
                  <Pencil className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => onDeleteDocument(activeDoc)}
                  className="p-1.5 text-[#5E5E5E] hover:text-rose-600 hover:bg-rose-50 rounded-lg transition"
                  title="Delete material"
                  aria-label="Delete material"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          )}

          {/* Language Pills */}
          <div className="inline-flex items-center bg-white border border-[#EAEAEA] p-1 rounded-full self-start sm:self-auto">
            {(['en', 'hi', 'gu'] as DialectCode[]).map((code) => (
              <button
                key={code}
                type="button"
                onClick={() => onSelectLanguage(code)}
                className={`px-3 py-1.5 rounded-full text-xs font-medium transition ${
                  activeLanguage === code
                    ? 'bg-black text-white shadow-xs'
                    : 'text-[#5E5E5E] hover:text-black'
                }`}
              >
                {DIALECT_CONFIG[code].nativeLabel}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Document Divider Title */}
      {activeDoc && (
        <div className="flex items-center gap-3 text-[10px] font-semibold tracking-[0.16em] text-[#747878] uppercase">
          <span className="flex-1 h-px bg-[#EAEAEA]" />
          <span className="truncate max-w-[80%]">
            {formatShortDocTitle(activeDoc.title, 42)} • {activeDoc.page_count} PAGES
          </span>
          <span className="flex-1 h-px bg-[#EAEAEA]" />
        </div>
      )}

      {/* Conversation Stream */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto space-y-6 pr-1">
        {messages.length === 0 && activeDoc && (
          <div className="bg-white rounded-[24px] border border-[#EAEAEA] p-6 sm:p-8 text-center max-w-2xl mx-auto my-4 space-y-4">
            <div className="w-12 h-12 rounded-full bg-[#F4F4F2] mx-auto flex items-center justify-center text-[#1A1C1B]">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-bold text-[#1A1C1B]">
                Grounded on {formatShortDocTitle(activeDoc.title, 36)}
              </h2>
              <p className="text-xs sm:text-sm text-[#5E5E5E] mt-1 leading-relaxed">
                {isLoadingChunks
                  ? 'Loading extracted text sections...'
                  : `${documentChunks.length} study sections ready. Speak using the microphone or type your question below.`}
              </p>
            </div>

            <div className="flex flex-wrap items-center justify-center gap-2 pt-1">
              <button
                type="button"
                onClick={() =>
                  void handleSendQuery(
                    `Explain the core concepts in ${formatShortDocTitle(activeDoc.title, 22)} in ${DIALECT_CONFIG[activeLanguage].label}.`
                  )
                }
                className="px-4 py-2 rounded-full bg-[#F4F4F2] hover:bg-[#EAEAE7] text-xs font-medium text-[#1A1C1B] transition"
              >
                Explain core concepts
              </button>
              <button
                type="button"
                onClick={() =>
                  void handleSendQuery(
                    `Quiz me on ${formatShortDocTitle(activeDoc.title, 22)} with 3 questions.`
                  )
                }
                className="px-4 py-2 rounded-full bg-[#F4F4F2] hover:bg-[#EAEAE7] text-xs font-medium text-[#1A1C1B] transition"
              >
                Quiz me on this material
              </button>
              <button
                type="button"
                onClick={() => onEditDocumentNotes(activeDoc)}
                className="px-4 py-2 rounded-full bg-white border border-[#EAEAEA] hover:border-black text-xs font-medium text-[#1A1C1B] inline-flex items-center gap-1.5 transition"
              >
                <Pencil className="w-3 h-3" />
                <span>View / Edit Notes</span>
              </button>
            </div>
          </div>
        )}

        {messages.map((msg) => {
          const msgTime = new Date(msg.created_at).toLocaleTimeString([], {
            hour: 'numeric',
            minute: '2-digit',
          });

          if (msg.sender === 'user') {
            return (
              <div key={msg.id} className="flex flex-col items-end space-y-1.5">
                <span className="text-[11px] text-[#747878]">
                  {firstName} • {DIALECT_CONFIG[msg.language].label} Prompt • {msgTime}
                </span>
                <div className="max-w-[90%] sm:max-w-[75%] bg-[#EFEFEE] text-[#1A1C1B] rounded-2xl rounded-tr-sm px-4 py-3 text-xs sm:text-sm leading-relaxed">
                  {msg.text}
                </div>
                {msg.wasVoice && (
                  <span className="inline-flex items-center gap-1 text-[11px] text-[#747878]">
                    <Mic className="w-3 h-3" />
                    <span>Audio transcribed via microphone</span>
                  </span>
                )}
              </div>
            );
          }

          const isPlaying = speakingMessageId === msg.id;
          const isCopied = copiedId === msg.id;
          const isHelpful = Boolean(helpfulIds[msg.id]);
          const isExcerptOpen = Boolean(expandedExcerpts[msg.id]);

          return (
            <div key={msg.id} className="space-y-2.5">
              {/* Tutor Avatar Label */}
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 rounded-full bg-black text-white flex items-center justify-center">
                  <Sparkles className="w-3 h-3" />
                </div>
                <span className="text-xs font-semibold text-[#1A1C1B]">Vaani Tutor</span>
                <span className="px-2.5 py-0.5 rounded-full bg-[#EFEFEE] text-[#5E5E5E] text-[10px] font-medium">
                  Document Grounded
                </span>
              </div>

              {/* Response Card (Matches Screen 2 Layout) */}
              <div className="bg-white rounded-[24px] border border-[#EAEAEA] p-4 sm:p-6 space-y-5 shadow-[0_4px_20px_rgba(0,0,0,0.02)]">
                {/* Spoken Synthesis Player Bar */}
                <div className="bg-[#F9F9F7] border border-[#F1F1EF] rounded-2xl p-3 sm:px-4 flex flex-wrap sm:flex-nowrap items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      onClick={() => handleSpeakMessage(msg)}
                      className="w-9 h-9 rounded-full bg-black hover:bg-neutral-800 text-white flex items-center justify-center flex-shrink-0 transition"
                      aria-label={isPlaying ? 'Stop voice synthesis' : 'Play voice synthesis'}
                    >
                      {isPlaying ? (
                        <Square className="w-3.5 h-3.5 fill-current" />
                      ) : (
                        <Play className="w-3.5 h-3.5 fill-current ml-0.5" />
                      )}
                    </button>

                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-semibold text-[#1A1C1B]">
                          Spoken Synthesis
                        </span>
                        <span className="text-[11px] text-[#747878]">
                          Natural {DIALECT_CONFIG[msg.language].label}
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={cycleSpeed}
                        className="text-[10px] text-[#5E5E5E] hover:text-black font-medium"
                      >
                        Playback Speed: {playbackSpeed.toFixed(2).replace(/\.00$/, '.0')}x
                      </button>
                    </div>
                  </div>

                  {/* Waveform Bars */}
                  <div className="hidden sm:flex items-center gap-1 h-7">
                    {WAVE_BARS.map((h, idx) => (
                      <span
                        key={idx}
                        className={`w-1 rounded-full transition-all ${
                          isPlaying
                            ? 'bg-black animate-pulse'
                            : idx < 6
                            ? 'bg-[#1A1C1B]'
                            : 'bg-[#D5D5D2]'
                        }`}
                        style={{ height: `${h}px` }}
                      />
                    ))}
                  </div>

                  <button
                    type="button"
                    onClick={() => handleSpeakMessage(msg)}
                    className="text-xs font-semibold text-[#1A1C1B] hover:underline inline-flex items-center gap-1"
                  >
                    <Volume2 className="w-3.5 h-3.5" />
                    <span>{isPlaying ? 'Stop' : 'Listen'}</span>
                  </button>
                </div>

                {/* Main Answer Text */}
                <p className="text-xs sm:text-sm text-[#1A1C1B] leading-relaxed whitespace-pre-line">
                  {msg.text}
                </p>

                {/* Dynamic Grounded Key Pillars from Real PDF Excerpts */}
                {msg.pillars && msg.pillars.length > 0 && (
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    {msg.pillars.map((pillar, i) => (
                      <div
                        key={i}
                        className="bg-[#F9F9F7] border border-[#F1F1EF] rounded-2xl p-4 space-y-1.5"
                      >
                        <span className="text-[10px] font-semibold tracking-widest text-[#747878] uppercase">
                          {pillar.label}
                        </span>
                        <h4 className="text-xs sm:text-sm font-bold text-[#1A1C1B]">
                          {pillar.title}
                        </h4>
                        <p className="text-[11px] sm:text-xs text-[#5E5E5E] leading-relaxed">
                          {pillar.summary}
                        </p>
                      </div>
                    ))}
                  </div>
                )}

                {/* Source Citation Footer */}
                {msg.citations && msg.citations.length > 0 && (
                  <div className="pt-3 border-t border-[#F1F1EF] space-y-2.5">
                    <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                      <span className="inline-flex items-center gap-1.5 text-[#5E5E5E]">
                        <BookOpen className="w-3.5 h-3.5" />
                        <span>
                          Source: <strong className="text-[#1A1C1B]">Page {msg.citations[0].page}</strong>{' '}
                          in {msg.citations[0].source}
                        </span>
                      </span>

                      <button
                        type="button"
                        onClick={() =>
                          setExpandedExcerpts((prev) => ({
                            ...prev,
                            [msg.id]: !prev[msg.id],
                          }))
                        }
                        className="font-semibold text-[#1A1C1B] hover:underline inline-flex items-center gap-1"
                      >
                        <span>{isExcerptOpen ? 'Hide Source Excerpt' : 'View Source Excerpt'}</span>
                        <ExternalLink className="w-3 h-3" />
                      </button>
                    </div>

                    {isExcerptOpen && (
                      <div className="bg-[#F9F9F7] border border-[#EAEAEA] rounded-xl p-3 space-y-2 text-xs text-[#5E5E5E]">
                        {msg.citations.map((cit, idx) => (
                          <div key={idx}>
                            <span className="font-semibold text-[#1A1C1B]">
                              Page {cit.page} ({Math.round(cit.relevance_score * 100)}% match):
                            </span>{' '}
                            "{cit.excerpt}"
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* Action Chips Row */}
                <div className="flex flex-wrap items-center gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() =>
                      setHelpfulIds((prev) => ({ ...prev, [msg.id]: !prev[msg.id] }))
                    }
                    className={`px-3 py-1.5 rounded-full border text-xs font-medium inline-flex items-center gap-1.5 transition ${
                      isHelpful
                        ? 'bg-black text-white border-black'
                        : 'bg-[#F9F9F7] border-[#EAEAEA] text-[#474646] hover:border-black'
                    }`}
                  >
                    <ThumbsUp className="w-3 h-3" />
                    <span>{isHelpful ? 'Helpful' : 'Helpful'}</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => void handleCopyText(msg)}
                    className="px-3 py-1.5 rounded-full border border-[#EAEAEA] bg-[#F9F9F7] hover:border-black text-xs font-medium text-[#474646] inline-flex items-center gap-1.5 transition"
                  >
                    {isCopied ? (
                      <>
                        <Check className="w-3 h-3 text-emerald-600" />
                        <span>Copied!</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-3 h-3" />
                        <span>Copy Notes</span>
                      </>
                    )}
                  </button>

                  {activeDoc && (
                    <button
                      type="button"
                      onClick={() => onEditDocumentNotes(activeDoc, msg.text)}
                      className="px-3 py-1.5 rounded-full border border-[#EAEAEA] bg-[#F9F9F7] hover:border-black text-xs font-medium text-[#474646] inline-flex items-center gap-1.5 transition"
                    >
                      <BookmarkPlus className="w-3 h-3" />
                      <span>Save &amp; Edit Notes</span>
                    </button>
                  )}
                </div>
              </div>
            </div>
          );
        })}

        {isThinking && (
          <div className="flex items-center gap-3 text-xs text-[#5E5E5E] bg-white border border-[#EAEAEA] rounded-2xl px-4 py-3 max-w-md">
            <Loader2 className="w-4 h-4 animate-spin text-black" />
            <span>Searching {activeDoc?.title} &amp; preparing explanation...</span>
          </div>
        )}
      </div>

      {/* Bottom Floating Input Pill */}
      <div className="space-y-2 pt-2">
        {voiceError && (
          <div className="flex items-center gap-1.5 text-xs text-rose-600 px-2">
            <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
            <span>{voiceError}</span>
          </div>
        )}

        <div className="bg-white border border-[#EAEAEA] focus-within:border-[#1A1C1B] rounded-full p-1.5 sm:p-2 flex items-center gap-2 shadow-sm transition">
          <button
            type="button"
            onClick={handleToggleMic}
            className={`w-10 h-10 rounded-full flex items-center justify-center text-white flex-shrink-0 transition ${
              isListening
                ? 'bg-rose-600 ring-4 ring-rose-100 animate-pulse'
                : 'bg-black hover:bg-neutral-800'
            }`}
            title={`Speak in ${DIALECT_CONFIG[activeLanguage].label}`}
            aria-label="Toggle voice input"
          >
            <Mic className="w-4 h-4" />
          </button>

          <input
            type="text"
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void handleSendQuery();
            }}
            placeholder={
              activeLanguage === 'hi'
                ? 'अपनी अध्ययन सामग्री के बारे में कुछ भी पूछें...'
                : activeLanguage === 'gu'
                ? 'તમારા અભ્યાસ સાહિત્ય વિશે કંઈપણ પૂછો...'
                : 'Ask anything about your study material in any language...'
            }
            className="flex-1 bg-transparent text-xs sm:text-sm text-[#1A1C1B] placeholder-[#858383] outline-none px-1 min-w-0"
          />

          <button
            type="button"
            onClick={onTriggerUpload}
            className="p-2 text-[#747878] hover:text-black rounded-full hover:bg-[#F4F4F2] transition flex-shrink-0"
            title={`Upload another PDF (${MAX_PDF_LIMIT_NOTE})`}
            aria-label="Upload PDF"
          >
            <Paperclip className="w-4 h-4" />
          </button>

          <button
            type="button"
            onClick={() => void handleSendQuery()}
            disabled={!inputText.trim() || isThinking}
            className="w-9 h-9 sm:w-10 sm:h-10 rounded-full bg-black hover:bg-neutral-800 disabled:bg-[#C8C6C5] text-white flex items-center justify-center flex-shrink-0 transition"
            aria-label="Send message"
          >
            <ArrowUp className="w-4 h-4" />
          </button>
        </div>

        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 text-[11px] text-[#747878] px-2">
          <span>AI tutor references only approved textbook chapters • {MAX_PDF_LIMIT_NOTE}</span>
          <span className="inline-flex items-center gap-1">
            <Lock className="w-3 h-3" />
            <span>Strict Grounded Retrieval</span>
          </span>
        </div>
      </div>
    </div>
  );
};
