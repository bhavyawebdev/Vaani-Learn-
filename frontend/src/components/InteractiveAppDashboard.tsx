import React, { useState, useEffect, useRef } from 'react';
import {
  LayoutGrid,
  BookOpen,
  Mic,
  Bell,
  HelpCircle,
  LogOut,
  Menu,
  X,
  AlertCircle,
  Loader2,
  AudioLines,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import type {
  DialectCode,
  DocumentChunk,
  StudyDocument,
  VoiceSession,
} from '../types/workspace';
import {
  deleteUserDocument,
  fetchDocumentChunks,
  fetchWorkspaceData,
  updateDocumentChunkText,
  updateDocumentDetails,
  uploadAndProcessPdf,
} from '../lib/workspaceService';
import { DashboardOverview } from './dashboard/DashboardOverview';
import { LibraryView, type ActiveUploadProgress } from './dashboard/LibraryView';
import { TutorView } from './dashboard/TutorView';
import { EditNotesModal } from './dashboard/EditNotesModal';

interface InteractiveAppDashboardProps {
  onBackToLanding: () => void;
  currentUserEmail?: string;
}

type DashboardTab = 'dashboard' | 'library' | 'tutor';

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return 'U';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

export const InteractiveAppDashboard: React.FC<InteractiveAppDashboardProps> = ({
  onBackToLanding,
  currentUserEmail,
}) => {
  const { user, profile, signOut } = useAuth();
  const userId = user?.id || '';
  const effectiveEmail =
    profile?.email || user?.email || currentUserEmail || 'learner@vaanilearn.ai';
  const displayName =
    profile?.full_name ||
    user?.user_metadata?.full_name ||
    effectiveEmail.split('@')[0];
  const userInitials = getInitials(displayName);

  const [activeTab, setActiveTab] = useState<DashboardTab>('dashboard');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [activeLanguage, setActiveLanguage] = useState<DialectCode>('en');

  // Real persisted workspace state (never pre-seeded with dummy items)
  const [documents, setDocuments] = useState<StudyDocument[]>([]);
  const [sessions, setSessions] = useState<VoiceSession[]>([]);
  const [chunksByDocId, setChunksByDocId] = useState<Record<string, DocumentChunk[]>>({});
  const [selectedDocument, setSelectedDocument] = useState<StudyDocument | null>(null);
  const [pendingPrompt, setPendingPrompt] = useState<string | null>(null);

  const [isLoadingWorkspace, setIsLoadingWorkspace] = useState(true);
  const [isLoadingChunks, setIsLoadingChunks] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [activeUpload, setActiveUpload] = useState<ActiveUploadProgress | null>(null);
  const [editingDoc, setEditingDoc] = useState<StudyDocument | null>(null);
  const [isLoadingEditChunks, setIsLoadingEditChunks] = useState(false);
  const [statusBanner, setStatusBanner] = useState<{
    type: 'info' | 'error';
    message: string;
  } | null>(null);

  const [openPopover, setOpenPopover] = useState<'notifications' | 'help' | 'profile' | null>(
    null
  );

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Load real documents & voice sessions from Supabase when user signs in
  useEffect(() => {
    let isMounted = true;
    async function load() {
      if (!userId) {
        if (isMounted) setIsLoadingWorkspace(false);
        return;
      }

      setIsLoadingWorkspace(true);
      const result = await fetchWorkspaceData(userId);
      if (!isMounted) return;

      setDocuments(result.documents);
      setSessions(result.sessions);

      const firstReady = result.documents.find((d) => d.status === 'ready');
      if (firstReady) {
        setSelectedDocument(firstReady);
      }

      if (result.errorMessage) {
        setStatusBanner({
          type: result.needsSchemaSetup ? 'info' : 'error',
          message: result.errorMessage,
        });
      }
      setIsLoadingWorkspace(false);
    }

    void load();
    return () => {
      isMounted = false;
    };
  }, [userId]);

  // Fetch chunks from Supabase when selectedDocument changes (if not already cached)
  useEffect(() => {
    let isMounted = true;
    async function loadChunks() {
      if (!selectedDocument) return;
      if (chunksByDocId[selectedDocument.id]?.length) return;

      setIsLoadingChunks(true);
      const loaded = await fetchDocumentChunks(selectedDocument.id);
      if (!isMounted) return;

      if (loaded.length > 0) {
        setChunksByDocId((prev) => ({ ...prev, [selectedDocument.id]: loaded }));
      }
      setIsLoadingChunks(false);
    }

    void loadChunks();
    return () => {
      isMounted = false;
    };
  }, [selectedDocument?.id]);

  const handleFileUpload = async (file: File) => {
    if (!userId) {
      setStatusBanner({
        type: 'error',
        message: 'Please sign in to upload study materials.',
      });
      return;
    }

    setStatusBanner(null);
    setIsUploading(true);
    setActiveUpload({
      filename: file.name,
      sizeBytes: file.size,
      progress: 10,
      stage: 'Validating PDF...',
    });
    let tempDocId = '';

    try {
      const result = await uploadAndProcessPdf({
        file,
        userId,
        language: activeLanguage,
        onOptimisticCreated: (pendingDoc) => {
          tempDocId = pendingDoc.id;
          setDocuments((prev) => [pendingDoc, ...prev]);
        },
        onProgress: (progress, stage) => {
          setActiveUpload({
            filename: file.name,
            sizeBytes: file.size,
            progress,
            stage,
          });
        },
      });

      setDocuments((prev) => [
        result.document,
        ...prev.filter((d) => d.id !== tempDocId && d.id !== result.document.id),
      ]);
      setChunksByDocId((prev) => ({
        ...prev,
        [result.document.id]: result.chunks,
      }));
      setSelectedDocument(result.document);

      if (result.schemaWarning) {
        setStatusBanner({ type: 'info', message: result.schemaWarning });
      }
    } catch (err: any) {
      if (tempDocId) {
        setDocuments((prev) => prev.filter((d) => d.id !== tempDocId));
      }
      setStatusBanner({
        type: 'error',
        message: err?.message || 'Failed to upload PDF. Please check the file and try again.',
      });
    } finally {
      setIsUploading(false);
      setActiveUpload(null);
    }
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      void handleFileUpload(file);
    }
    e.target.value = '';
  };

  const handleDeleteDocument = async (doc: StudyDocument) => {
    try {
      await deleteUserDocument(doc);
      const remaining = documents.filter((d) => d.id !== doc.id);
      setDocuments(remaining);
      if (selectedDocument?.id === doc.id) {
        setSelectedDocument(remaining.find((d) => d.status === 'ready') || null);
      }
      if (editingDoc?.id === doc.id) {
        setEditingDoc(null);
      }
    } catch (err: any) {
      setStatusBanner({
        type: 'error',
        message: err?.message || 'Could not remove document.',
      });
    }
  };

  const handleOpenEditModal = async (doc: StudyDocument, prefillNote?: string) => {
    const existingNotes = doc.extracted_metadata?.custom_notes || '';
    const mergedNotes = prefillNote
      ? existingNotes
        ? `${existingNotes}\n\n${prefillNote}`
        : prefillNote
      : existingNotes;

    const docToEdit: StudyDocument = prefillNote
      ? {
          ...doc,
          extracted_metadata: {
            ...doc.extracted_metadata,
            custom_notes: mergedNotes,
          },
        }
      : doc;

    setEditingDoc(docToEdit);

    if (!chunksByDocId[doc.id]?.length) {
      setIsLoadingEditChunks(true);
      const loaded = await fetchDocumentChunks(doc.id);
      if (loaded.length > 0) {
        setChunksByDocId((prev) => ({ ...prev, [doc.id]: loaded }));
      }
      setIsLoadingEditChunks(false);
    }
  };

  const handleSaveDocumentDetails = async (
    doc: StudyDocument,
    updates: { title: string; customNotes: string }
  ) => {
    const updated = await updateDocumentDetails(doc, updates);
    setDocuments((prev) => prev.map((d) => (d.id === updated.id ? updated : d)));
    if (selectedDocument?.id === updated.id) {
      setSelectedDocument(updated);
    }
    setEditingDoc(updated);
  };

  const handleSaveChunkText = async (
    chunkId: string | undefined,
    chunkIndex: number,
    newText: string
  ) => {
    if (!editingDoc) return;
    await updateDocumentChunkText(chunkId, newText);
    setChunksByDocId((prev) => {
      const current = prev[editingDoc.id] || [];
      return {
        ...prev,
        [editingDoc.id]: current.map((c) =>
          (chunkId && c.id === chunkId) || c.chunk_index === chunkIndex
            ? { ...c, chunk_text: newText }
            : c
        ),
      };
    });
  };

  const handleOpenTutor = (
    doc?: StudyDocument,
    initialPrompt?: string,
    lang?: DialectCode
  ) => {
    if (lang) setActiveLanguage(lang);
    const targetDoc = doc || selectedDocument || documents.find((d) => d.status === 'ready') || null;
    if (targetDoc) {
      setSelectedDocument(targetDoc);
    }
    if (initialPrompt) {
      setPendingPrompt(initialPrompt);
    }
    setActiveTab('tutor');
    setMobileMenuOpen(false);
  };

  const handleSignOut = async () => {
    await signOut();
    onBackToLanding();
  };

  const navItems: Array<{ id: DashboardTab; label: string; icon: React.ReactNode }> = [
    { id: 'dashboard', label: 'Dashboard', icon: <LayoutGrid className="w-4 h-4" /> },
    { id: 'library', label: 'My Library', icon: <BookOpen className="w-4 h-4" /> },
    { id: 'tutor', label: 'My Tutor', icon: <Mic className="w-4 h-4" /> },
  ];

  return (
    <div className="min-h-screen bg-[#F9F9F7] text-[#1A1C1B] flex font-sans antialiased">
      {/* Visually-hidden Real PDF Upload Input (sr-only for full mobile Safari/Android compatibility) */}
      <input
        ref={fileInputRef}
        type="file"
        accept="application/pdf,.pdf"
        onChange={handleFileInputChange}
        tabIndex={-1}
        aria-hidden="true"
        className="sr-only"
      />

      {/* =========================================================================
          LEFT NAVIGATION SIDEBAR (Desktop)
         ========================================================================= */}
      <aside className="w-60 bg-white border-r border-[#EAEAEA] hidden md:flex flex-col justify-between p-4 flex-shrink-0 sticky top-0 h-screen">
        <div className="space-y-7">
          {/* Brand Header */}
          <button
            type="button"
            onClick={() => setActiveTab('dashboard')}
            className="flex items-center gap-2.5 px-2 pt-1 text-left group"
          >
            <div className="w-9 h-9 rounded-full bg-black text-white flex items-center justify-center shadow-xs flex-shrink-0">
              <AudioLines className="w-4 h-4" />
            </div>
            <div className="leading-none">
              <p className="text-[15px] font-bold tracking-tight text-[#1A1C1B]">
                VaaniLearn
              </p>
              <p className="text-[9px] font-semibold tracking-[0.16em] text-[#747878] uppercase mt-0.5">
                AI STUDIO
              </p>
            </div>
          </button>

          {/* Navigation Links */}
          <nav className="space-y-1">
            {navItems.map((item) => {
              const isActive = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setActiveTab(item.id)}
                  className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-xs transition ${
                    isActive
                      ? 'bg-[#F1F1EF] text-[#1A1C1B] font-semibold'
                      : 'text-[#5E5E5E] hover:bg-[#F7F7F5] hover:text-[#1A1C1B] font-medium'
                  }`}
                >
                  {item.icon}
                  <span>{item.label}</span>
                </button>
              );
            })}
          </nav>
        </div>

        {/* Bottom Real User Profile Pill */}
        <div className="bg-[#F6F6F4] border border-[#EAEAEA] rounded-2xl p-3 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-8 h-8 rounded-full bg-[#E5E5E2] text-[#1A1C1B] font-semibold text-xs flex items-center justify-center flex-shrink-0">
              {userInitials}
            </div>
            <div className="min-w-0">
              <p className="text-xs font-semibold text-[#1A1C1B] truncate">{displayName}</p>
              <p className="text-[11px] text-[#747878] truncate">{effectiveEmail}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => void handleSignOut()}
            className="p-1.5 text-[#747878] hover:text-rose-600 rounded-lg hover:bg-white transition flex-shrink-0"
            title="Sign out"
            aria-label="Sign out"
          >
            <LogOut className="w-3.5 h-3.5" />
          </button>
        </div>
      </aside>

      {/* =========================================================================
          MAIN WORKSPACE COLUMN
         ========================================================================= */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top Workspace Header */}
        <header className="h-14 bg-[#F9F9F7]/90 backdrop-blur border-b border-[#EAEAEA] px-4 sm:px-8 flex items-center justify-between sticky top-0 z-30">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="md:hidden p-1.5 text-[#1A1C1B] rounded-lg hover:bg-[#EFEFEE]"
              aria-label="Toggle menu"
            >
              {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>

            <span className="px-3 py-1 rounded-full bg-[#EFEFEE] text-[#5E5E5E] text-[10px] font-semibold tracking-[0.14em] uppercase">
              VOICE WORKSPACE
            </span>
          </div>

          <div className="flex items-center gap-2 sm:gap-3 relative">
            {/* Notifications Button */}
            <button
              type="button"
              onClick={() =>
                setOpenPopover(openPopover === 'notifications' ? null : 'notifications')
              }
              className="p-2 text-[#5E5E5E] hover:text-black hover:bg-[#EFEFEE] rounded-full transition relative"
              aria-label="Workspace notifications"
            >
              <Bell className="w-4 h-4" />
              {documents.some((d) => d.status === 'processing') && (
                <span className="w-1.5 h-1.5 rounded-full bg-black absolute top-1.5 right-1.5" />
              )}
            </button>

            {/* Help Button */}
            <button
              type="button"
              onClick={() => setOpenPopover(openPopover === 'help' ? null : 'help')}
              className="p-2 text-[#5E5E5E] hover:text-black hover:bg-[#EFEFEE] rounded-full transition"
              aria-label="Workspace help"
            >
              <HelpCircle className="w-4 h-4" />
            </button>

            {/* Top-Right Profile Avatar */}
            <button
              type="button"
              onClick={() => setOpenPopover(openPopover === 'profile' ? null : 'profile')}
              className="w-8 h-8 rounded-full bg-black text-white text-xs font-semibold flex items-center justify-center shadow-xs hover:bg-neutral-800 transition"
              title={`${displayName} (${effectiveEmail})`}
            >
              {userInitials}
            </button>

            {/* Popover Menus */}
            {openPopover === 'notifications' && (
              <div className="absolute right-0 top-12 w-72 bg-white rounded-2xl border border-[#EAEAEA] shadow-lg p-4 text-xs z-40">
                <p className="font-semibold text-[#1A1C1B] mb-2">Workspace Activity</p>
                {documents.length === 0 ? (
                  <p className="text-[#747878]">
                    No documents uploaded yet. Upload a PDF to begin indexing.
                  </p>
                ) : (
                  <ul className="space-y-2 max-h-48 overflow-y-auto">
                    {documents.slice(0, 4).map((d) => (
                      <li
                        key={d.id}
                        className="flex items-center justify-between gap-2 text-[#5E5E5E]"
                      >
                        <span className="truncate font-medium text-[#1A1C1B]">{d.title}</span>
                        <span className="text-[10px] uppercase tracking-wider flex-shrink-0">
                          {d.status}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}

            {openPopover === 'help' && (
              <div className="absolute right-0 top-12 w-72 bg-white rounded-2xl border border-[#EAEAEA] shadow-lg p-4 text-xs space-y-2 z-40">
                <p className="font-semibold text-[#1A1C1B]">Quick Guide</p>
                <p className="text-[#5E5E5E] leading-relaxed">
                  1. Upload any text-based PDF up to 25 MB.
                </p>
                <p className="text-[#5E5E5E] leading-relaxed">
                  2. Click <strong>Open in Tutor</strong> to ask questions by typing or speaking in
                  English, Hindi, or Gujarati.
                </p>
              </div>
            )}

            {openPopover === 'profile' && (
              <div className="absolute right-0 top-12 w-60 bg-white rounded-2xl border border-[#EAEAEA] shadow-lg p-3 text-xs space-y-2 z-40">
                <div className="px-2 py-1.5 border-b border-[#F1F1EF]">
                  <p className="font-semibold text-[#1A1C1B] truncate">{displayName}</p>
                  <p className="text-[11px] text-[#747878] truncate">{effectiveEmail}</p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setOpenPopover(null);
                    onBackToLanding();
                  }}
                  className="w-full text-left px-2 py-1.5 rounded-lg text-[#5E5E5E] hover:bg-[#F4F4F2] hover:text-black transition"
                >
                  Back to Landing Page
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setOpenPopover(null);
                    void handleSignOut();
                  }}
                  className="w-full text-left px-2 py-1.5 rounded-lg text-rose-600 hover:bg-rose-50 font-medium transition flex items-center gap-1.5"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  <span>Sign Out</span>
                </button>
              </div>
            )}
          </div>
        </header>

        {/* Mobile Drawer Navigation */}
        {mobileMenuOpen && (
          <div className="md:hidden bg-white border-b border-[#EAEAEA] px-4 py-3 space-y-2">
            <div className="flex flex-col gap-1">
              {navItems.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => {
                    setActiveTab(item.id);
                    setMobileMenuOpen(false);
                  }}
                  className={`flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-xs ${
                    activeTab === item.id
                      ? 'bg-[#F1F1EF] text-[#1A1C1B] font-semibold'
                      : 'text-[#5E5E5E]'
                  }`}
                >
                  {item.icon}
                  <span>{item.label}</span>
                </button>
              ))}
            </div>
            <div className="pt-2 border-t border-[#F1F1EF] flex items-center justify-between text-xs">
              <span className="text-[#5E5E5E] truncate">{effectiveEmail}</span>
              <button
                type="button"
                onClick={() => void handleSignOut()}
                className="text-rose-600 font-medium flex items-center gap-1 flex-shrink-0"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span>Sign out</span>
              </button>
            </div>
          </div>
        )}

        {/* Main Content Canvas */}
        <main
          className="flex-1 px-4 sm:px-8 py-6 sm:py-8 overflow-y-auto"
          onClick={() => {
            if (openPopover) setOpenPopover(null);
          }}
        >
          {statusBanner && (
            <div
              className={`max-w-5xl mx-auto mb-5 rounded-2xl px-4 py-3 text-xs flex items-center justify-between gap-3 border ${
                statusBanner.type === 'error'
                  ? 'bg-rose-50 border-rose-200 text-rose-700'
                  : 'bg-white border-[#EAEAEA] text-[#5E5E5E]'
              }`}
            >
              <div className="flex items-center gap-2">
                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                <span>{statusBanner.message}</span>
              </div>
              <button
                type="button"
                onClick={() => setStatusBanner(null)}
                className="text-[#747878] hover:text-black"
                aria-label="Dismiss message"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          )}

          {isLoadingWorkspace ? (
            <div className="max-w-5xl mx-auto py-24 flex flex-col items-center justify-center text-xs text-[#747878] gap-3">
              <Loader2 className="w-5 h-5 animate-spin text-black" />
              <span>Loading your workspace...</span>
            </div>
          ) : (
            <>
              {activeTab === 'dashboard' && (
                <DashboardOverview
                  documents={documents}
                  sessions={sessions}
                  activeLanguage={activeLanguage}
                  isUploading={isUploading}
                  onSelectLanguage={setActiveLanguage}
                  onTriggerUpload={() => fileInputRef.current?.click()}
                  onFileDropped={(file) => void handleFileUpload(file)}
                  onOpenTutor={handleOpenTutor}
                  onViewLibrary={() => setActiveTab('library')}
                  onEditDocument={(doc) => void handleOpenEditModal(doc)}
                  onDeleteDocument={(doc) => void handleDeleteDocument(doc)}
                />
              )}

              {activeTab === 'library' && (
                <LibraryView
                  documents={documents}
                  isUploading={isUploading}
                  activeUpload={activeUpload}
                  onTriggerUpload={() => fileInputRef.current?.click()}
                  onFileDropped={(file) => void handleFileUpload(file)}
                  onOpenTutor={(doc) => handleOpenTutor(doc)}
                  onEditDocument={(doc) => void handleOpenEditModal(doc)}
                  onDeleteDocument={(doc) => void handleDeleteDocument(doc)}
                />
              )}

              {activeTab === 'tutor' && (
                <TutorView
                  userId={userId}
                  userName={displayName}
                  sessionsCount={sessions.length}
                  documents={documents}
                  selectedDocument={selectedDocument}
                  documentChunks={
                    selectedDocument ? chunksByDocId[selectedDocument.id] || [] : []
                  }
                  isLoadingChunks={isLoadingChunks}
                  activeLanguage={activeLanguage}
                  pendingPrompt={pendingPrompt}
                  onConsumePendingPrompt={() => setPendingPrompt(null)}
                  onSelectDocument={setSelectedDocument}
                  onSelectLanguage={setActiveLanguage}
                  onTriggerUpload={() => fileInputRef.current?.click()}
                  onGoToLibrary={() => setActiveTab('library')}
                  onEditDocumentNotes={(doc, prefillNote) =>
                    void handleOpenEditModal(doc, prefillNote)
                  }
                  onDeleteDocument={(doc) => void handleDeleteDocument(doc)}
                  onSessionCreated={(newSession) =>
                    setSessions((prev) => [newSession, ...prev])
                  }
                />
              )}
            </>
          )}
        </main>
      </div>

      {/* CRUD Edit / Rename / Delete Modal for Study Notes & Extracted Chunks */}
      <EditNotesModal
        document={editingDoc}
        chunks={editingDoc ? chunksByDocId[editingDoc.id] || [] : []}
        isLoadingChunks={isLoadingEditChunks}
        onClose={() => setEditingDoc(null)}
        onSaveDocument={handleSaveDocumentDetails}
        onSaveChunkText={handleSaveChunkText}
        onDeleteDocument={handleDeleteDocument}
      />
    </div>
  );
};
