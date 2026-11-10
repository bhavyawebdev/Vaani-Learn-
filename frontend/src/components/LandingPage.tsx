import React, { useState, useEffect } from 'react';
import { Logo } from './Logo';
import { 
  ArrowRight, 
  Download, 
  Play, 
  Pause, 
  Mic, 
  RotateCw, 
  HelpCircle, 
  BookOpen, 
  Home, 
  Settings, 
  Sparkles,
  BarChart2,
  FileSpreadsheet,
  FileText
} from 'lucide-react';

interface LandingPageProps {
  onStartLearningFree?: () => void;
  onExploreExperience?: () => void;
}

export const LandingPage: React.FC<LandingPageProps> = ({
  onStartLearningFree,
  onExploreExperience
}) => {
  const [isPlayingAudio, setIsPlayingAudio] = useState(false);
  const [audioProgress, setAudioProgress] = useState(0);
  const [selectedLang, setSelectedLang] = useState<'gu' | 'hi' | 'en'>('gu');

  // Simulated Audio Playback
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

  const formatSeconds = (sec: number) => {
    const mins = Math.floor(sec / 60);
    const secs = sec % 60;
    return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
  };

  return (
    <div className="w-full bg-white text-slate-900 selection:bg-black selection:text-white font-sans">
      
      {/* =========================================================================
          HERO SECTION (Matches landingpage.png)
         ========================================================================= */}
      <section className="pt-8 pb-14 sm:pt-12 sm:pb-20 md:pt-16 md:pb-28 max-w-7xl mx-auto px-4 sm:px-8 lg:px-12">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 lg:gap-8 items-center">
          
          {/* Left Column: Headline, Subtitle & Buttons */}
          <div className="lg:col-span-5 space-y-6 sm:space-y-7">
            <h1 className="text-[36px] min-[400px]:text-[44px] sm:text-[60px] md:text-[68px] font-bold tracking-tight leading-[1.06] text-black">
              Turn your<br />
              knowledge<br />
              into a<br />
              conversation.
            </h1>

            <p className="text-[17px] sm:text-[18px] text-slate-600 leading-[1.6] max-w-md font-normal">
              Understand documents, ask questions and learn naturally in your language. 
              Your personal AI teacher is always ready to listen.
            </p>

            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-4 pt-2">
              <button
                onClick={onStartLearningFree}
                className="inline-flex items-center justify-center gap-2 bg-black hover:bg-neutral-800 text-white font-medium text-[15px] px-6 py-3.5 rounded-full transition-all duration-200 shadow-sm"
              >
                <span>Start learning free</span>
                <ArrowRight className="w-4 h-4" />
              </button>

              <button
                onClick={onExploreExperience}
                className="inline-flex items-center justify-center gap-2 bg-white hover:bg-slate-50 text-slate-800 font-medium text-[15px] px-6 py-3.5 rounded-full border border-slate-200 transition-all duration-200"
              >
                <span>Explore the experience</span>
              </button>
            </div>
          </div>

          {/* Right Column: Hero Mockup UI Card (Exact match of landingpage.png) */}
          <div className="lg:col-span-7">
            <div className="relative mx-auto max-w-2xl bg-white rounded-3xl border border-slate-200 shadow-[0_20px_50px_rgba(0,0,0,0.06)] overflow-hidden">
              
              {/* Card Header: VaaniLearn AI + Avatar 'N' */}
              <div className="flex items-center justify-between px-4 sm:px-6 py-3.5 sm:py-4 border-b border-slate-100 bg-white">
                <div className="flex items-center gap-2">
                  <Logo size="sm" />
                </div>
                <div className="w-8 h-8 rounded-full bg-black text-white font-semibold text-xs flex items-center justify-center shadow-sm">
                  N
                </div>
              </div>

              {/* Card Body: Sidebar & Main Chat */}
              <div className="grid grid-cols-12 min-h-[380px] sm:min-h-[460px] bg-slate-50/30">
                
                {/* Left Sidebar Menu */}
                <div className="col-span-3 border-r border-slate-100 bg-white p-3 space-y-1 hidden sm:block">
                  <div className="flex items-center gap-2.5 px-3 py-2 rounded-xl bg-slate-100 text-slate-900 font-semibold text-xs cursor-pointer">
                    <Home className="w-4 h-4 text-slate-900" />
                    <span>Home</span>
                  </div>
                  <div className="flex items-center gap-2.5 px-3 py-2 rounded-xl text-slate-600 hover:bg-slate-50 font-medium text-xs cursor-pointer">
                    <Sparkles className="w-4 h-4 text-slate-500" />
                    <span>AI Tutor</span>
                  </div>
                  <div className="flex items-center gap-2.5 px-3 py-2 rounded-xl text-slate-600 hover:bg-slate-50 font-medium text-xs cursor-pointer">
                    <BookOpen className="w-4 h-4 text-slate-500" />
                    <span>My Library</span>
                  </div>
                  <div className="flex items-center gap-2.5 px-3 py-2 rounded-xl text-slate-600 hover:bg-slate-50 font-medium text-xs cursor-pointer">
                    <FileSpreadsheet className="w-4 h-4 text-slate-500" />
                    <span>Smart Notes</span>
                  </div>
                  <div className="flex items-center gap-2.5 px-3 py-2 rounded-xl text-slate-600 hover:bg-slate-50 font-medium text-xs cursor-pointer">
                    <HelpCircle className="w-4 h-4 text-slate-500" />
                    <span>Quizzes</span>
                  </div>
                  <div className="flex items-center gap-2.5 px-3 py-2 rounded-xl text-slate-600 hover:bg-slate-50 font-medium text-xs cursor-pointer">
                    <RotateCw className="w-4 h-4 text-slate-500" />
                    <span>Revision</span>
                  </div>
                  <div className="flex items-center gap-2.5 px-3 py-2 rounded-xl text-slate-600 hover:bg-slate-50 font-medium text-xs cursor-pointer">
                    <BarChart2 className="w-4 h-4 text-slate-500" />
                    <span>Progress</span>
                  </div>
                  <div className="flex items-center gap-2.5 px-3 py-2 rounded-xl text-slate-600 hover:bg-slate-50 font-medium text-xs cursor-pointer">
                    <Settings className="w-4 h-4 text-slate-500" />
                    <span>Settings</span>
                  </div>
                </div>

                {/* Right Chat & PDF Interaction Area */}
                <div className="col-span-12 sm:col-span-9 p-3.5 sm:p-5 flex flex-col justify-between bg-[#FCFCFD]">
                  
                  {/* PDF Document Capsule */}
                  <div className="bg-white rounded-2xl border border-slate-200/90 p-3.5 shadow-sm flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-10 rounded-lg bg-rose-50 border border-rose-200 flex flex-col items-center justify-center text-rose-600 font-bold text-[10px]">
                        <span>PDF</span>
                      </div>
                      <div>
                        <p className="text-xs font-bold text-slate-900">Indian History.pdf</p>
                        <p className="text-[11px] text-slate-400">2.4 MB</p>
                      </div>
                    </div>
                    <button className="p-1.5 text-slate-400 hover:text-slate-700 transition" title="Download PDF">
                      <Download className="w-4 h-4" />
                    </button>
                  </div>

                  {/* Chat Conversation Area */}
                  <div className="space-y-4 my-4">
                    
                    {/* User Question (Right aligned) */}
                    <div className="flex justify-end items-end gap-2.5">
                      <div className="bg-[#F1F3F5] text-slate-900 rounded-2xl rounded-tr-sm px-4 py-3 max-w-[85%] text-xs font-medium leading-relaxed">
                        {selectedLang === 'gu' && 'આ અધ્યાયમાં મુખ્ય વિચારો શું છે?'}
                        {selectedLang === 'hi' && 'इस अध्याय के मुख्य विचार क्या हैं?'}
                        {selectedLang === 'en' && 'What are the main ideas in this chapter?'}
                      </div>
                      <div className="w-7 h-7 rounded-full bg-slate-800 text-white flex items-center justify-center text-[10px] font-semibold flex-shrink-0">
                        N
                      </div>
                    </div>

                    {/* AI Teacher Response (Left aligned) */}
                    <div className="flex justify-start items-start gap-2.5">
                      <div className="w-7 h-7 rounded-full bg-slate-100 border border-slate-200 flex items-center justify-center flex-shrink-0 mt-1">
                        <Sparkles className="w-3.5 h-3.5 text-slate-700" />
                      </div>
                      <div className="bg-white border border-slate-200/80 rounded-2xl rounded-tl-sm p-4 max-w-[92%] shadow-sm space-y-3">
                        <p className="text-xs text-slate-800 font-normal leading-relaxed">
                          {selectedLang === 'gu' && 'આ અધ્યાયમાં મુખ્ય વિચારો છે: ભારતનો પ્રાચીન ઇતિહાસ, સંસ્કૃતિ અને મહત્વપૂર્ણ રાજવંશો....'}
                          {selectedLang === 'hi' && 'इस अध्याय में मुख्य विचार हैं: प्राचीन भारत का इतिहास, संस्कृति और महत्वपूर्ण राजवंश....'}
                          {selectedLang === 'en' && 'The main ideas in this chapter are: ancient Indian history, rich cultural heritage, and influential dynasties....'}
                        </p>

                        {/* Audio Player Bar */}
                        <div className="bg-[#F8F9FA] rounded-xl p-2.5 border border-slate-200/60 flex items-center gap-3">
                          <button
                            onClick={() => setIsPlayingAudio(!isPlayingAudio)}
                            className="w-7 h-7 rounded-full bg-black text-white flex items-center justify-center hover:bg-neutral-800 transition shadow-sm flex-shrink-0"
                          >
                            {isPlayingAudio ? (
                              <Pause className="w-3 h-3 fill-current" />
                            ) : (
                              <Play className="w-3 h-3 fill-current ml-0.5" />
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
                              <span>{formatSeconds(audioProgress)} / 1:24</span>
                            </div>
                          </div>
                        </div>

                      </div>
                    </div>

                  </div>

                  {/* Bottom Microphone Bar with Soundwaves */}
                  <div className="pt-2 flex flex-col items-center justify-center">
                    <div className="flex items-center gap-3">
                      {/* Left wave bars */}
                      <div className="flex items-center gap-0.5 h-5">
                        <span className={`w-0.5 rounded-full bg-slate-400 transition-all ${isPlayingAudio ? 'h-3 animate-wave-1' : 'h-1.5'}`} />
                        <span className={`w-0.5 rounded-full bg-slate-400 transition-all ${isPlayingAudio ? 'h-5 animate-wave-2' : 'h-2'}`} />
                        <span className={`w-0.5 rounded-full bg-slate-400 transition-all ${isPlayingAudio ? 'h-4 animate-wave-3' : 'h-1'}`} />
                      </div>

                      {/* Center Mic Button */}
                      <button
                        onClick={() => setIsPlayingAudio(!isPlayingAudio)}
                        className={`w-12 h-12 rounded-full flex items-center justify-center text-white transition-all shadow-md ${
                          isPlayingAudio 
                            ? 'bg-red-600 ring-4 ring-red-100 scale-105' 
                            : 'bg-black hover:bg-neutral-800'
                        }`}
                        title="Click to speak"
                      >
                        <Mic className="w-5 h-5" />
                      </button>

                      {/* Right wave bars */}
                      <div className="flex items-center gap-0.5 h-5">
                        <span className={`w-0.5 rounded-full bg-slate-400 transition-all ${isPlayingAudio ? 'h-4 animate-wave-3' : 'h-1'}`} />
                        <span className={`w-0.5 rounded-full bg-slate-400 transition-all ${isPlayingAudio ? 'h-5 animate-wave-2' : 'h-2'}`} />
                        <span className={`w-0.5 rounded-full bg-slate-400 transition-all ${isPlayingAudio ? 'h-3 animate-wave-1' : 'h-1.5'}`} />
                      </div>
                    </div>
                  </div>

                </div>

              </div>

            </div>
          </div>

        </div>
      </section>

      {/* =========================================================================
          SECTION 2: FOUR KEY PILLARS (Matches landingpage.png)
         ========================================================================= */}
      <section id="features" className="py-14 sm:py-20 md:py-24 border-t border-slate-100 max-w-7xl mx-auto px-4 sm:px-8 lg:px-12">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 lg:gap-12 items-start">
          
          {/* Left Column: Heading & Subtitle */}
          <div className="lg:col-span-5 space-y-4">
            <h2 className="text-[28px] min-[380px]:text-[34px] sm:text-[44px] font-bold tracking-tight leading-[1.12] text-black">
              Having information isn't<br />
              the same as<br />
              understanding it.
            </h2>
            <p className="text-[15px] sm:text-[17px] text-slate-600 leading-relaxed max-w-md">
              VaaniLearn AI bridges the gap with<br className="hidden sm:inline" />
              interactive, voice-first learning.
            </p>
          </div>

          {/* Right Column: 4 Feature Pillars */}
          <div className="lg:col-span-7 grid grid-cols-2 sm:grid-cols-4 gap-4 sm:gap-6 pt-2">
            
            {/* Feature 1: AI Tutor */}
            <div className="space-y-3">
              <div className="w-10 h-10 rounded-xl bg-slate-50 border border-slate-100 flex items-center justify-center text-slate-800">
                <Mic className="w-5 h-5 stroke-[1.75]" />
              </div>
              <div>
                <h3 className="text-[15px] font-bold text-slate-900">AI Tutor</h3>
                <p className="text-[13px] text-slate-500 mt-1 leading-snug">Ask anything, anytime</p>
              </div>
            </div>

            {/* Feature 2: Voice Learning */}
            <div className="space-y-3">
              <div className="w-10 h-10 rounded-xl bg-slate-50 border border-slate-100 flex items-center justify-center text-slate-800">
                <FileText className="w-5 h-5 stroke-[1.75]" />
              </div>
              <div>
                <h3 className="text-[15px] font-bold text-slate-900">Voice Learning</h3>
                <p className="text-[13px] text-slate-500 mt-1 leading-snug">Learn by speaking</p>
              </div>
            </div>

            {/* Feature 3: Smart Notes */}
            <div className="space-y-3">
              <div className="w-10 h-10 rounded-xl bg-slate-50 border border-slate-100 flex items-center justify-center text-slate-800">
                <FileSpreadsheet className="w-5 h-5 stroke-[1.75]" />
              </div>
              <div>
                <h3 className="text-[15px] font-bold text-slate-900">Smart Notes</h3>
                <p className="text-[13px] text-slate-500 mt-1 leading-snug">Summarize &amp; organize</p>
              </div>
            </div>

            {/* Feature 4: Active Revision */}
            <div className="space-y-3">
              <div className="w-10 h-10 rounded-xl bg-slate-50 border border-slate-100 flex items-center justify-center text-slate-800">
                <RotateCw className="w-5 h-5 stroke-[1.75]" />
              </div>
              <div>
                <h3 className="text-[15px] font-bold text-slate-900">Active Revision</h3>
                <p className="text-[13px] text-slate-500 mt-1 leading-snug">Remember better</p>
              </div>
            </div>

          </div>

        </div>
      </section>

      {/* =========================================================================
          SECTION 3: HOW IT WORKS (Matches landingpage.png)
         ========================================================================= */}
      <section id="how-it-works" className="py-14 sm:py-20 md:py-24 bg-[#FAFAFB] border-y border-slate-100">
        <div className="max-w-7xl mx-auto px-4 sm:px-8 lg:px-12 text-center">
          
          {/* Pill Badge */}
          <div className="inline-block px-3 py-1 rounded-full bg-slate-100 border border-slate-200 text-xs font-semibold text-slate-600 mb-4">
            How it works
          </div>

          <h2 className="text-[28px] sm:text-[44px] font-bold tracking-tight text-black">
            Just 4 simple steps.
          </h2>

          <p className="text-[16px] text-slate-500 mt-2 max-w-xl mx-auto">
            Your personal AI learning assistant, in the easiest way possible.
          </p>

          {/* 4 Steps Row with Subtle Arrows */}
          <div className="mt-16 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8 relative">
            
            {/* Step 1 */}
            <div className="flex flex-col items-center text-center space-y-3">
              <div className="w-12 h-12 rounded-full border border-slate-200 bg-white shadow-sm flex items-center justify-center text-[17px] font-semibold text-slate-900">
                1
              </div>
              <h3 className="text-[17px] font-bold text-slate-900 pt-1">Upload</h3>
              <p className="text-[14px] text-slate-500 max-w-[200px]">Add your study material</p>
            </div>

            {/* Step 2 */}
            <div className="flex flex-col items-center text-center space-y-3">
              <div className="w-12 h-12 rounded-full border border-slate-200 bg-white shadow-sm flex items-center justify-center text-[17px] font-semibold text-slate-900">
                2
              </div>
              <h3 className="text-[17px] font-bold text-slate-900 pt-1">Ask</h3>
              <p className="text-[14px] text-slate-500 max-w-[200px]">Speak or type your question</p>
            </div>

            {/* Step 3 */}
            <div className="flex flex-col items-center text-center space-y-3">
              <div className="w-12 h-12 rounded-full border border-slate-200 bg-white shadow-sm flex items-center justify-center text-[17px] font-semibold text-slate-900">
                3
              </div>
              <h3 className="text-[17px] font-bold text-slate-900 pt-1">Understand</h3>
              <p className="text-[14px] text-slate-500 max-w-[200px]">Get clear explanations</p>
            </div>

            {/* Step 4 */}
            <div className="flex flex-col items-center text-center space-y-3">
              <div className="w-12 h-12 rounded-full border border-slate-200 bg-white shadow-sm flex items-center justify-center text-[17px] font-semibold text-slate-900">
                4
              </div>
              <h3 className="text-[17px] font-bold text-slate-900 pt-1">Remember</h3>
              <p className="text-[14px] text-slate-500 max-w-[200px]">Revise and retain</p>
            </div>

          </div>

        </div>
      </section>

      {/* =========================================================================
          SECTION 4: MULTILINGUAL LEARNING (Matches landingpage.png)
         ========================================================================= */}
      <section id="languages" className="py-14 sm:py-20 md:py-24 max-w-7xl mx-auto px-4 sm:px-8 lg:px-12 text-center">
        
        {/* Pill Badge */}
        <div className="inline-block px-3 py-1 rounded-full bg-slate-100 border border-slate-200 text-xs font-semibold text-slate-600 mb-4">
          Multilingual Learning
        </div>

        <h2 className="text-[28px] sm:text-[44px] font-bold tracking-tight text-black">
          Learn in your language.
        </h2>

        <p className="text-[16px] text-slate-500 mt-2 max-w-xl mx-auto">
          Get explanations in the language you are most comfortable with.
        </p>

        {/* 3 Language Cards: English, Hindi, Gujarati */}
        <div className="mt-12 grid grid-cols-1 md:grid-cols-3 gap-6 max-w-4xl mx-auto">
          
          {/* Card 1: English */}
          <button
            onClick={() => setSelectedLang('en')}
            className={`p-8 rounded-2xl bg-white transition-all text-center ${
              selectedLang === 'en'
                ? 'border-2 border-black shadow-md'
                : 'border border-slate-200 hover:border-slate-300 shadow-sm'
            }`}
          >
            <h3 className="text-xl font-bold text-slate-900">English</h3>
            <p className="text-sm text-slate-500 mt-1.5 font-normal">Learn globally</p>
          </button>

          {/* Card 2: Hindi */}
          <button
            onClick={() => setSelectedLang('hi')}
            className={`p-8 rounded-2xl bg-white transition-all text-center ${
              selectedLang === 'hi'
                ? 'border-2 border-black shadow-md'
                : 'border border-slate-200 hover:border-slate-300 shadow-sm'
            }`}
          >
            <h3 className="text-xl font-bold text-slate-900">हिंदी</h3>
            <p className="text-sm text-slate-500 mt-1.5 font-normal">सीखें अपनी भाषा में</p>
          </button>

          {/* Card 3: Gujarati (Active by default, matching landingpage.png) */}
          <button
            onClick={() => setSelectedLang('gu')}
            className={`p-8 rounded-2xl bg-white transition-all text-center ${
              selectedLang === 'gu'
                ? 'border-2 border-black shadow-md'
                : 'border border-slate-200 hover:border-slate-300 shadow-sm'
            }`}
          >
            <h3 className="text-xl font-bold text-slate-900">ગુજરાતી</h3>
            <p className="text-sm text-slate-500 mt-1.5 font-normal">આપણી ભાષામાં શીખો</p>
          </button>

        </div>

      </section>

      {/* =========================================================================
          SECTION 5: BOTTOM CTA BANNER (Matches landingpage.png)
         ========================================================================= */}
      <section className="py-10 sm:py-12 max-w-7xl mx-auto px-4 sm:px-8 lg:px-12">
        <div className="bg-[#F3F4F6] rounded-3xl p-6 sm:p-12 lg:p-14 flex flex-col md:flex-row items-center justify-between gap-6 sm:gap-8">
          <div className="space-y-2 text-center md:text-left">
            <h2 className="text-2xl sm:text-[34px] md:text-[38px] font-bold tracking-tight text-black">
              Make learning feel natural again.
            </h2>
            <p className="text-sm sm:text-[16px] text-slate-600 font-normal">
              Join thousands of learners who are already using VaaniLearn AI.
            </p>
          </div>

          <button
            onClick={onStartLearningFree}
            className="w-full sm:w-auto flex-shrink-0 inline-flex items-center justify-center gap-2 bg-black hover:bg-neutral-800 text-white font-medium text-[15px] px-7 py-3.5 rounded-full transition-all duration-200 shadow-sm"
          >
            <span>Start learning free</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </section>

      {/* =========================================================================
          FOOTER (Matches landingpage.png)
         ========================================================================= */}
      <footer className="pt-10 pb-12 sm:pt-12 sm:pb-16 border-t border-slate-100 max-w-7xl mx-auto px-4 sm:px-8 lg:px-12">
        <div className="flex flex-col md:flex-row items-center justify-between gap-6 sm:gap-8">
          
          {/* Logo on Left */}
          <div className="flex items-center">
            <Logo size="md" />
          </div>

          {/* Links in Middle */}
          <div className="flex flex-wrap items-center justify-center gap-4 sm:gap-8 text-[14px] text-slate-600 font-medium">
            <a href="#product" className="hover:text-black transition">Product</a>
            <a href="#features" className="hover:text-black transition">Features</a>
            <a href="#about" className="hover:text-black transition">About</a>
            <a href="#privacy" className="hover:text-black transition">Privacy</a>
            <a href="#terms" className="hover:text-black transition">Terms</a>
            <a href="#contact" className="hover:text-black transition">Contact</a>
          </div>

          {/* Social Icons on Right */}
          <div className="flex items-center space-x-4 text-slate-700">
            {/* GitHub */}
            <a 
              href="https://github.com" 
              target="_blank" 
              rel="noreferrer" 
              className="p-2 hover:text-black transition"
              title="GitHub"
            >
              <svg className="w-5 h-5 fill-current" viewBox="0 0 24 24">
                <path fillRule="evenodd" clipRule="evenodd" d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.53 1.032 1.53 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z" />
              </svg>
            </a>

            {/* LinkedIn */}
            <a 
              href="https://linkedin.com" 
              target="_blank" 
              rel="noreferrer" 
              className="p-2 hover:text-black transition"
              title="LinkedIn"
            >
              <svg className="w-5 h-5 fill-current" viewBox="0 0 24 24">
                <path d="M19 3a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h14m-.5 15.5v-5.3a3.26 3.26 0 0 0-3.26-3.26c-.85 0-1.84.52-2.28 1.3v-1.11h-2.79v8.37h2.79v-4.93c0-.77.62-1.4 1.39-1.4a1.4 1.4 0 0 1 1.4 1.4v4.93h2.75M6.46 10.9h2.77v8.37H6.46v-8.37M7.84 6.2a1.62 1.62 0 1 0 0 3.24 1.62 1.62 0 0 0 0-3.24Z" />
              </svg>
            </a>

            {/* YouTube */}
            <a 
              href="https://youtube.com" 
              target="_blank" 
              rel="noreferrer" 
              className="p-2 hover:text-black transition"
              title="YouTube"
            >
              <svg className="w-5 h-5 fill-current" viewBox="0 0 24 24">
                <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/>
              </svg>
            </a>

          </div>

        </div>
      </footer>

    </div>
  );
};
