import React, { useState, useMemo } from 'react';
import {
  Search,
  FileText,
  Trash2,
  FileUp,
  UploadCloud,
  Folder,
  FolderOpen,
  ArrowRight,
  Link2,
  Mic,
  Sparkles,
  AudioLines,
  Database,
  Lock,
  Plus,
  Hourglass,
  AlertCircle,
  X,
  Pencil,
} from 'lucide-react';
import type { StudyDocument } from '../../types/workspace';
import { formatFileSize } from '../../lib/pdfProcessor';
import { fetchPdfFileFromUrl, MAX_PDF_LIMIT_NOTE } from '../../lib/workspaceService';

export interface ActiveUploadProgress {
  filename: string;
  sizeBytes: number;
  progress: number;
  stage: string;
}

interface LibraryViewProps {
  documents: StudyDocument[];
  isUploading: boolean;
  activeUpload: ActiveUploadProgress | null;
  onTriggerUpload: () => void;
  onFileDropped: (files: File | File[]) => void;
  onOpenTutor: (doc: StudyDocument) => void;
  onEditDocument: (doc: StudyDocument) => void;
  onDeleteDocument: (doc: StudyDocument) => void;
}

type SortOption = 'recent' | 'name' | 'size';

export const LibraryView: React.FC<LibraryViewProps> = ({
  documents,
  isUploading,
  activeUpload,
  onTriggerUpload,
  onFileDropped,
  onOpenTutor,
  onEditDocument,
  onDeleteDocument,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<SortOption>('recent');
  const [isDragging, setIsDragging] = useState(false);

  // Import via URL modal/inline drawer state
  const [showUrlImport, setShowUrlImport] = useState(false);
  const [pdfUrl, setPdfUrl] = useState('');
  const [isImportingUrl, setIsImportingUrl] = useState(false);
  const [urlError, setUrlError] = useState<string | null>(null);

  const totalUsedBytes = useMemo(
    () => documents.reduce((sum, doc) => sum + (doc.file_size_bytes || 0), 0),
    [documents]
  );
  const usedMbLabel =
    totalUsedBytes === 0 ? '0 MB' : `${(totalUsedBytes / (1024 * 1024)).toFixed(1)} MB`;

  const filteredAndSortedDocs = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const filtered = q
      ? documents.filter((doc) => doc.title.toLowerCase().includes(q))
      : [...documents];

    filtered.sort((a, b) => {
      if (sortBy === 'name') return a.title.localeCompare(b.title);
      if (sortBy === 'size') return (b.file_size_bytes || 0) - (a.file_size_bytes || 0);
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    });

    return filtered;
  }, [documents, searchQuery, sortBy]);

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    const droppedFiles = e.dataTransfer.files ? Array.from(e.dataTransfer.files) : [];
    if (droppedFiles.length > 0) onFileDropped(droppedFiles);
  };

  const handleUrlImportSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setUrlError(null);
    setIsImportingUrl(true);
    try {
      const file = await fetchPdfFileFromUrl(pdfUrl);
      setPdfUrl('');
      setShowUrlImport(false);
      onFileDropped(file);
    } catch (err: any) {
      setUrlError(err?.message || 'Unable to import PDF from that URL.');
    } finally {
      setIsImportingUrl(false);
    }
  };

  const isEmptyLibrary = documents.length === 0 && !activeUpload;

  return (
    <div className="max-w-5xl mx-auto space-y-6 animate-in fade-in duration-200">
      {/* =====================================================================
          TOP HEADER BAR (Matches Image 1 Empty & Image 2 Populated)
         ===================================================================== */}
      <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-[10px] font-semibold tracking-[0.12em] uppercase">
            <span className="px-3 py-1 rounded-full bg-[#EFEFEE] text-[#5E5E5E]">
              {isEmptyLibrary ? 'ARCHIVE & REPOSITORY' : 'ARCHIVE & INGESTION'}
            </span>
            {!isEmptyLibrary && (
              <span className="text-[#747878] normal-case tracking-normal text-xs font-medium">
                / Workspace Storage
              </span>
            )}
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-[#1A1C1B] mt-2">
            My Library
          </h1>
          <p className="text-xs sm:text-sm text-[#5E5E5E] mt-1">
            {isEmptyLibrary
              ? 'All your study materials in one place.'
              : 'Your study materials, all in one place.'}
          </p>
        </div>

        {/* Search + Real Count Pill */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5">
          <div className="relative flex-1 sm:w-64">
            <Search className="w-3.5 h-3.5 text-[#858383] absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search your study materials..."
              className="w-full bg-white border border-[#EAEAEA] focus:border-[#1A1C1B] rounded-full pl-9 pr-4 py-2 text-xs text-[#1A1C1B] placeholder-[#858383] outline-none transition"
            />
          </div>

          <div className="inline-flex items-center justify-center gap-2 bg-white border border-[#EAEAEA] rounded-full px-3.5 py-2 text-xs font-medium text-[#1A1C1B] flex-shrink-0">
            <span className="w-1.5 h-1.5 rounded-full bg-[#1A1C1B]" />
            <span>
              All Materials ({documents.length})
            </span>
          </div>
        </div>
      </div>

      {/* =====================================================================
          UPLOAD DROPZONE CARD (Mobile tap & Desktop Drag-and-Drop)
         ===================================================================== */}
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setIsDragging(true);
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={handleDrop}
        className={`bg-white rounded-[24px] border transition-all p-6 sm:p-9 text-center ${
          isDragging
            ? 'border-black bg-[#F4F4F2]/60 shadow-md'
            : 'border-[#EAEAEA] shadow-[0_4px_20px_rgba(0,0,0,0.02)]'
        }`}
      >
        <div className="max-w-lg mx-auto flex flex-col items-center">
          <div
            className={`w-12 h-12 ${
              isEmptyLibrary ? 'rounded-full' : 'rounded-xl'
            } bg-[#F4F4F2] flex items-center justify-center text-[#1A1C1B] mb-3.5`}
          >
            {isEmptyLibrary ? (
              <UploadCloud className="w-5 h-5 stroke-[1.75]" />
            ) : (
              <FileUp className="w-5 h-5 stroke-[1.75]" />
            )}
          </div>

          <h2 className="text-base sm:text-lg font-bold text-[#1A1C1B]">
            Upload your study material
          </h2>
          <p className="text-xs text-[#5E5E5E] mt-1 max-w-sm leading-relaxed">
            Drag and drop your PDF here or browse files from your device storage.
          </p>

          <div className="mt-5 flex flex-wrap items-center justify-center gap-2.5">
            <button
              type="button"
              onClick={onTriggerUpload}
              disabled={isUploading}
              className="bg-black hover:bg-neutral-800 text-white text-xs font-medium px-5 py-2.5 rounded-full inline-flex items-center gap-2 shadow-xs transition disabled:opacity-60"
            >
              {isEmptyLibrary ? (
                <Folder className="w-3.5 h-3.5" />
              ) : (
                <Plus className="w-3.5 h-3.5" />
              )}
              <span>{isUploading ? 'Processing PDF...' : 'Browse Files'}</span>
            </button>

            {!isEmptyLibrary && (
              <button
                type="button"
                onClick={() => {
                  setShowUrlImport(!showUrlImport);
                  setUrlError(null);
                }}
                className="bg-white hover:bg-[#F4F4F2] text-[#1A1C1B] text-xs font-medium px-4 py-2.5 rounded-full border border-[#E2E2E0] inline-flex items-center gap-1.5 transition"
              >
                <Link2 className="w-3.5 h-3.5" />
                <span>Import via URL</span>
              </button>
            )}
          </div>

          {/* Inline Import via URL Form */}
          {showUrlImport && (
            <form
              onSubmit={handleUrlImportSubmit}
              className="w-full mt-4 p-3 rounded-2xl bg-[#F9F9F7] border border-[#EAEAEA] space-y-2 text-left"
            >
              <div className="flex flex-col sm:flex-row gap-2">
                <input
                  type="url"
                  required
                  value={pdfUrl}
                  onChange={(e) => {
                    setPdfUrl(e.target.value);
                    setUrlError(null);
                  }}
                  placeholder="https://example.com/study-notes.pdf"
                  className="flex-1 bg-white border border-[#E2E2E0] focus:border-black rounded-xl px-3 py-2 text-xs text-[#1A1C1B] outline-none"
                />
                <div className="flex items-center gap-1.5">
                  <button
                    type="submit"
                    disabled={isImportingUrl || isUploading}
                    className="bg-black text-white text-xs font-medium px-4 py-2 rounded-xl hover:bg-neutral-800 disabled:opacity-50 transition"
                  >
                    {isImportingUrl ? 'Fetching...' : 'Import'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowUrlImport(false)}
                    className="p-2 text-[#747878] hover:text-black rounded-xl"
                    aria-label="Cancel URL import"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>
              {urlError && (
                <p className="text-[11px] text-rose-600 flex items-center gap-1">
                  <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
                  <span>{urlError}</span>
                </p>
              )}
            </form>
          )}

          <p className="mt-4 text-[11px] text-[#747878] leading-relaxed">
            PDF format supported • <strong className="font-medium text-[#474646]">{MAX_PDF_LIMIT_NOTE}</strong> • Multilingual voice indexing enabled
          </p>
        </div>
      </div>

      {/* =====================================================================
          LIVE UPLOAD PROGRESS BAR (Shown strictly during real active upload)
         ===================================================================== */}
      {activeUpload && (
        <div className="bg-white rounded-2xl border border-[#EAEAEA] p-4 sm:px-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0 flex-1">
            <div className="w-9 h-9 rounded-xl bg-[#F4F4F2] flex items-center justify-center text-[#1A1C1B] flex-shrink-0">
              <Hourglass className="w-4 h-4 animate-pulse" />
            </div>
            <div className="min-w-0 flex-1 space-y-1.5">
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold text-[#1A1C1B] truncate">
                  {activeUpload.filename}
                </span>
                <span className="text-[11px] text-[#747878] flex-shrink-0">
                  {formatFileSize(activeUpload.sizeBytes)}
                </span>
              </div>
              <div className="w-full h-1.5 bg-[#EFEFEE] rounded-full overflow-hidden">
                <div
                  className="h-full bg-black rounded-full transition-all duration-300"
                  style={{ width: `${activeUpload.progress}%` }}
                />
              </div>
              <p className="text-[11px] text-[#5E5E5E]">
                • {activeUpload.stage} ({activeUpload.progress}%)
              </p>
            </div>
          </div>
        </div>
      )}

      {/* =====================================================================
          STATE A: EMPTY LIBRARY BODY (Image 1)
         ===================================================================== */}
      {isEmptyLibrary ? (
        <>
          <div className="bg-white rounded-[24px] border border-[#EAEAEA] p-6 sm:p-10 text-center space-y-6">
            <div className="flex flex-col items-center max-w-md mx-auto">
              <div className="relative w-14 h-14 rounded-full bg-[#F4F4F2] flex items-center justify-center text-[#747878] mb-4">
                <FolderOpen className="w-6 h-6 stroke-[1.75]" />
                <span className="w-2.5 h-2.5 rounded-full bg-[#C8C6C5] absolute top-1 right-1 border-2 border-white" />
              </div>

              <h2 className="text-lg sm:text-xl font-bold text-[#1A1C1B]">
                No study materials yet.
              </h2>
              <p className="text-xs sm:text-sm text-[#5E5E5E] mt-2 leading-relaxed">
                Upload your first PDF to start learning. Once added, your documents will be
                indexed for voice discussions in English, Hindi, and Gujarati.
              </p>

              <button
                type="button"
                onClick={onTriggerUpload}
                disabled={isUploading}
                className="mt-5 bg-black hover:bg-neutral-800 text-white text-xs font-medium px-5 py-2.5 rounded-full inline-flex items-center gap-2 shadow-xs transition"
              >
                <FileUp className="w-3.5 h-3.5" />
                <span>Upload PDF</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
              <p className="mt-2.5 text-[11px] text-[#747878]">{MAX_PDF_LIMIT_NOTE}</p>
            </div>

            <div className="border-t border-[#F1F1EF] pt-6 space-y-4">
              <p className="text-[10px] font-semibold tracking-[0.14em] text-[#747878] uppercase">
                QUICK START GUIDE
              </p>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5 text-left">
                <div className="bg-[#F9F9F7] border border-[#F1F1EF] rounded-2xl p-4 space-y-2.5">
                  <div className="flex items-center justify-between">
                    <span className="w-6 h-6 rounded-full bg-white border border-[#EAEAEA] text-[11px] font-bold text-[#1A1C1B] flex items-center justify-center">
                      1
                    </span>
                    <FileText className="w-4 h-4 text-[#747878]" />
                  </div>
                  <div>
                    <h3 className="text-xs font-bold text-[#1A1C1B]">Select Document</h3>
                    <p className="text-[11px] text-[#5E5E5E] mt-1 leading-relaxed">
                      Upload a PDF textbook, research paper, or handwritten class notes.
                    </p>
                  </div>
                </div>

                <div className="bg-[#F9F9F7] border border-[#F1F1EF] rounded-2xl p-4 space-y-2.5">
                  <div className="flex items-center justify-between">
                    <span className="w-6 h-6 rounded-full bg-white border border-[#EAEAEA] text-[11px] font-bold text-[#1A1C1B] flex items-center justify-center">
                      2
                    </span>
                    <Sparkles className="w-4 h-4 text-[#747878]" />
                  </div>
                  <div>
                    <h3 className="text-xs font-bold text-[#1A1C1B]">Index &amp; Parse</h3>
                    <p className="text-[11px] text-[#5E5E5E] mt-1 leading-relaxed">
                      Automatic dialect recognition &amp; vector indexing into regional embeddings.
                    </p>
                  </div>
                </div>

                <div className="bg-[#F9F9F7] border border-[#F1F1EF] rounded-2xl p-4 space-y-2.5">
                  <div className="flex items-center justify-between">
                    <span className="w-6 h-6 rounded-full bg-white border border-[#EAEAEA] text-[11px] font-bold text-[#1A1C1B] flex items-center justify-center">
                      3
                    </span>
                    <AudioLines className="w-4 h-4 text-[#747878]" />
                  </div>
                  <div>
                    <h3 className="text-xs font-bold text-[#1A1C1B]">Voice Dialogue</h3>
                    <p className="text-[11px] text-[#5E5E5E] mt-1 leading-relaxed">
                      Start talking with your AI Tutor in real-time conversational vernaculars.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Bottom Storage Pill Bar */}
          <div className="bg-white rounded-2xl border border-[#EAEAEA] px-5 py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs text-[#5E5E5E]">
            <span className="inline-flex items-center gap-2">
              <Database className="w-3.5 h-3.5 text-[#747878]" />
              <span>
                Storage: <strong className="text-[#1A1C1B] font-semibold">0 MB</strong> / 500 MB used
              </span>
            </span>
            <span className="inline-flex items-center gap-1.5 text-[#747878]">
              <Lock className="w-3.5 h-3.5" />
              <span>Supabase Vector Store • Encrypted</span>
            </span>
          </div>
        </>
      ) : (
        /* ===================================================================
           STATE B: POPULATED UPLOADED MATERIALS TABLE / MOBILE CARDS (Image 2)
           =================================================================== */
        <>
          <div className="bg-white rounded-[24px] border border-[#EAEAEA] overflow-hidden">
            {/* Table Header Controls */}
            <div className="px-5 sm:px-6 py-4 border-b border-[#F1F1EF] flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <h2 className="text-sm sm:text-base font-bold text-[#1A1C1B]">
                  Uploaded Materials
                </h2>
                <span className="px-2.5 py-0.5 rounded-full bg-[#F4F4F2] text-[11px] font-medium text-[#5E5E5E]">
                  {filteredAndSortedDocs.length}{' '}
                  {filteredAndSortedDocs.length === 1 ? 'item' : 'items'}
                </span>
              </div>

              <div className="flex items-center gap-2 text-xs text-[#5E5E5E]">
                <span>Sort by:</span>
                <select
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value as SortOption)}
                  className="bg-white border border-[#EAEAEA] rounded-full px-3 py-1 text-xs font-semibold text-[#1A1C1B] outline-none cursor-pointer"
                  aria-label="Sort uploaded materials"
                >
                  <option value="recent">Recent</option>
                  <option value="name">Name</option>
                  <option value="size">Size</option>
                </select>
              </div>
            </div>

            {filteredAndSortedDocs.length === 0 ? (
              <div className="p-10 text-center text-xs sm:text-sm text-[#5E5E5E]">
                No uploaded documents match "{searchQuery}".
              </div>
            ) : (
              <>
                {/* Desktop Table Layout */}
                <div className="hidden md:block">
                  <div className="grid grid-cols-12 gap-4 px-6 py-3 bg-[#FAFAFA] border-b border-[#F1F1EF] text-[10px] font-semibold tracking-[0.12em] text-[#747878] uppercase">
                    <div className="col-span-4">DOCUMENT NAME</div>
                    <div className="col-span-1">SIZE</div>
                    <div className="col-span-2">DATE ADDED</div>
                    <div className="col-span-2">STATUS</div>
                    <div className="col-span-3 text-right">ACTIONS</div>
                  </div>

                  <div className="divide-y divide-[#F1F1EF]">
                    {filteredAndSortedDocs.map((doc) => {
                      const isProcessing =
                        doc.status === 'processing' || doc.status === 'uploading';
                      const isFailed = doc.status === 'failed';
                      const dateAdded = new Date(doc.created_at).toLocaleDateString('en-US', {
                        month: 'short',
                        day: 'numeric',
                        year: 'numeric',
                      });

                      return (
                        <div
                          key={doc.id}
                          className="grid grid-cols-12 gap-4 items-center px-6 py-4 hover:bg-[#FAFAFA] transition"
                        >
                          <div className="col-span-4 flex items-center gap-3 min-w-0">
                            <div className="w-8 h-8 rounded-lg bg-[#F4F4F2] flex items-center justify-center text-[#1A1C1B] flex-shrink-0">
                              <FileText className="w-4 h-4" />
                            </div>
                            <div className="min-w-0">
                              <p
                                className="text-xs sm:text-[13px] font-semibold text-[#1A1C1B] truncate"
                                title={doc.title}
                              >
                                {doc.title}
                              </p>
                              {doc.page_count > 0 && (
                                <p className="text-[11px] text-[#747878] truncate">
                                  {doc.page_count} {doc.page_count === 1 ? 'page' : 'pages'}
                                  {doc.extracted_metadata?.custom_notes ? ' • Has custom notes' : ''}
                                </p>
                              )}
                            </div>
                          </div>

                          <div className="col-span-1 text-xs text-[#5E5E5E] whitespace-nowrap">
                            {formatFileSize(doc.file_size_bytes)}
                          </div>

                          <div className="col-span-2 text-xs text-[#5E5E5E]">{dateAdded}</div>

                          <div className="col-span-2">
                            <span
                              className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-medium ${
                                isFailed
                                  ? 'bg-rose-50 text-rose-700'
                                  : 'bg-[#F4F4F2] text-[#1A1C1B]'
                              }`}
                            >
                              <span className="w-1.5 h-1.5 rounded-full bg-current" />
                              {isProcessing ? 'Indexing' : isFailed ? 'Failed' : 'Ready'}
                            </span>
                          </div>

                          <div className="col-span-3 flex items-center justify-end gap-1.5">
                            <button
                              type="button"
                              disabled={isProcessing}
                              onClick={() => onOpenTutor(doc)}
                              className="bg-black hover:bg-neutral-800 disabled:opacity-50 text-white text-[11px] font-medium px-3 py-1.5 rounded-full inline-flex items-center gap-1.5 transition"
                            >
                              <Mic className="w-3 h-3" />
                              <span>Open in Tutor</span>
                            </button>

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
                              title="Delete PDF"
                              aria-label={`Delete ${doc.title}`}
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Mobile Stacked Cards Layout (Zero overflow on 320px+ phones) */}
                <div className="md:hidden divide-y divide-[#F1F1EF]">
                  {filteredAndSortedDocs.map((doc) => {
                    const isProcessing =
                      doc.status === 'processing' || doc.status === 'uploading';
                    const isFailed = doc.status === 'failed';
                    const dateAdded = new Date(doc.created_at).toLocaleDateString('en-US', {
                      month: 'short',
                      day: 'numeric',
                      year: 'numeric',
                    });

                    return (
                      <div key={doc.id} className="p-4 space-y-3">
                        <div className="flex items-start justify-between gap-2.5">
                          <div className="flex items-center gap-3 min-w-0">
                            <div className="w-9 h-9 rounded-xl bg-[#F4F4F2] flex items-center justify-center text-[#1A1C1B] flex-shrink-0">
                              <FileText className="w-4 h-4" />
                            </div>
                            <div className="min-w-0">
                              <p className="text-xs font-semibold text-[#1A1C1B] truncate">
                                {doc.title}
                              </p>
                              <p className="text-[11px] text-[#747878] mt-0.5">
                                {formatFileSize(doc.file_size_bytes)} • {dateAdded}
                                {doc.page_count > 0 ? ` • ${doc.page_count}p` : ''}
                              </p>
                            </div>
                          </div>

                          <span
                            className={`px-2 py-0.5 rounded-full text-[10px] font-medium flex-shrink-0 ${
                              isFailed
                                ? 'bg-rose-50 text-rose-700'
                                : 'bg-[#F4F4F2] text-[#1A1C1B]'
                            }`}
                          >
                            {isProcessing ? '• Indexing' : isFailed ? 'Failed' : '• Ready'}
                          </span>
                        </div>

                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            disabled={isProcessing}
                            onClick={() => onOpenTutor(doc)}
                            className="flex-1 bg-black hover:bg-neutral-800 disabled:opacity-50 text-white text-xs font-medium py-2 px-4 rounded-full inline-flex items-center justify-center gap-1.5 transition"
                          >
                            <Mic className="w-3.5 h-3.5" />
                            <span>Open in Tutor</span>
                          </button>
                          <button
                            type="button"
                            disabled={isProcessing}
                            onClick={() => onEditDocument(doc)}
                            className="p-2 text-[#5E5E5E] hover:text-black border border-[#EAEAEA] rounded-full hover:bg-[#F4F4F2] transition disabled:opacity-40"
                            title="Edit notes & rename"
                            aria-label={`Edit notes for ${doc.title}`}
                          >
                            <Pencil className="w-4 h-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => onDeleteDocument(doc)}
                            className="p-2 text-[#747878] hover:text-rose-600 border border-[#EAEAEA] rounded-full hover:bg-rose-50 transition"
                            aria-label={`Delete ${doc.title}`}
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </>
            )}
          </div>

          {/* Bottom Voice Tutoring Engine Banner */}
          <div className="bg-white rounded-2xl border border-[#EAEAEA] px-5 py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-[#F4F4F2] flex items-center justify-center text-[#1A1C1B] flex-shrink-0">
                <AudioLines className="w-4 h-4" />
              </div>
              <div>
                <p className="text-xs font-semibold text-[#1A1C1B]">Voice Tutoring Engine</p>
                <p className="text-[11px] text-[#747878]">
                  Indexed files are queryable across English, Hindi, and Gujarati speech models.
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2 text-[11px]">
              <span className="px-3 py-1 rounded-full bg-[#F4F4F2] text-[#474646] font-medium">
                Storage: {usedMbLabel} / 500 MB
              </span>
              <span className="px-3 py-1 rounded-full bg-[#F4F4F2] text-[#474646] font-medium">
                Supabase Vector Store
              </span>
            </div>
          </div>
        </>
      )}
    </div>
  );
};
