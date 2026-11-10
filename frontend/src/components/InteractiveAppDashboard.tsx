import React, { useState, useEffect } from 'react';
import { Logo } from './Logo';
import { useAuth } from '../context/AuthContext';
import { 
  Home, 
  Sparkles, 
  BookOpen, 
  FileSpreadsheet, 
  HelpCircle, 
  RotateCw, 
  BarChart2, 
  Sliders, 
  Download, 
  Upload, 
  Mic, 
  Play, 
  Pause, 
  Send, 
  FileText, 
  CheckCircle, 
  Database, 
  ChevronRight,
  RefreshCw,
  Search,
  Volume2,
  LogOut,
  Menu,
  X
} from 'lucide-react';

interface InteractiveAppDashboardProps {
  onBackToLanding: () => void;
  currentUserEmail?: string;
}

export const InteractiveAppDashboard: React.FC<InteractiveAppDashboardProps> = ({
  onBackToLanding,
  currentUserEmail
}) => {
  const { user, profile, signOut } = useAuth();
  const effectiveEmail = profile?.email || user?.email || currentUserEmail || 'student@vaanilearn.ai';
  const displayName = profile?.full_name || user?.user_metadata?.full_name || effectiveEmail.split('@')[0];
  const userInitial = displayName.charAt(0).toUpperCase();

  const [activeTab, setActiveTab] = useState<'home' | 'tutor' | 'library' | 'notes' | 'quizzes' | 'revision'>('tutor');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [currentLanguage, setCurrentLanguage] = useState<'gu' | 'hi' | 'en'>('gu');
  const [isRecording, setIsRecording] = useState(false);
  const [isPlayingAudio, setIsPlayingAudio] = useState(false);
  const [audioProgress, setAudioProgress] = useState(0);
  const [inputText, setInputText] = useState('');
  const [isAiThinking, setIsAiThinking] = useState(false);

  // Messages in current session
  const [messages, setMessages] = useState<Array<{
    id: string;
    sender: 'user' | 'ai';
    text: string;
    audioDuration?: string;
    chunkSource?: string;
    similarity?: string;
    lang: string;
  }>>([
    {
      id: '1',
      sender: 'user',
      text: 'આ અધ્યાયમાં મુખ્ય વિચારો શું છે?',
      lang: 'gu'
    },
    {
      id: '2',
      sender: 'ai',
      text: 'આ અધ્યાયમાં મુખ્ય વિચારો છે: ભારતનો પ્રાચીન ઇતિહાસ, સિંધુ ખીણની સંસ્કૃતિ, વૈદિક કાળ અને મૌર્ય સામ્રાજ્યના મહત્વપૂર્ણ યોગદાનનું વર્ણન કરવામાં આવ્યું છે.',
      audioDuration: '1:24',
      chunkSource: 'Page 3 • Paragraph 2',
      similarity: '0.942 Cosine',
      lang: 'gu'
    }
  ]);

  // Audio timer
  useEffect(() => {
    let interval: number;
    if (isPlayingAudio) {
      interval = window.setInterval(() => {
        setAudioProgress((prev) => {
          if (prev >= 84) {
            setIsPlayingAudio(false);
            return 0;
          }
          return prev + 1;
        });
      }, 500);
    }
    return () => clearInterval(interval);
  }, [isPlayingAudio]);

  const handleSendMessage = (customText?: string) => {
    const textToSend = customText || inputText;
    if (!textToSend.trim()) return;

    const userMsgId = Date.now().toString();
    setMessages((prev) => [
      ...prev,
      {
        id: userMsgId,
        sender: 'user',
        text: textToSend,
        lang: currentLanguage
      }
    ]);
    setInputText('');
    setIsAiThinking(true);

    // Simulate backend FastAPI + PyMuPDF + pgvector + Gemini + Gnani Timbre
    setTimeout(() => {
      setIsAiThinking(false);
      let aiResponseText = '';
      if (currentLanguage === 'gu') {
        aiResponseText = `પુસ્તક "Indian History.pdf" મુજબ: ${textToSend.replace(/[?]/g, '')} ના સંદર્ભમાં, મુખ્ય પરિબળો સામાજિક વ્યવસ્થા અને વેપાર માર્ગોનો વિકાસ હતા.`;
      } else if (currentLanguage === 'hi') {
        aiResponseText = `"Indian History.pdf" के अनुसार: ${textToSend.replace(/[?]/g, '')} से जुड़े मुख्य प्रमाण सिंधु सभ्यता के नगर नियोजन और शिल्प कौशल में मिलते हैं।`;
      } else {
        aiResponseText = `According to "Indian History.pdf": Concerning "${textToSend}", the primary evidence highlights urban planning, trade routes, and administrative governance.`;
      }

      setMessages((prev) => [
        ...prev,
        {
          id: (Date.now() + 1).toString(),
          sender: 'ai',
          text: aiResponseText,
          audioDuration: '0:58',
          chunkSource: 'Page 7 • Section 4',
          similarity: '0.968 Cosine',
          lang: currentLanguage
        }
      ]);
    }, 900);
  };

  const handleSimulateVoice = () => {
    if (isRecording) {
      setIsRecording(false);
      return;
    }
    setIsRecording(true);
    // Simulate Gnani Prisma STT converting voice to text in 1.2s
    setTimeout(() => {
      setIsRecording(false);
      const voicePrompts = {
        gu: 'મોહેં-જો-દડો સંસ્કૃતિની સૌથી વિશિષ્ટ લાક્ષણિકતા કઈ હતી?',
        hi: 'मौर्य साम्राज्य के पतन के मुख्य कारण क्या थे?',
        en: 'What were the defining features of the Harappan drainage system?'
      };
      handleSendMessage(voicePrompts[currentLanguage]);
    }, 1500);
  };

  return (
    <div className="min-h-screen bg-[#F8F9FA] flex flex-col font-sans">
      
      {/* Top Classroom Bar */}
      <header className="bg-white border-b border-slate-200 px-3 sm:px-6 py-2.5 sm:py-3 flex items-center justify-between">
        <div className="flex items-center gap-2 sm:gap-4">
          <div onClick={onBackToLanding} className="cursor-pointer">
            <Logo size="sm" />
          </div>
          <div className="hidden lg:flex items-center gap-2 text-xs text-slate-600 border-l border-slate-200 pl-3">
            <span className="font-semibold text-slate-900">Classroom:</span>
            <span>Ancient Indian Civilization</span>
            <span className="px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 font-mono text-[11px] border border-emerald-200">
              pgvector Connected
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2 sm:gap-3">
          {/* Language selector */}
          <div className="flex items-center bg-slate-100 p-0.5 rounded-xl border border-slate-200 text-xs">
            <button
              onClick={() => setCurrentLanguage('gu')}
              className={`px-1.5 sm:px-2.5 py-1 rounded-lg text-[11px] sm:text-xs font-medium transition ${
                currentLanguage === 'gu' ? 'bg-white text-black shadow-sm' : 'text-slate-600 hover:text-black'
              }`}
            >
              ગુજરાતી
            </button>
            <button
              onClick={() => setCurrentLanguage('hi')}
              className={`px-1.5 sm:px-2.5 py-1 rounded-lg text-[11px] sm:text-xs font-medium transition ${
                currentLanguage === 'hi' ? 'bg-white text-black shadow-sm' : 'text-slate-600 hover:text-black'
              }`}
            >
              हिन्दी
            </button>
            <button
              onClick={() => setCurrentLanguage('en')}
              className={`px-1.5 sm:px-2.5 py-1 rounded-lg text-[11px] sm:text-xs font-medium transition ${
                currentLanguage === 'en' ? 'bg-white text-black shadow-sm' : 'text-slate-600 hover:text-black'
              }`}
            >
              English
            </button>
          </div>

          {/* User Profile Avatar with Name Tooltip */}
          <div className="flex items-center gap-2">
            <span className="hidden md:inline text-xs font-semibold text-slate-800">
              {displayName}
            </span>
            <div 
              className="w-8 h-8 rounded-full bg-black text-white flex items-center justify-center font-bold text-xs shadow-sm cursor-pointer"
              title={`Logged in as ${displayName} (${effectiveEmail})`}
            >
              {userInitial}
            </div>
          </div>

          {/* Mobile Menu Button for Navigation Drawer */}
          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="md:hidden p-1.5 text-slate-700 hover:text-black rounded-lg hover:bg-slate-100 transition"
            aria-label="Toggle navigation"
          >
            {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>
      </header>

      {/* Mobile Drawer Dropdown */}
      {mobileMenuOpen && (
        <div className="md:hidden bg-white border-b border-slate-200 px-4 py-3 space-y-2 animate-in slide-in-from-top-2 duration-150 shadow-sm">
          <div className="grid grid-cols-2 gap-1.5 pb-2 border-b border-slate-100">
            <button
              onClick={() => { setActiveTab('home'); setMobileMenuOpen(false); }}
              className={`flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-medium ${
                activeTab === 'home' ? 'bg-slate-100 text-slate-900 font-semibold' : 'text-slate-600'
              }`}
            >
              <Home className="w-3.5 h-3.5" />
              <span>Home</span>
            </button>
            <button
              onClick={() => { setActiveTab('tutor'); setMobileMenuOpen(false); }}
              className={`flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-medium ${
                activeTab === 'tutor' ? 'bg-black text-white' : 'text-slate-600'
              }`}
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>AI Tutor</span>
            </button>
            <button
              onClick={() => { setActiveTab('library'); setMobileMenuOpen(false); }}
              className={`flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-medium ${
                activeTab === 'library' ? 'bg-slate-100 text-slate-900 font-semibold' : 'text-slate-600'
              }`}
            >
              <BookOpen className="w-3.5 h-3.5" />
              <span>Library</span>
            </button>
            <button
              onClick={() => { setActiveTab('notes'); setMobileMenuOpen(false); }}
              className={`flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-medium ${
                activeTab === 'notes' ? 'bg-slate-100 text-slate-900 font-semibold' : 'text-slate-600'
              }`}
            >
              <FileSpreadsheet className="w-3.5 h-3.5" />
              <span>Notes</span>
            </button>
            <button
              onClick={() => { setActiveTab('quizzes'); setMobileMenuOpen(false); }}
              className={`flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-medium ${
                activeTab === 'quizzes' ? 'bg-slate-100 text-slate-900 font-semibold' : 'text-slate-600'
              }`}
            >
              <HelpCircle className="w-3.5 h-3.5" />
              <span>Quizzes</span>
            </button>
            <button
              onClick={() => { setActiveTab('revision'); setMobileMenuOpen(false); }}
              className={`flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-medium ${
                activeTab === 'revision' ? 'bg-slate-100 text-slate-900 font-semibold' : 'text-slate-600'
              }`}
            >
              <RotateCw className="w-3.5 h-3.5" />
              <span>Revision</span>
            </button>
          </div>
          <div className="flex items-center justify-between pt-1">
            <button
              onClick={async () => {
                await signOut();
                onBackToLanding();
              }}
              className="text-xs text-rose-600 hover:text-rose-700 font-medium flex items-center gap-1.5 py-1"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span>Log out</span>
            </button>
            <button
              onClick={onBackToLanding}
              className="text-xs text-slate-500 hover:text-black py-1"
            >
              Back to Landing
            </button>
          </div>
        </div>
      )}

      {/* Main Workspace */}
      <div className="flex-1 flex overflow-hidden max-w-7xl w-full mx-auto p-4 sm:p-6 gap-6">
        
        {/* Left Navigation Sidebar */}
        <aside className="w-56 bg-white rounded-3xl border border-slate-200/90 p-4 shadow-sm hidden md:flex flex-col justify-between">
          <div className="space-y-1">
            <button
              onClick={() => setActiveTab('home')}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-semibold transition ${
                activeTab === 'home' ? 'bg-slate-100 text-slate-900' : 'text-slate-600 hover:bg-slate-50'
              }`}
            >
              <Home className="w-4 h-4" />
              <span>Home</span>
            </button>

            <button
              onClick={() => setActiveTab('tutor')}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-semibold transition ${
                activeTab === 'tutor' ? 'bg-black text-white' : 'text-slate-600 hover:bg-slate-50'
              }`}
            >
              <Sparkles className="w-4 h-4" />
              <span>AI Tutor</span>
            </button>

            <button
              onClick={() => setActiveTab('library')}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-semibold transition ${
                activeTab === 'library' ? 'bg-slate-100 text-slate-900' : 'text-slate-600 hover:bg-slate-50'
              }`}
            >
              <BookOpen className="w-4 h-4" />
              <span>My Library</span>
            </button>

            <button
              onClick={() => setActiveTab('notes')}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-semibold transition ${
                activeTab === 'notes' ? 'bg-slate-100 text-slate-900' : 'text-slate-600 hover:bg-slate-50'
              }`}
            >
              <FileSpreadsheet className="w-4 h-4" />
              <span>Smart Notes</span>
            </button>

            <button
              onClick={() => setActiveTab('quizzes')}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-semibold transition ${
                activeTab === 'quizzes' ? 'bg-slate-100 text-slate-900' : 'text-slate-600 hover:bg-slate-50'
              }`}
            >
              <HelpCircle className="w-4 h-4" />
              <span>Quizzes</span>
            </button>

            <button
              onClick={() => setActiveTab('revision')}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-semibold transition ${
                activeTab === 'revision' ? 'bg-slate-100 text-slate-900' : 'text-slate-600 hover:bg-slate-50'
              }`}
            >
              <RotateCw className="w-4 h-4" />
              <span>Revision</span>
            </button>
          </div>

          <div className="pt-4 border-t border-slate-100 space-y-1">
            <div className="px-3 py-2 text-[11px] text-slate-400">
              Credits Status:
              <div className="mt-1 flex justify-between text-slate-700 font-mono">
                <span>Gnani STT:</span> <span>98 / 100</span>
              </div>
              <div className="flex justify-between text-slate-700 font-mono">
                <span>Gnani TTS:</span> <span>95 / 100</span>
              </div>
            </div>
            <button
              onClick={async () => {
                await signOut();
                onBackToLanding();
              }}
              className="w-full text-left px-3 py-2 text-xs text-rose-600 hover:text-rose-700 font-medium transition flex items-center gap-2"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span>Log out (Supabase)</span>
            </button>
            <button
              onClick={onBackToLanding}
              className="w-full text-left px-3 py-1.5 text-xs text-slate-500 hover:text-black transition"
            >
              ← Back to Landing
            </button>
          </div>
        </aside>

        {/* Center Main Voice & Chat Arena */}
        <main className="flex-1 bg-white rounded-3xl border border-slate-200/90 shadow-sm flex flex-col justify-between overflow-hidden">
          
          {/* Active PDF Top Banner */}
          <div className="p-4 border-b border-slate-100 bg-[#FCFCFD] flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-11 rounded-xl bg-rose-50 border border-rose-200 flex flex-col items-center justify-center text-rose-600 font-bold text-[10px]">
                <span>PDF</span>
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-sm font-bold text-slate-900">Indian History.pdf</h2>
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 font-medium border border-emerald-200">
                    PyMuPDF Ready
                  </span>
                </div>
                <p className="text-xs text-slate-500">2.4 MB • 48 pages • 142 pgvector embeddings</p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button 
                onClick={() => alert('PDF parsed with PyMuPDF: 48 pages vectorized into Supabase PostgreSQL.')}
                className="p-2 rounded-xl border border-slate-200 hover:bg-slate-50 text-slate-600 text-xs transition"
                title="Inspect Extracted Chunks"
              >
                <Search className="w-4 h-4" />
              </button>
              <button 
                onClick={() => alert('Downloading official Indian History textbook PDF')}
                className="p-2 rounded-xl border border-slate-200 hover:bg-slate-50 text-slate-600 text-xs transition"
                title="Download PDF"
              >
                <Download className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Conversation Stream */}
          <div className="flex-1 overflow-y-auto p-5 sm:p-6 space-y-5">
            {messages.map((msg) => (
              <div 
                key={msg.id}
                className={`flex gap-3 ${msg.sender === 'user' ? 'justify-end items-end' : 'justify-start items-start'}`}
              >
                {msg.sender === 'ai' && (
                  <div className="w-8 h-8 rounded-full bg-slate-900 text-white flex items-center justify-center flex-shrink-0 mt-0.5">
                    <Sparkles className="w-4 h-4" />
                  </div>
                )}

                <div 
                  className={`max-w-[85%] rounded-2xl p-4 text-xs sm:text-sm leading-relaxed ${
                    msg.sender === 'user'
                      ? 'bg-[#F1F3F5] text-slate-900 rounded-tr-sm font-medium'
                      : 'bg-white border border-slate-200 shadow-sm rounded-tl-sm text-slate-800 space-y-3'
                  }`}
                >
                  <p>{msg.text}</p>

                  {/* AI Audio & Source Citation bar */}
                  {msg.sender === 'ai' && (
                    <div className="pt-2 border-t border-slate-100 flex flex-col gap-2">
                      <div className="flex items-center justify-between text-[11px] text-slate-500">
                        <span className="font-mono text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded">
                          Grounding: {msg.chunkSource} ({msg.similarity})
                        </span>
                        <span className="text-slate-400">Gemini 2.0 Free Tier</span>
                      </div>

                      {/* Audio Player */}
                      <div className="bg-[#F8F9FA] rounded-xl p-2.5 border border-slate-200/80 flex items-center gap-3">
                        <button
                          onClick={() => setIsPlayingAudio(!isPlayingAudio)}
                          className="w-7 h-7 rounded-full bg-black text-white flex items-center justify-center hover:bg-neutral-800 transition flex-shrink-0"
                        >
                          {isPlayingAudio ? (
                            <Pause className="w-3.5 h-3.5 fill-current" />
                          ) : (
                            <Play className="w-3.5 h-3.5 fill-current ml-0.5" />
                          )}
                        </button>
                        <div className="flex-1 space-y-1">
                          <div className="w-full bg-slate-200 h-1.5 rounded-full overflow-hidden">
                            <div 
                              className="bg-black h-full rounded-full transition-all duration-300"
                              style={{ width: `${(audioProgress / 84) * 100}%` }}
                            />
                          </div>
                          <div className="flex justify-between text-[10px] text-slate-500 font-mono">
                            <span>{audioProgress}s / {msg.audioDuration}</span>
                            <span>Gnani Timbre Synthetic Audio</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                {msg.sender === 'user' && (
                  <div className="w-8 h-8 rounded-full bg-slate-800 text-white flex items-center justify-center font-bold text-xs flex-shrink-0">
                    N
                  </div>
                )}
              </div>
            ))}

            {isAiThinking && (
              <div className="flex items-center gap-3 text-xs text-slate-500 italic">
                <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center">
                  <RefreshCw className="w-4 h-4 animate-spin text-slate-600" />
                </div>
                <span>Retrieving pgvector chunks and synthesizing voice via Gnani...</span>
              </div>
            )}
          </div>

          {/* Voice Input & Query Bar */}
          <div className="p-4 border-t border-slate-100 bg-[#FCFCFD] space-y-3">
            
            {/* Quick Prompt Suggestions */}
            <div className="flex items-center gap-2 overflow-x-auto pb-1 text-xs">
              <span className="text-slate-400 font-medium">Quick Prompts:</span>
              <button
                onClick={() => handleSendMessage('આ પ્રકરણમાંથી 3 મહત્વપૂર્ણ પ્રશ્નો બનાવો.')}
                className="px-3 py-1 rounded-full bg-white border border-slate-200 text-slate-700 hover:border-black whitespace-nowrap"
              >
                3 મહત્વપૂર્ણ પ્રશ્નો
              </button>
              <button
                onClick={() => handleSendMessage('મૌર્ય કાળની કર પદ્ધતિ શું હતી?')}
                className="px-3 py-1 rounded-full bg-white border border-slate-200 text-slate-700 hover:border-black whitespace-nowrap"
              >
                મૌર્ય કર પદ્ધતિ
              </button>
              <button
                onClick={() => handleSendMessage('Summarize key points in English')}
                className="px-3 py-1 rounded-full bg-white border border-slate-200 text-slate-700 hover:border-black whitespace-nowrap"
              >
                Summarize in English
              </button>
            </div>

            {/* Input and Big Central Mic */}
            <div className="flex items-center gap-3">
              <div className="flex-1 relative">
                <input
                  type="text"
                  value={inputText}
                  onChange={(e) => setInputText(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleSendMessage();
                  }}
                  placeholder={
                    currentLanguage === 'gu'
                      ? 'તમારો પ્રશ્ન અહીં લખો અથવા બોલો...'
                      : currentLanguage === 'hi'
                      ? 'अपना प्रश्न यहाँ लिखें या बोलें...'
                      : 'Type or speak your question here...'
                  }
                  className="w-full px-4 py-3 rounded-2xl bg-[#F4F5F7] border border-transparent focus:border-slate-300 focus:bg-white text-xs sm:text-sm text-slate-900 placeholder-slate-400 outline-none pr-10"
                />
                <button
                  onClick={() => handleSendMessage()}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-black transition"
                >
                  <Send className="w-4 h-4" />
                </button>
              </div>

              {/* Big Pulsing Mic Button (Simulates Gnani Prisma STT) */}
              <button
                onClick={handleSimulateVoice}
                className={`w-12 h-12 rounded-full flex items-center justify-center text-white transition-all shadow-md flex-shrink-0 ${
                  isRecording 
                    ? 'bg-red-600 ring-4 ring-red-200 animate-pulse' 
                    : 'bg-black hover:bg-neutral-800'
                }`}
                title="Tap to speak in Gujarati, Hindi or English (Gnani Prisma STT)"
              >
                <Mic className="w-5 h-5" />
              </button>
            </div>

            <div className="flex flex-col sm:flex-row sm:items-center justify-between text-[11px] text-slate-400 px-1 gap-1">
              <span className="truncate">{isRecording ? 'Listening in ' + currentLanguage.toUpperCase() + ' via Gnani Prisma...' : 'Gnani Prisma STT (140ms) • Gemini 2.0 Reasoning'}</span>
              <span className="hidden sm:inline">FastAPI Background Worker Ready</span>
            </div>

          </div>

        </main>

      </div>

    </div>
  );
};
