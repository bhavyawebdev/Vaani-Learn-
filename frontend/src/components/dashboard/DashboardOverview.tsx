import React, { useMemo } from 'react';
import {
  BookOpen,
  TrendingUp,
  Clock,
  Award,
  Flame,
  ArrowRight,
  SlidersHorizontal,
  Info,
  Check,
  FileUp,
  Mic,
} from 'lucide-react';
import type { DialectCode, StudyDocument, VoiceSession } from '../../types/workspace';
import { formatShortDocTitle } from '../../lib/pdfProcessor';
import { DIALECT_CONFIG } from '../../lib/voiceUtils';

interface DashboardOverviewProps {
  userName?: string;
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

function getTimeGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}

function getCurrentWeekDays(activeDateKeys: Set<string>) {
  const today = new Date();
  const dayOfWeek = today.getDay(); // 0=Sun..6=Sat
  const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;

  const shortLabels = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  const singleLabels = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(today);
    d.setDate(today.getDate() + mondayOffset + i);
    const key = d.toISOString().slice(0, 10);
    const isToday = d.toDateString() === today.toDateString();
    return {
      shortLabel: shortLabels[i],
      singleLabel: singleLabels[i],
      dayNumber: d.getDate(),
      key,
      isToday,
      hasActivity: activeDateKeys.has(key),
    };
  });
}

function formatDuration(totalSeconds: number): { hours: string; mins: string } {
  const hrs = Math.floor(totalSeconds / 3600);
  const mins = Math.floor((totalSeconds % 3600) / 60);
  return {
    hours: String(hrs),
    mins: String(mins).padStart(2, '0'),
  };
}

