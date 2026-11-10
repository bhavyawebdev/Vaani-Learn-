import React, { useState } from 'react';
import {
  FileUp,
  Mic,
  Folder,
  Clock,
  AudioLines,
  BookOpen,
  PlusCircle,
  Info,
  MessageSquare,
  ArrowRight,
  ArrowUp,
  FileText,
  Hourglass,
  ArrowUpRight,
  AlertCircle,
  Volume2,
  Square,
  Trash2,
  Pencil,
} from 'lucide-react';
import type { DialectCode, StudyDocument, VoiceSession } from '../../types/workspace';
import {
  formatFileSize,
  formatRelativeDate,
  formatShortDocTitle,
} from '../../lib/pdfProcessor';
import { DIALECT_CONFIG, speakText, stopSpeaking } from '../../lib/voiceUtils';

interface DashboardOverviewProps {
  documents: StudyDocument[];
  sessions: VoiceSession[];
  activeLanguage: DialectCode;
  isUploading: boolean;
  onSelectLanguage: (lang: DialectCode) => void;
  onTriggerUpload: () => void;
  onFileDropped: (file: File) => void;
  onOpenTutor: (doc?: StudyDocument, initialPrompt?: string, lang?: DialectCode) => void;
  onViewLibrary: () => void;
  onEditDocument: (doc: StudyDocument) => void;
  onDeleteDocument: (doc: StudyDocument) => void;
}

const WAVE_HEIGHTS = [16, 26, 20, 38, 24, 48, 30, 44, 22, 34, 18, 28, 14];

