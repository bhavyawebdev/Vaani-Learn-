import React, { useState, useEffect } from 'react';
import { X, Save, Trash2, FileText, Pencil, Loader2, CheckCircle2, AlertCircle } from 'lucide-react';
import type { DocumentChunk, StudyDocument } from '../../types/workspace';

interface EditNotesModalProps {
  document: StudyDocument | null;
  chunks: DocumentChunk[];
  isLoadingChunks?: boolean;
  onClose: () => void;
  onSaveDocument: (
    doc: StudyDocument,
    updates: { title: string; customNotes: string }
  ) => Promise<void>;
  onSaveChunkText: (chunkId: string | undefined, chunkIndex: number, newText: string) => Promise<void>;
  onDeleteDocument: (doc: StudyDocument) => Promise<void>;
}

export const EditNotesModal: React.FC<EditNotesModalProps> = ({
  document,
  chunks,
  isLoadingChunks = false,
  onClose,
  onSaveDocument,
  onSaveChunkText,
  onDeleteDocument,
}) => {
  const [title, setTitle] = useState('');
  const [customNotes, setCustomNotes] = useState('');
  const [selectedChunkIdx, setSelectedChunkIdx] = useState<number>(0);
  const [chunkDraft, setChunkDraft] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [statusMessage, setStatusMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    if (document) {
      setTitle(document.title);
      setCustomNotes(document.extracted_metadata?.custom_notes || '');
      setSelectedChunkIdx(0);
      setConfirmDelete(false);
      setStatusMessage(null);
    }
  }, [document?.id]);

  useEffect(() => {
    const activeChunk = chunks[selectedChunkIdx];
    setChunkDraft(activeChunk ? activeChunk.chunk_text : '');
  }, [selectedChunkIdx, chunks]);

  if (!document) return null;

  const activeChunk = chunks[selectedChunkIdx];

  const handleSaveAll = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      setStatusMessage({ type: 'error', text: 'Note / document name cannot be empty.' });
      return;
    }

    setIsSaving(true);
    setStatusMessage(null);
    try {
      await onSaveDocument(document, {
        title: title.trim(),
        customNotes: customNotes.trim(),
      });

      if (activeChunk && chunkDraft.trim() !== activeChunk.chunk_text.trim()) {
        await onSaveChunkText(activeChunk.id, activeChunk.chunk_index, chunkDraft.trim());
      }

      setStatusMessage({ type: 'success', text: 'Changes saved.' });
      setTimeout(() => {
        onClose();
      }, 500);
    } catch (err: any) {
      setStatusMessage({
        type: 'error',
        text: err?.message || 'Failed to save changes.',
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    setIsSaving(true);
    setStatusMessage(null);
    try {
      await onDeleteDocument(document);
      onClose();
    } catch (err: any) {
      setStatusMessage({
        type: 'error',
        text: err?.message || 'Could not delete document.',
      });
      setIsSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-black/45 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="edit-notes-title"
    >
      <div className="bg-white w-full sm:max-w-2xl rounded-t-[28px] sm:rounded-[28px] border border-[#EAEAEA] shadow-2xl max-h-[92dvh] flex flex-col overflow-hidden animate-in fade-in duration-150">
        {/* Header */}
        <div className="px-5 sm:px-6 py-4 border-b border-[#F1F1EF] flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-8 h-8 rounded-xl bg-[#F4F4F2] flex items-center justify-center text-[#1A1C1B] flex-shrink-0">
              <Pencil className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <h2
                id="edit-notes-title"
                className="text-sm sm:text-base font-bold text-[#1A1C1B] truncate"
              >
                Edit Notes &amp; Material Name
              </h2>
              <p className="text-[11px] text-[#747878] truncate">
                Rename this material, edit your summary notes, or refine extracted text.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-2 text-[#747878] hover:text-black rounded-full hover:bg-[#F4F4F2] transition"
            aria-label="Close modal"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSaveAll} className="flex-1 overflow-y-auto p-5 sm:p-6 space-y-5">
          {statusMessage && (
            <div
              className={`rounded-xl px-3.5 py-2.5 text-xs flex items-center gap-2 border ${
                statusMessage.type === 'error'
                  ? 'bg-rose-50 border-rose-200 text-rose-700'
                  : 'bg-emerald-50 border-emerald-200 text-emerald-700'
              }`}
            >
              {statusMessage.type === 'error' ? (
                <AlertCircle className="w-4 h-4 flex-shrink-0" />
              ) : (
                <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
              )}
              <span>{statusMessage.text}</span>
            </div>
          )}

          {/* 1. Rename Document / Notes Name */}
          <div className="space-y-1.5">
            <label className="block text-xs font-semibold text-[#1A1C1B]">
              Note / Study Material Name
            </label>
            <input
              type="text"
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Enter document or note title..."
              className="w-full px-4 py-2.5 rounded-xl bg-[#F4F4F2] border border-transparent focus:border-[#1A1C1B] focus:bg-white text-xs sm:text-sm text-[#1A1C1B] outline-none transition"
            />
          </div>

          {/* 2. Personal Study Notes / Summary */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="block text-xs font-semibold text-[#1A1C1B]">
                Personal Study Notes &amp; Key Takeaways
              </label>
              <span className="text-[11px] text-[#747878]">
                Used by AI Tutor during Q&amp;A
              </span>
            </div>
            <textarea
              rows={4}
              value={customNotes}
              onChange={(e) => setCustomNotes(e.target.value)}
              placeholder="Write or paste your own notes, definitions, or key formulas for this material..."
              className="w-full px-4 py-3 rounded-xl bg-[#F4F4F2] border border-transparent focus:border-[#1A1C1B] focus:bg-white text-xs sm:text-sm text-[#1A1C1B] placeholder-[#858383] outline-none transition resize-y"
            />
          </div>

          {/* 3. Edit Extracted PDF Section / Chunk Text */}
          <div className="space-y-2 pt-2 border-t border-[#F1F1EF]">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <label className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#1A1C1B]">
                <FileText className="w-3.5 h-3.5 text-[#5E5E5E]" />
                <span>Extracted PDF Section Content</span>
              </label>

              {chunks.length > 0 && (
                <select
                  value={selectedChunkIdx}
                  onChange={(e) => setSelectedChunkIdx(Number(e.target.value))}
                  className="bg-[#F4F4F2] border border-[#EAEAEA] rounded-full px-3 py-1 text-xs font-medium text-[#1A1C1B] outline-none cursor-pointer"
                  aria-label="Select extracted section"
                >
                  {chunks.map((c, idx) => (
                    <option key={c.id || idx} value={idx}>
                      Page {c.page_number} — Section {idx + 1}
                    </option>
                  ))}
                </select>
              )}
            </div>

            {isLoadingChunks ? (
              <div className="py-6 flex items-center justify-center gap-2 text-xs text-[#747878]">
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Loading extracted notes...</span>
              </div>
            ) : chunks.length === 0 ? (
              <p className="text-xs text-[#747878] bg-[#F9F9F7] rounded-xl p-3 border border-[#F1F1EF]">
                No extracted text sections available for this file yet. You can still add your own
                notes in the field above.
              </p>
            ) : (
              <textarea
                rows={5}
                value={chunkDraft}
                onChange={(e) => setChunkDraft(e.target.value)}
                className="w-full px-4 py-3 rounded-xl bg-[#F9F9F7] border border-[#EAEAEA] focus:border-[#1A1C1B] focus:bg-white text-xs text-[#1A1C1B] leading-relaxed outline-none transition resize-y"
              />
            )}
          </div>
        </form>

        {/* Footer Actions */}
        <div className="px-5 sm:px-6 py-4 border-t border-[#F1F1EF] bg-[#FCFCFB] flex flex-col-reverse sm:flex-row sm:items-center justify-between gap-3">
          {!confirmDelete ? (
            <button
              type="button"
              onClick={() => setConfirmDelete(true)}
              disabled={isSaving}
              className="text-xs font-medium text-rose-600 hover:text-rose-700 inline-flex items-center justify-center sm:justify-start gap-1.5 px-3 py-2 rounded-full hover:bg-rose-50 transition"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Delete Material</span>
            </button>
          ) : (
            <div className="flex items-center justify-center sm:justify-start gap-2">
              <button
                type="button"
                onClick={() => void handleDelete()}
                disabled={isSaving}
                className="bg-rose-600 hover:bg-rose-700 text-white text-xs font-medium px-4 py-2 rounded-full transition"
              >
                Confirm Delete
              </button>
              <button
                type="button"
                onClick={() => setConfirmDelete(false)}
                className="text-xs text-[#5E5E5E] hover:text-black px-2 py-2"
              >
                Cancel
              </button>
            </div>
          )}

          <div className="flex items-center gap-2.5 justify-end">
            <button
              type="button"
              onClick={onClose}
              disabled={isSaving}
              className="px-4 py-2 rounded-full border border-[#EAEAEA] bg-white hover:bg-[#F4F4F2] text-xs font-medium text-[#1A1C1B] transition"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSaveAll}
              disabled={isSaving}
              className="px-5 py-2 rounded-full bg-black hover:bg-neutral-800 text-white text-xs font-medium inline-flex items-center gap-1.5 shadow-xs transition disabled:opacity-60"
            >
              {isSaving ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Save className="w-3.5 h-3.5" />
              )}
              <span>Save Changes</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