export const DashboardOverview: React.FC<DashboardOverviewProps> = ({
  userName = 'Learner',
  documents,
  sessions,
  activeLanguage,
  isUploading,
  onTriggerUpload,
  onOpenTutor,
  onViewLibrary,
}) => {
  const firstName = userName.trim().split(/\s+/)[0] || 'Learner';
  const greeting = getTimeGreeting();

  const readyDocs = useMemo(
    () => documents.filter((d) => d.status === 'ready'),
    [documents]
  );

  const totalChunks = useMemo(
    () =>
      documents.reduce(
        (sum, doc) => sum + (doc.extracted_metadata?.chunk_count || doc.page_count || 0),
        0
      ),
    [documents]
  );

  const totalSeconds = useMemo(
    () => sessions.reduce((sum, s) => sum + (s.duration_seconds || 0), 0),
    [sessions]
  );
  const durationParts = formatDuration(totalSeconds);

  // Active calendar days derived strictly from real uploads & voice sessions
  const activeDateKeys = useMemo(() => {
    const set = new Set<string>();
    documents.forEach((doc) => {
      if (doc.created_at) set.add(new Date(doc.created_at).toISOString().slice(0, 10));
    });
    sessions.forEach((s) => {
      if (s.created_at) set.add(new Date(s.created_at).toISOString().slice(0, 10));
    });
    return set;
  }, [documents, sessions]);

  const weekDays = useMemo(() => getCurrentWeekDays(activeDateKeys), [activeDateKeys]);

  // Real consecutive streak ending today or yesterday
  const streakCount = useMemo(() => {
    if (sessions.length === 0 && documents.length === 0) return 0;
    let streak = 0;
    const cursor = new Date();
    for (let i = 0; i < 30; i++) {
      const key = cursor.toISOString().slice(0, 10);
      if (activeDateKeys.has(key)) {
        streak++;
      } else if (i > 0) {
        break;
      }
      cursor.setDate(cursor.getDate() - 1);
    }
    return streak;
  }, [activeDateKeys, documents.length, sessions.length]);

  // Real checkpoint data for SVG performance curve (derived from real docs & sessions)
  const trendCheckpoints = useMemo(() => {
    const today = new Date();
    return [9, 6, 3, 0].map((daysAgo, idx) => {
      const d = new Date(today);
      d.setDate(today.getDate() - daysAgo);
      const label = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      const cutoffMs = d.getTime();

      const docsUpToDate = documents.filter(
        (doc) => new Date(doc.created_at).getTime() <= cutoffMs
      ).length;
      const sessionsUpToDate = sessions.filter(
        (s) => new Date(s.created_at).getTime() <= cutoffMs
      ).length;

      // Grounded readiness score from actual uploads + tutor practice sessions (0..100%)
      const rawScore =
        docsUpToDate === 0 && sessionsUpToDate === 0
          ? 0
          : Math.min(100, docsUpToDate * 18 + sessionsUpToDate * 16);

      return { idx, label, score: rawScore };
    });
  }, [documents, sessions]);

  const currentOverallScore = trendCheckpoints[trendCheckpoints.length - 1]?.score || 0;

  // =========================================================================
  // SCREEN 1: EMPTY STATE (0 uploaded PDFs)
  // =========================================================================
  if (documents.length === 0) {
    const emptyAxisDates = [-28, -21, -14, -7, 0].map((offset) => {
      const d = new Date();
      d.setDate(d.getDate() + offset);
      return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    });

    return (
      <div className="max-w-6xl mx-auto space-y-5 animate-in fade-in duration-200">
        {/* Top Greeting Banner Card */}
        <div className="bg-white rounded-[24px] border border-[#EAEAEA] p-6 sm:p-8 relative overflow-hidden">
          {/* Subtle Concentric Circle Line Watermark */}
          <div
            aria-hidden="true"
            className="hidden sm:block absolute -right-12 -top-12 w-72 h-72 rounded-full border border-[#F1F1EF] pointer-events-none"
          >
            <div className="absolute inset-8 rounded-full border border-[#F1F1EF]" />
            <div className="absolute inset-16 rounded-full border border-[#F1F1EF]" />
          </div>

          <div className="relative z-10 space-y-2 max-w-2xl">
            <div className="inline-flex items-center gap-2 text-[11px] font-medium text-[#5E5E5E]">
              <span className="w-1.5 h-1.5 rounded-full bg-[#1A1C1B]" />
              <span>Multilingual Engine • {DIALECT_CONFIG[activeLanguage].label}</span>
            </div>
            <h1 className="text-2xl sm:text-3xl lg:text-[34px] font-bold tracking-tight text-[#1A1C1B]">
              {greeting}, {firstName}.
            </h1>
            <p className="text-xs sm:text-sm text-[#5E5E5E] leading-relaxed">
              Every session brings you one step closer to mastery. Begin your grounded voice
              learning journey across your indexed manuscripts.
            </p>
          </div>
        </div>

        {/* 4 KPI Cards Row */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Card 1: Materials */}
          <div className="bg-white rounded-[20px] border border-[#EAEAEA] p-5 flex flex-col justify-between gap-4">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-semibold tracking-[0.12em] text-[#747878] uppercase">
                MATERIALS
              </span>
              <span className="w-7 h-7 rounded-full bg-[#F4F4F2] flex items-center justify-center text-[#5E5E5E]">
                <BookOpen className="w-3.5 h-3.5" />
              </span>
            </div>
            <div>
              <div className="flex items-baseline gap-1.5">
                <span className="text-3xl font-bold text-[#1A1C1B]">0</span>
                <span className="text-xs text-[#747878]">indexed</span>
              </div>
              <p className="text-[11px] text-[#747878] mt-1">PDFs synced &amp; indexed</p>
            </div>
            <div className="bg-[#F9F9F7] border border-[#F1F1EF] rounded-xl px-3 py-1.5 flex items-center justify-between text-[11px]">
              <span className="text-[#747878]">Corpus Status</span>
              <span className="font-semibold text-[#1A1C1B]">Unseeded</span>
            </div>
          </div>

          {/* Card 2: Retention Rate */}
          <div className="bg-white rounded-[20px] border border-[#EAEAEA] p-5 flex flex-col justify-between gap-4">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-semibold tracking-[0.12em] text-[#747878] uppercase">
                RETENTION RATE
              </span>
              <span className="w-7 h-7 rounded-full bg-[#F4F4F2] flex items-center justify-center text-[#5E5E5E]">
                <TrendingUp className="w-3.5 h-3.5" />
              </span>
            </div>
            <div>
              <div className="text-3xl font-bold text-[#1A1C1B]">—</div>
              <p className="text-[11px] text-[#747878] mt-1">
                Overall Score • No evaluations yet
              </p>
            </div>
            <div className="space-y-1.5">
              <div className="w-full h-1 bg-[#EFEFEE] rounded-full" />
              <div className="flex items-center justify-between text-[10px] text-[#747878]">
                <span>Calibrating</span>
                <span>0%</span>
              </div>
            </div>
          </div>

          {/* Card 3: Engagement */}
          <div className="bg-white rounded-[20px] border border-[#EAEAEA] p-5 flex flex-col justify-between gap-4">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-semibold tracking-[0.12em] text-[#747878] uppercase">
                ENGAGEMENT
              </span>
              <span className="w-7 h-7 rounded-full bg-[#F4F4F2] flex items-center justify-center text-[#5E5E5E]">
                <Clock className="w-3.5 h-3.5" />
              </span>
            </div>
            <div>
              <div className="text-3xl font-bold text-[#1A1C1B]">
                {durationParts.hours}
                <span className="text-base font-medium text-[#5E5E5E] mx-0.5">h</span>
                {durationParts.mins}
                <span className="text-base font-medium text-[#5E5E5E] ml-0.5">m</span>
              </div>
              <p className="text-[11px] text-[#747878] mt-1">Total vocal &amp; study time</p>
            </div>
            <div className="bg-[#F9F9F7] border border-[#F1F1EF] rounded-xl px-3 py-1.5 flex items-center justify-between text-[11px]">
              <span className="text-[#747878]">Speech Cadence</span>
              <span className="font-semibold text-[#1A1C1B]">Idle</span>
            </div>
          </div>

          {/* Card 4: Proficiency */}
          <div className="bg-white rounded-[20px] border border-[#EAEAEA] p-5 flex flex-col justify-between gap-4">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-semibold tracking-[0.12em] text-[#747878] uppercase">
                PROFICIENCY
              </span>
              <span className="w-7 h-7 rounded-full bg-[#F4F4F2] flex items-center justify-center text-[#5E5E5E]">
                <Award className="w-3.5 h-3.5" />
              </span>
            </div>
            <div>
              <div className="flex items-baseline gap-1.5">
                <span className="text-3xl font-bold text-[#1A1C1B]">0</span>
                <span className="text-xs text-[#747878]">units</span>
              </div>
              <p className="text-[11px] text-[#747878] mt-1">Mastered across 0 documents</p>
            </div>
            <div className="bg-[#F9F9F7] border border-[#F1F1EF] rounded-xl px-3 py-1.5 flex items-center justify-between text-[11px]">
              <span className="text-[#747878]">Assessment Level</span>
              <span className="font-semibold text-[#1A1C1B]">Novice</span>
            </div>
          </div>
        </div>

        {/* Bottom 2-Column Split */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
          {/* Left Dark Streak Card */}
          <div className="lg:col-span-5 bg-[#161716] text-white rounded-[24px] p-5 sm:p-7 flex flex-col justify-between gap-6">
            <div>
              <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/10 text-neutral-300 text-[10px] font-semibold tracking-[0.14em] uppercase">
                <span className="w-1.5 h-1.5 rounded-full bg-neutral-400" />
                STREAK INACTIVE
              </span>

              <h2 className="text-xl sm:text-2xl font-bold text-white mt-5 tracking-tight">
                Start Your Learning Streak
              </h2>
              <p className="text-xs sm:text-sm text-neutral-400 mt-2 leading-relaxed">
                Consistency beats intensity. Upload your first PDF and complete a voice discussion
                with your AI tutor today to ignite your streak.
              </p>

              {/* Weekly Cadence */}
              <div className="mt-7 space-y-3">
                <div className="flex items-center justify-between text-[11px] gap-2">
                  <span className="font-semibold text-neutral-300">Weekly Cadence</span>
                  <span className="text-neutral-500">Target: 3 sessions / week</span>
                </div>

                <div className="grid grid-cols-7 gap-1 sm:gap-2 text-center">
                  {weekDays.map((day) => (
                    <div key={day.key} className="flex flex-col items-center gap-1.5">
                      <span className="text-[10px] text-neutral-500 font-medium">
                        {day.singleLabel}
                      </span>
                      <div
                        className={`w-full max-w-[34px] sm:max-w-[38px] aspect-square rounded-full flex items-center justify-center text-[11px] sm:text-xs font-semibold transition ${
                          day.isToday
                            ? 'border border-dashed border-white text-white bg-white/10'
                            : 'bg-white/5 text-neutral-400'
                        }`}
                      >
                        {day.dayNumber}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="bg-white/5 border border-white/10 rounded-2xl p-3.5 flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center text-neutral-300 flex-shrink-0">
                <Award className="w-4 h-4" />
              </div>
              <div className="min-w-0">
                <p className="text-xs font-semibold text-white">Next milestone</p>
                <p className="text-[11px] text-neutral-400 truncate">
                  3-day beginner badge (0/3 days completed)
                </p>
              </div>
            </div>
          </div>

          {/* Right Performance Trend Empty Card */}
          <div className="lg:col-span-7 bg-white rounded-[24px] border border-[#EAEAEA] p-5 sm:p-7 flex flex-col justify-between gap-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="text-lg sm:text-xl font-bold text-[#1A1C1B]">
                  Learning Performance Trend
                </h2>
                <p className="text-xs text-[#747878] mt-0.5">
                  Evaluated voice recall &amp; conceptual retention
                </p>
              </div>
              <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-[#F9F9F7] border border-[#EAEAEA] text-[11px] font-medium text-[#5E5E5E]">
                <SlidersHorizontal className="w-3 h-3" />
                <span>Last 30 Days</span>
              </span>
            </div>

            {/* Chart Empty State Box */}
            <div className="bg-[#F9F9F7] border border-[#F1F1EF] rounded-2xl p-4 sm:p-6 text-center space-y-5">
              <div className="py-4 sm:py-5 flex flex-col items-center max-w-sm mx-auto space-y-3">
                <div className="w-9 h-9 rounded-full bg-[#EFEFEE] flex items-center justify-center text-[#5E5E5E]">
                  <TrendingUp className="w-4 h-4" />
                </div>
                <p className="text-xs text-[#747878] leading-relaxed">
                  No study sessions recorded yet. Once you upload a PDF and engage in voice
                  tutoring, your retention curve and subject comprehension scores will appear here.
                </p>
              </div>

              <div className="grid grid-cols-5 gap-1 text-[9px] sm:text-[10px] text-[#858383] border-t border-[#EAEAEA] pt-3">
                {emptyAxisDates.map((d) => (
                  <span key={d}>{d}</span>
                ))}
              </div>
            </div>

            {/* Real Unseeded Material Tracks */}
            <div className="space-y-3">
              <div className="flex items-center justify-between text-[11px] font-medium text-[#747878]">
                <span>Uploaded Study Material Breakdown</span>
                <span>Comprehension Score</span>
              </div>

              {[1, 2].map((slot) => (
                <div key={slot} className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs text-[#5E5E5E]">
                    <span>Awaiting uploaded document 0{slot}</span>
                    <span className="text-[#858383]">—</span>
                  </div>
                  <div className="w-full h-1.5 bg-[#EFEFEE] rounded-full" />
                </div>
              ))}
            </div>

            <div className="pt-3 border-t border-[#F1F1EF] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <span className="inline-flex items-center gap-1.5 text-[11px] text-[#747878]">
                <Info className="w-3.5 h-3.5 flex-shrink-0" />
                <span>Materials are cataloged from your personal library repository</span>
              </span>

              <button
                type="button"
                onClick={onViewLibrary}
                className="bg-[#F4F4F2] hover:bg-[#EAEAE7] text-[#1A1C1B] text-xs font-semibold px-4 py-2.5 rounded-2xl inline-flex items-center justify-center gap-2 transition self-start sm:self-auto"
              >
                <span>Explore My Library</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // =========================================================================
  // SCREEN 2: ACTIVE STATE (User has >= 1 uploaded PDF)
  // =========================================================================
  // SVG polyline path computed cleanly from real trendCheckpoints
  const svgPoints = trendCheckpoints
    .map((pt, i) => {
      const x = 16 + i * 118;
      const y = 115 - (pt.score / 100) * 88;
      return `${x},${y}`;
    })
    .join(' ');

  const areaPoints = `16,120 ${svgPoints} 370,120`;

  return (
    <div className="max-w-6xl mx-auto space-y-5 animate-in fade-in duration-200">
      {/* Top Greeting Row */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 pt-1">
        <div>
          <h1 className="text-2xl sm:text-3xl lg:text-[34px] font-bold tracking-tight text-[#1A1C1B]">
            {greeting}, {firstName}.
          </h1>
          <p className="text-xs sm:text-sm text-[#5E5E5E] mt-1.5 max-w-2xl leading-relaxed">
            Every session brings you one step closer to mastery. Continue your grounded voice
            learning journey across your indexed manuscripts.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={onTriggerUpload}
            disabled={isUploading}
            className="bg-black hover:bg-neutral-800 text-white text-xs font-medium px-4 py-2 rounded-full inline-flex items-center gap-1.5 shadow-xs transition disabled:opacity-60"
          >
            <FileUp className="w-3.5 h-3.5" />
            <span>{isUploading ? 'Indexing...' : 'Upload PDF'}</span>
          </button>

          <button
            type="button"
            onClick={() => onOpenTutor(readyDocs[0] || documents[0])}
            className="bg-white hover:bg-[#F4F4F2] border border-[#EAEAEA] text-[#1A1C1B] text-xs font-medium px-4 py-2 rounded-full inline-flex items-center gap-1.5 transition"
          >
            <Mic className="w-3.5 h-3.5" />
            <span>Open Tutor</span>
          </button>
        </div>
      </div>

      {/* 4 Real KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white rounded-[20px] border border-[#EAEAEA] p-5 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-semibold tracking-[0.12em] text-[#747878] uppercase">
              TOTAL MATERIALS
            </span>
            <span className="w-7 h-7 rounded-full bg-[#F4F4F2] flex items-center justify-center text-[#5E5E5E]">
              <BookOpen className="w-3.5 h-3.5" />
            </span>
          </div>
          <div>
            <div className="flex items-baseline gap-1.5">
              <span className="text-3xl font-bold text-[#1A1C1B]">{documents.length}</span>
              <span className="text-xs text-[#747878]">indexed</span>
            </div>
            <p className="text-[11px] text-[#747878] mt-1">
              {readyDocs.length} PDFs synced &amp; ready
            </p>
          </div>
        </div>

        <div className="bg-white rounded-[20px] border border-[#EAEAEA] p-5 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-semibold tracking-[0.12em] text-[#747878] uppercase">
              OVERALL SCORE
            </span>
            <span className="w-7 h-7 rounded-full border-2 border-[#1A1C1B] bg-white flex items-center justify-center text-[#1A1C1B]">
              <TrendingUp className="w-3.5 h-3.5 stroke-[2.25]" />
            </span>
          </div>
          <div>
            <div className="flex items-baseline gap-2">
              <span className="text-3xl font-bold text-[#1A1C1B]">{currentOverallScore}%</span>
              <span className="text-[11px] font-medium text-[#5E5E5E]">
                {sessions.length} {sessions.length === 1 ? 'session' : 'sessions'}
              </span>
            </div>
            <p className="text-[11px] text-[#747878] mt-1">
              {sessions.length > 0
                ? 'Active grounded study progress'
                : 'Start a session in My Tutor'}
            </p>
          </div>
        </div>

        <div className="bg-white rounded-[20px] border border-[#EAEAEA] p-5 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-semibold tracking-[0.12em] text-[#747878] uppercase">
              LEARNING TIME
            </span>
            <span className="w-7 h-7 rounded-full bg-[#F4F4F2] flex items-center justify-center text-[#5E5E5E]">
              <Clock className="w-3.5 h-3.5" />
            </span>
          </div>
          <div>
            <div className="text-3xl font-bold text-[#1A1C1B]">
              {durationParts.hours}h {durationParts.mins}m
            </div>
            <p className="text-[11px] text-[#747878] mt-1">Total vocal &amp; study time</p>
          </div>
        </div>

        <div className="bg-white rounded-[20px] border border-[#EAEAEA] p-5 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-semibold tracking-[0.12em] text-[#747878] uppercase">
              INDEXED UNITS
            </span>
            <span className="w-7 h-7 rounded-full bg-[#F4F4F2] flex items-center justify-center text-[#5E5E5E]">
              <Award className="w-3.5 h-3.5" />
            </span>
          </div>
          <div>
            <div className="flex items-baseline gap-1.5">
              <span className="text-3xl font-bold text-[#1A1C1B]">{totalChunks}</span>
              <span className="text-xs text-[#747878]">sections</span>
            </div>
            <p className="text-[11px] text-[#747878] mt-1">
              Across {documents.length} uploaded {documents.length === 1 ? 'file' : 'files'}
            </p>
          </div>
        </div>
      </div>

      {/* Bottom 2-Column Split */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* Left Dark Active Streak Card */}
        <div className="lg:col-span-5 bg-[#161716] text-white rounded-[24px] p-5 sm:p-7 flex flex-col justify-between gap-6">
          <div>
            <div className="flex items-center justify-between">
              <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/10 text-neutral-200 text-[10px] font-semibold tracking-[0.14em] uppercase">
                <span className="w-1.5 h-1.5 rounded-full bg-white" />
                {streakCount > 0 ? 'ACTIVE STREAK' : 'STREAK READY'}
              </span>
              <Flame className="w-4 h-4 text-neutral-300" />
            </div>

            <h2 className="text-xl sm:text-2xl font-bold text-white mt-5 tracking-tight">
              {streakCount}-Day Learning Streak
            </h2>
            <p className="text-xs sm:text-sm text-neutral-400 mt-2 leading-relaxed">
              Consistency beats intensity. Keep your voice discussions alive every day to deepen
              conceptual retention.
            </p>

            {/* 7-Day Real Activity Grid */}
            <div className="grid grid-cols-7 gap-1 sm:gap-2 mt-7 text-center">
              {weekDays.map((day) => (
                <div key={day.key} className="flex flex-col items-center gap-1.5">
                  <span
                    className={`text-[10px] font-medium ${
                      day.isToday ? 'text-white font-semibold' : 'text-neutral-500'
                    }`}
                  >
                    {day.shortLabel}
                  </span>
                  <div
                    className={`w-full max-w-[36px] sm:max-w-[40px] h-9 sm:h-10 rounded-xl flex items-center justify-center text-[11px] sm:text-xs font-semibold relative transition ${
                      day.hasActivity
                        ? 'bg-white text-black shadow-xs'
                        : day.isToday
                        ? 'border border-dashed border-white/60 text-white bg-white/10'
                        : 'bg-white/10 text-neutral-400'
                    }`}
                  >
                    {day.hasActivity ? (
                      <Check className="w-4 h-4 stroke-[2.5]" />
                    ) : (
                      day.dayNumber
                    )}
                    {day.isToday && (
                      <span className="w-1.5 h-1.5 rounded-full bg-rose-500 absolute -top-0.5 -right-0.5" />
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="bg-white/5 border border-white/10 rounded-2xl p-3.5 flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center text-neutral-200 flex-shrink-0">
              <Award className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <p className="text-xs font-semibold text-white">
                Next milestone: 10-day acoustic badge
              </p>
              <p className="text-[11px] text-neutral-400">
                {Math.max(0, 10 - streakCount)} days remaining
              </p>
            </div>
          </div>
        </div>

        {/* Right Performance Trend & Real Uploaded PDFs Progress */}
        <div className="lg:col-span-7 bg-white rounded-[24px] border border-[#EAEAEA] p-5 sm:p-7 flex flex-col justify-between gap-5">
          <div>
            <h2 className="text-lg sm:text-xl font-bold text-[#1A1C1B]">
              Learning Performance Trend
            </h2>
            <p className="text-xs text-[#747878] mt-0.5">
              Evaluated voice recall &amp; conceptual retention
            </p>
            <div className="flex flex-wrap items-center gap-2 mt-3">
              <span className="px-3 py-1 rounded-full bg-[#F4F4F2] text-[11px] font-medium text-[#1A1C1B]">
                Last 10 Days
              </span>
              <span className="px-3 py-1 rounded-full bg-[#F9F9F7] border border-[#EAEAEA] text-[11px] font-medium text-[#5E5E5E]">
                {currentOverallScore}% readiness
              </span>
            </div>
          </div>

          {/* Real SVG Trend Graph */}
          <div className="space-y-2">
            <svg viewBox="0 0 386 125" className="w-full h-32 overflow-visible">
              <defs>
                <linearGradient id="trendGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#1A1C1B" stopOpacity="0.14" />
                  <stop offset="100%" stopColor="#1A1C1B" stopOpacity="0.0" />
                </linearGradient>
              </defs>
              {[25, 55, 85, 115].map((yPos) => (
                <line
                  key={yPos}
                  x1="10"
                  y1={yPos}
                  x2="376"
                  y2={yPos}
                  stroke="#EFEFEE"
                  strokeWidth="1"
                  strokeDasharray="3 4"
                />
              ))}
              <polygon points={areaPoints} fill="url(#trendGrad)" />
              <polyline
                fill="none"
                stroke="#1A1C1B"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                points={svgPoints}
              />
              {trendCheckpoints.map((pt, i) => {
                const cx = 16 + i * 118;
                const cy = 115 - (pt.score / 100) * 88;
                return (
                  <circle
                    key={pt.label}
                    cx={cx}
                    cy={cy}
                    r={i === trendCheckpoints.length - 1 ? 4.5 : 3}
                    fill="#1A1C1B"
                  />
                );
              })}
            </svg>

            <div className="grid grid-cols-4 gap-1 text-[10px] sm:text-[11px] text-[#747878] pt-1">
              {trendCheckpoints.map((pt, idx) => (
                <span
                  key={pt.label}
                  className={`${
                    idx === trendCheckpoints.length - 1
                      ? 'text-right font-semibold text-[#1A1C1B]'
                      : idx === 0
                      ? 'text-left'
                      : 'text-center'
                  }`}
                >
                  {pt.label}{' '}
                  <span className="block sm:inline">({pt.score}%)</span>
                </span>
              ))}
            </div>
          </div>

          {/* Real Uploaded Documents Progress Bars */}
          <div className="space-y-3 pt-2 border-t border-[#F1F1EF]">
            <div className="flex items-center justify-between text-[11px] text-[#747878] font-medium">
              <span>Active Study Materials</span>
              <button
                type="button"
                onClick={onViewLibrary}
                className="text-[#1A1C1B] font-semibold hover:underline"
              >
                Manage in Library →
              </button>
            </div>

            {documents.slice(0, 3).map((doc) => {
              const docSessions = sessions.filter((s) => s.document_id === doc.id).length;
              const progressPct =
                doc.status !== 'ready'
                  ? 45
                  : Math.min(100, 60 + docSessions * 20);

              return (
                <button
                  key={doc.id}
                  type="button"
                  onClick={() => doc.status === 'ready' && onOpenTutor(doc)}
                  className="w-full text-left space-y-1.5 group"
                >
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-medium text-[#1A1C1B] group-hover:underline truncate pr-3">
                      {formatShortDocTitle(doc.title, 34)}
                    </span>
                    <span className="font-semibold text-[#1A1C1B] flex-shrink-0">
                      {doc.status === 'ready' ? `${progressPct}%` : 'Indexing...'}
                    </span>
                  </div>
                  <div className="w-full h-1.5 bg-[#EFEFEE] rounded-full overflow-hidden">
                    <div
                      className="h-full bg-[#1A1C1B] rounded-full transition-all duration-300"
                      style={{ width: `${progressPct}%` }}
                    />
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};