export const DashboardOverview: React.FC<DashboardOverviewProps> = ({
  documents,
  sessions,
  activeLanguage,
  isUploading,
  onSelectLanguage,
  onTriggerUpload,
  onFileDropped,
  onOpenTutor,
  onViewLibrary,
  onEditDocument,
  onDeleteDocument,
}) => {
  const [isDragging, setIsDragging] = useState(false);
  const [isVoicePreviewPlaying, setIsVoicePreviewPlaying] = useState(false);

  const readyDocs = documents.filter((d) => d.status === 'ready');
  const primaryDoc = readyDocs[0] || documents[0];

  const totalPages = documents.reduce((acc, doc) => acc + (doc.page_count || 0), 0);
  const totalVocab = documents.reduce(
    (acc, doc) => acc + (doc.extracted_metadata?.vocab_count || 0),
    0
  );
  const totalSeconds = sessions.reduce((acc, s) => acc + (s.duration_seconds || 0), 0);
  const totalHoursLabel =
    totalSeconds === 0 ? '0' : (totalSeconds / 3600).toFixed(totalSeconds < 360 ? 2 : 1);
  const totalMinutes = Math.round(totalSeconds / 60);

  const latestSession = sessions[0];
  const currentMonthYear = new Date().toLocaleDateString('en-US', {
    month: 'long',
    year: 'numeric',
  });

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    const droppedFile = e.dataTransfer.files?.[0];
    if (droppedFile) {
      onFileDropped(droppedFile);
    }
  };

  const handleVoicePreview = (langOverride?: DialectCode) => {
    const lang = langOverride || activeLanguage;
    if (isVoicePreviewPlaying) {
      stopSpeaking();
      setIsVoicePreviewPlaying(false);
      return;
    }
    const started = speakText(
      DIALECT_CONFIG[lang].sampleText,
      lang,
      () => setIsVoicePreviewPlaying(true),
      () => setIsVoicePreviewPlaying(false)
    );
    if (!started) {
      setIsVoicePreviewPlaying(false);
    }
  };

  const cycleDialect = () => {
    const order: DialectCode[] = ['en', 'hi', 'gu'];
    const next = order[(order.indexOf(activeLanguage) + 1) % order.length];
    onSelectLanguage(next);
  };

  // =========================================================================
  // STATE 1: EMPTY STATE (First-time user / 0 uploaded documents)
  // =========================================================================
  if (documents.length === 0) {
    return (
      <div className="max-w-5xl mx-auto space-y-6 animate-in fade-in duration-200">
        {/* Eyebrow Pill */}
        <div>
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#EFEFEE] text-[#474646] text-[10px] font-semibold tracking-[0.12em] uppercase">
            <span className="w-1.5 h-1.5 rounded-full bg-[#1A1C1B]" />
            WORKSPACE ONBOARDING
          </span>
        </div>

        {/* Hero Row */}
        <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-5">
          <div>
            <h1 className="text-3xl sm:text-4xl lg:text-[42px] font-bold tracking-tight text-[#1A1C1B] leading-[1.1]">
              What would you like
              <br />
              to learn today?
            </h1>
            <p className="text-sm sm:text-[15px] text-[#5E5E5E] mt-2.5 max-w-md leading-relaxed">
              Upload your study material and learn at your own pace with your AI tutor.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={onTriggerUpload}
              disabled={isUploading}
              className="bg-black hover:bg-neutral-800 text-white text-xs sm:text-sm font-medium px-5 py-3 rounded-full inline-flex items-center gap-2 shadow-sm transition disabled:opacity-60"
            >
              <FileUp className="w-4 h-4" />
              <span>{isUploading ? 'Processing PDF...' : 'Upload Study Material'}</span>
            </button>

            <button
              type="button"
              onClick={() => onOpenTutor()}
              className="bg-white hover:bg-[#F4F4F2] text-[#1A1C1B] text-xs sm:text-sm font-medium px-5 py-3 rounded-full border border-[#E2E2E0] inline-flex items-center gap-2 transition"
            >
              <Mic className="w-4 h-4" />
              <span>Open My Tutor</span>
            </button>
          </div>
        </div>

        {/* 3 Real Metric Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="bg-white rounded-[20px] border border-[#EAEAEA] p-5 flex flex-col justify-between gap-4">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-semibold tracking-[0.12em] text-[#747878] uppercase">
                UPLOADED MATERIALS
              </span>
              <Folder className="w-4 h-4 text-[#858383]" />
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-bold text-[#1A1C1B]">0</span>
              <span className="text-xs text-[#747878]">documents active</span>
            </div>
          </div>

          <div className="bg-white rounded-[20px] border border-[#EAEAEA] p-5 flex flex-col justify-between gap-4">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-semibold tracking-[0.12em] text-[#747878] uppercase">
                LEARNING SESSIONS
              </span>
              <Clock className="w-4 h-4 text-[#858383]" />
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-bold text-[#1A1C1B]">{totalHoursLabel}</span>
              <span className="text-xs text-[#747878]">hours recorded</span>
            </div>
          </div>

          <div className="bg-white rounded-[20px] border border-[#EAEAEA] p-5 flex flex-col justify-between gap-4">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-semibold tracking-[0.12em] text-[#747878] uppercase">
                DIALECT ENGINE
              </span>
              <AudioLines className="w-4 h-4 text-[#858383]" />
            </div>
            <div className="flex items-center justify-between gap-2">
              <span className="inline-flex items-center gap-1.5 text-lg font-semibold text-[#1A1C1B]">
                <span className="w-1.5 h-1.5 rounded-full bg-black" />
                Ready
              </span>
              <span className="text-[11px] font-medium text-[#747878] tracking-wider">
                EN • HI • GU
              </span>
            </div>
          </div>
        </div>

        {/* Central Empty State Dropzone Card */}
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setIsDragging(true);
          }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={handleDrop}
          className={`bg-white rounded-[28px] border transition-all px-6 py-12 sm:py-16 text-center flex flex-col items-center justify-center ${
            isDragging
              ? 'border-black bg-[#F4F4F2]/70 shadow-md'
              : 'border-[#EAEAEA] shadow-[0_6px_28px_rgba(0,0,0,0.02)]'
          }`}
        >
          {/* Book + Mic Badge */}
          <div className="relative inline-flex items-center justify-center">
            <div className="w-16 h-16 rounded-full bg-[#F4F4F2] flex items-center justify-center text-[#1A1C1B]">
              <BookOpen className="w-7 h-7 stroke-[1.75]" />
            </div>
            <div className="absolute -bottom-1 -right-1 w-7 h-7 rounded-full bg-black text-white flex items-center justify-center shadow-sm border-2 border-white">
              <Mic className="w-3.5 h-3.5" />
            </div>
          </div>

          <h2 className="text-xl sm:text-2xl font-bold text-[#1A1C1B] mt-5 tracking-tight">
            Your learning space is ready.
          </h2>
          <p className="text-xs sm:text-sm text-[#5E5E5E] mt-2 max-w-md leading-relaxed">
            Upload your first study material to begin voice-guided learning in Hindi,
            Gujarati, or English.
          </p>

          <button
            type="button"
            onClick={onTriggerUpload}
            disabled={isUploading}
            className="mt-6 bg-black hover:bg-neutral-800 text-white text-xs sm:text-sm font-medium px-6 py-3 rounded-full inline-flex items-center gap-2 shadow-sm transition disabled:opacity-60"
          >
            <PlusCircle className="w-4 h-4" />
            <span>{isUploading ? 'Indexing PDF...' : 'Upload PDF'}</span>
          </button>

          <p className="mt-4 inline-flex items-center gap-1.5 text-[11px] text-[#747878]">
            <Info className="w-3.5 h-3.5 flex-shrink-0" />
            <span>Supports PDF textbooks, research notes, and lecture slides. You cannot upload more than 50 MB of PDF.</span>
          </p>

          <div className="mt-5 inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-[#F4F4F2] text-[11px] text-[#5E5E5E]">
            <AudioLines className="w-3.5 h-3.5 text-[#1A1C1B]" />
            <span>Voice synthesizer tuned for clarity</span>
          </div>
        </div>

        {/* Bottom Prompt Starter Row */}
        <div className="space-y-3 pt-1">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 text-xs">
            <span className="inline-flex items-center gap-2 font-semibold text-[#1A1C1B]">
              <MessageSquare className="w-3.5 h-3.5" />
              Try asking questions like
            </span>
            <button
              type="button"
              onClick={() => handleVoicePreview()}
              className="text-[#747878] hover:text-[#1A1C1B] transition text-left sm:text-right"
            >
              Click prompt to test microphone
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <button
              type="button"
              onClick={() => {
                onSelectLanguage('hi');
                handleVoicePreview('hi');
              }}
              className="bg-white hover:border-[#1A1C1B] rounded-[20px] border border-[#EAEAEA] p-5 text-left flex flex-col justify-between gap-4 transition group"
            >
              <div className="flex items-start justify-between gap-3">
                <p className="text-xs sm:text-[13px] font-medium text-[#1A1C1B] leading-relaxed">
                  "Explain the core concepts of Chapter 1 in simple Hindi."
                </p>
                <Volume2 className="w-4 h-4 text-[#858383] flex-shrink-0 group-hover:text-black transition" />
              </div>
              <div className="flex items-center justify-between text-[10px] font-semibold tracking-wider text-[#747878] uppercase">
                <span>HINDI • हिन्दी</span>
                <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition" />
              </div>
            </button>

            <button
              type="button"
              onClick={() => {
                onSelectLanguage('en');
                handleVoicePreview('en');
              }}
              className="bg-white hover:border-[#1A1C1B] rounded-[20px] border border-[#EAEAEA] p-5 text-left flex flex-col justify-between gap-4 transition group"
            >
              <div className="flex items-start justify-between gap-3">
                <p className="text-xs sm:text-[13px] font-medium text-[#1A1C1B] leading-relaxed">
                  "Quiz me with 3 rapid-fire questions on this document."
                </p>
                <Volume2 className="w-4 h-4 text-[#858383] flex-shrink-0 group-hover:text-black transition" />
              </div>
              <div className="flex items-center justify-between text-[10px] font-semibold tracking-wider text-[#747878] uppercase">
                <span>ENGLISH • STANDARD</span>
                <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition" />
              </div>
            </button>

            <button
              type="button"
              onClick={() => {
                onSelectLanguage('gu');
                handleVoicePreview('gu');
              }}
              className="bg-white hover:border-[#1A1C1B] rounded-[20px] border border-[#EAEAEA] p-5 text-left flex flex-col justify-between gap-4 transition group"
            >
              <div className="flex items-start justify-between gap-3">
                <p className="text-xs sm:text-[13px] font-medium text-[#1A1C1B] leading-relaxed">
                  "Summarize the key takeaways in conversational Gujarati."
                </p>
                <Volume2 className="w-4 h-4 text-[#858383] flex-shrink-0 group-hover:text-black transition" />
              </div>
              <div className="flex items-center justify-between text-[10px] font-semibold tracking-wider text-[#747878] uppercase">
                <span>GUJARATI • ગુજરાતી</span>
                <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition" />
              </div>
            </button>
          </div>
        </div>
      </div>
    );
  }

  // =========================================================================
  // STATE 2: ACTIVE LIBRARY STATE (User has uploaded >= 1 real PDF)
  // =========================================================================
  const shortPrimaryTitle = primaryDoc
    ? formatShortDocTitle(primaryDoc.title, 28)
    : 'Your Document';

  return (
    <div className="max-w-5xl mx-auto space-y-6 animate-in fade-in duration-200">
      {/* Top Overview Metadata Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5 text-xs">
          <span className="px-3 py-1 rounded-full bg-[#EFEFEE] text-[#474646] text-[10px] font-semibold tracking-[0.12em] uppercase">
            OVERVIEW
          </span>
          <span className="text-[#747878]">•</span>
          <span className="text-[#5E5E5E] font-medium">{currentMonthYear}</span>
        </div>

        <div className="inline-flex items-center gap-2 bg-white border border-[#EAEAEA] rounded-full px-3.5 py-1 text-[11px] font-medium text-[#1A1C1B]">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-600" />
          <span>Active Library ({readyDocs.length} Ready)</span>
        </div>
      </div>

      {/* Hero Header */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-5">
        <div>
          <h1 className="text-3xl sm:text-4xl lg:text-[40px] font-bold tracking-tight text-[#1A1C1B] leading-[1.12]">
            What would you like to learn
            <br className="hidden sm:inline" /> today?
          </h1>
          <p className="text-sm sm:text-[15px] text-[#5E5E5E] mt-2.5 max-w-lg leading-relaxed">
            Upload your study material and learn at your own pace with your AI tutor.
          </p>
        </div>

        <div className="flex flex-row lg:flex-col items-stretch sm:items-center lg:items-end gap-2.5">
          <button
            type="button"
            onClick={onTriggerUpload}
            disabled={isUploading}
            className="bg-black hover:bg-neutral-800 text-white text-xs sm:text-sm font-medium px-5 py-2.5 rounded-full inline-flex items-center justify-center gap-2 shadow-sm transition disabled:opacity-60"
          >
            <ArrowUp className="w-3.5 h-3.5" />
            <span>{isUploading ? 'Processing PDF...' : 'Upload Study Material'}</span>
          </button>

          <button
            type="button"
            onClick={() => onOpenTutor(primaryDoc)}
            className="bg-white hover:bg-[#F4F4F2] text-[#1A1C1B] text-xs sm:text-sm font-medium px-5 py-2.5 rounded-full border border-[#E2E2E0] inline-flex items-center justify-center gap-2 transition"
          >
            <Mic className="w-3.5 h-3.5" />
            <span>Open My Tutor</span>
          </button>
        </div>
      </div>

      {/* 3 Real KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <button
          type="button"
          onClick={cycleDialect}
          className="bg-white hover:border-[#C4C7C7] rounded-[20px] border border-[#EAEAEA] p-5 text-left transition flex flex-col justify-between gap-3"
          title="Click to switch active dialect"
        >
          <span className="text-[10px] font-semibold tracking-[0.12em] text-[#747878] uppercase">
            DIALECT ENGINE
          </span>
          <div className="flex items-baseline justify-between gap-2">
            <span className="text-lg font-bold text-[#1A1C1B]">
              {DIALECT_CONFIG[activeLanguage].voiceName}
            </span>
            <span className="text-[11px] text-[#747878]">Click to switch</span>
          </div>
        </button>

        <div className="bg-white rounded-[20px] border border-[#EAEAEA] p-5 flex flex-col justify-between gap-3">
          <span className="text-[10px] font-semibold tracking-[0.12em] text-[#747878] uppercase">
            DOCUMENTS INDEXED
          </span>
          <div className="flex items-baseline justify-between gap-2">
            <span className="text-lg font-bold text-[#1A1C1B]">
              {documents.length} {documents.length === 1 ? 'Document' : 'Documents'}
            </span>
            <span className="text-[11px] text-[#747878]">
              {totalPages} {totalPages === 1 ? 'Page' : 'Pages'} • {totalVocab.toLocaleString()} Terms
            </span>
          </div>
        </div>

        <div className="bg-white rounded-[20px] border border-[#EAEAEA] p-5 flex flex-col justify-between gap-3">
          <span className="text-[10px] font-semibold tracking-[0.12em] text-[#747878] uppercase">
            LAST SOCRATIC DIALOGUE
          </span>
          <div className="flex items-baseline justify-between gap-2">
            <span className="text-lg font-bold text-[#1A1C1B] truncate">
              {latestSession
                ? formatShortDocTitle(latestSession.session_title, 18)
                : 'No sessions yet'}
            </span>
            <span className="text-[11px] text-[#747878] flex-shrink-0">
              {sessions.length === 0
                ? 'Start in Tutor'
                : `${sessions.length} ${sessions.length === 1 ? 'session' : 'sessions'} • ${totalMinutes}m`}
            </span>
          </div>
        </div>
      </div>

      {/* Recent Study Materials Card (100% Real Uploaded PDFs) */}
      <div className="bg-white rounded-[24px] border border-[#EAEAEA] overflow-hidden">
        <div className="px-5 sm:px-6 py-4 border-b border-[#F1F1EF] flex items-center justify-between">
          <h2 className="text-sm font-semibold text-[#1A1C1B]">Recent study materials</h2>
          <div className="flex items-center gap-3 text-xs text-[#747878]">
            <span>
              {documents.length} {documents.length === 1 ? 'file' : 'files'} archived
            </span>
            {documents.length > 4 && (
              <button
                type="button"
                onClick={onViewLibrary}
                className="font-semibold text-[#1A1C1B] hover:underline"
              >
                View all
              </button>
            )}
          </div>
        </div>

        <div className="divide-y divide-[#F1F1EF]">
          {documents.slice(0, 5).map((doc) => {
            const isProcessing = doc.status === 'processing' || doc.status === 'uploading';
            const isFailed = doc.status === 'failed';

            return (
              <div
                key={doc.id}
                className="px-5 sm:px-6 py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-[#FAFAFA] transition"
              >
                <div className="flex items-center gap-3.5 min-w-0">
                  <div className="w-9 h-9 rounded-xl bg-[#F4F4F2] flex items-center justify-center text-[#474646] flex-shrink-0">
                    {isProcessing ? (
                      <Hourglass className="w-4 h-4 animate-pulse" />
                    ) : isFailed ? (
                      <AlertCircle className="w-4 h-4 text-rose-600" />
                    ) : (
                      <FileText className="w-4 h-4" />
                    )}
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs sm:text-sm font-semibold text-[#1A1C1B] truncate">
                      {doc.title}
                    </p>
                    <p className="text-[11px] text-[#747878] mt-0.5 truncate">
                      Uploaded {formatRelativeDate(doc.created_at)} •{' '}
                      {formatFileSize(doc.file_size_bytes)}
                      {doc.page_count > 0 ? ` • ${doc.page_count} pages` : ''}
                    </p>
                  </div>
                </div>

                <div className="flex items-center justify-between sm:justify-end gap-3 sm:gap-4 pl-12 sm:pl-0">
                  <span
                    className={`px-2.5 py-1 rounded-full text-[11px] font-medium ${
                      isFailed
                        ? 'bg-rose-50 text-rose-700'
                        : 'bg-[#F4F4F2] text-[#474646]'
                    }`}
                  >
                    {isProcessing ? '• Processing' : isFailed ? 'Failed' : 'Ready'}
                  </span>

                  {isProcessing ? (
                    <span className="text-xs text-[#747878]">Synthesizing...</span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => onOpenTutor(doc)}
                      className="text-xs font-semibold text-[#1A1C1B] hover:underline inline-flex items-center gap-1"
                    >
                      <span>Open in Tutor</span>
                      <ArrowRight className="w-3.5 h-3.5" />
                    </button>
                  )}

                  <button
                    type="button"
                    disabled={isProcessing}
                    onClick={() => onEditDocument(doc)}
                    className="p-1.5 text-[#5E5E5E] hover:text-black rounded-lg hover:bg-[#F4F4F2] transition disabled:opacity-40"
                    title="Edit notes & rename"
                    aria-label={`Edit notes for ${doc.title}`}
                  >
                    <Pencil className="w-3.5 h-3.5" />
                  </button>

                  <button
                    type="button"
                    onClick={() => onDeleteDocument(doc)}
                    className="p-1.5 text-[#858383] hover:text-rose-600 rounded-lg hover:bg-rose-50 transition"
                    title="Remove document"
                    aria-label={`Remove ${doc.title}`}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Bottom 2-Column Bento Row */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* Left Card: Real Document-Grounded Conversational Prompts */}
        <div className="lg:col-span-7 bg-white rounded-[24px] border border-[#EAEAEA] p-6 flex flex-col justify-between">
          <div>
            <span className="text-[10px] font-semibold tracking-[0.12em] text-[#747878] uppercase">
              CONVERSATIONAL AUDIO PROMPTS
            </span>
            <h3 className="text-lg font-bold text-[#1A1C1B] mt-1">
              Spoken queries to test on {shortPrimaryTitle}
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 my-5">
              <button
                type="button"
                onClick={() =>
                  onOpenTutor(
                    primaryDoc,
                    `Explain the core concepts in ${shortPrimaryTitle} in ${DIALECT_CONFIG[activeLanguage].label}.`,
                    activeLanguage
                  )
                }
                className="bg-[#F4F4F2] hover:bg-[#EAEAE7] rounded-2xl p-4 text-left transition flex flex-col justify-between gap-3 group"
              >
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-semibold tracking-widest text-[#747878] uppercase">
                    CONCEPT
                  </span>
                  <ArrowUpRight className="w-3.5 h-3.5 text-[#5E5E5E] group-hover:text-black transition" />
                </div>
                <p className="text-xs font-medium text-[#1A1C1B] leading-relaxed">
                  "Explain the core concepts in {shortPrimaryTitle} in{' '}
                  {DIALECT_CONFIG[activeLanguage].label}."
                </p>
              </button>

              <button
                type="button"
                onClick={() =>
                  onOpenTutor(
                    primaryDoc,
                    `Quiz me on ${shortPrimaryTitle} using rapid-fire questions.`,
                    activeLanguage
                  )
                }
                className="bg-[#F4F4F2] hover:bg-[#EAEAE7] rounded-2xl p-4 text-left transition flex flex-col justify-between gap-3 group"
              >
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-semibold tracking-widest text-[#747878] uppercase">
                    CRITIQUE
                  </span>
                  <ArrowUpRight className="w-3.5 h-3.5 text-[#5E5E5E] group-hover:text-black transition" />
                </div>
                <p className="text-xs font-medium text-[#1A1C1B] leading-relaxed">
                  "Quiz me on {shortPrimaryTitle} using rapid-fire questions."
                </p>
              </button>
            </div>
          </div>

          <div className="flex items-center justify-between gap-3 pt-2 border-t border-[#F4F4F2] text-xs">
            <span className="text-[#747878]">
              Multilingual speech synthesizers calibrated for low latency.
            </span>
            <button
              type="button"
              onClick={() => onOpenTutor(primaryDoc)}
              className="font-semibold text-[#1A1C1B] hover:underline flex-shrink-0"
            >
              Ask in Tutor →
            </button>
          </div>
        </div>

        {/* Right Card: Acoustic Clarity Voice Synthesis Engine */}
        <div className="lg:col-span-5 bg-white rounded-[24px] border border-[#EAEAEA] p-6 flex flex-col justify-between">
          <div>
            <span className="text-[10px] font-semibold tracking-[0.12em] text-[#747878] uppercase">
              VOICE SYNTHESIS ENGINE
            </span>
            <h3 className="text-lg font-bold text-[#1A1C1B] mt-1">Acoustic Clarity</h3>
            <p className="text-xs text-[#5E5E5E] mt-1 leading-relaxed">
              Natural inflection optimized for non-English phonemes.
            </p>
          </div>

          {/* Monochrome Soundwave Spectrum */}
          <div className="my-6 flex items-center justify-center gap-1.5 h-14">
            {WAVE_HEIGHTS.map((height, idx) => (
              <span
                key={idx}
                className={`w-1 rounded-full transition-all duration-300 ${
                  isVoicePreviewPlaying
                    ? 'bg-black animate-pulse'
                    : idx % 2 === 0
                    ? 'bg-[#1A1C1B]'
                    : 'bg-[#C8C6C5]'
                }`}
                style={{
                  height: `${isVoicePreviewPlaying ? Math.max(14, (height + idx * 5) % 52) : height}px`,
                }}
              />
            ))}
          </div>

          <div className="flex items-center justify-between gap-2 pt-2 border-t border-[#F4F4F2] text-xs">
            <span className="text-[#747878]">
              Default:{' '}
              <strong className="font-medium text-[#1A1C1B]">
                {DIALECT_CONFIG[activeLanguage].voiceName}
              </strong>
            </span>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => handleVoicePreview()}
                className="inline-flex items-center gap-1 text-[#5E5E5E] hover:text-black font-medium transition"
                title="Test voice clarity"
              >
                {isVoicePreviewPlaying ? (
                  <>
                    <Square className="w-3 h-3 fill-current" />
                    <span>Stop</span>
                  </>
                ) : (
                  <>
                    <Volume2 className="w-3.5 h-3.5" />
                    <span>Test</span>
                  </>
                )}
              </button>
              <button
                type="button"
                onClick={cycleDialect}
                className="font-semibold text-[#1A1C1B] hover:underline"
              >
                Change voice
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

