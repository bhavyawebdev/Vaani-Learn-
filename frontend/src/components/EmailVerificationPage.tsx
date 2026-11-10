import React, { useState, useRef, useEffect } from 'react';
import { 
  Mail, 
  CheckCircle2, 
  ArrowRight, 
  ArrowLeft, 
  RotateCw, 
  Lock, 
  Edit3, 
  ShieldCheck, 
  Sparkles,
  AlertCircle
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';

interface EmailVerificationPageProps {
  email: string;
  onVerificationSuccess: () => void;
  onBackToSignIn: () => void;
  onChangeEmail: () => void;
  demoOtp?: string;
}

export const EmailVerificationPage: React.FC<EmailVerificationPageProps> = ({
  email = 'user@vaanilearn.ai',
  onVerificationSuccess,
  onBackToSignIn,
  onChangeEmail,
  demoOtp = '123456',
}) => {
  const { verifyOtp, resendOtp, isConfigured } = useAuth();
  const [otp, setOtp] = useState<string[]>(['', '', '', '', '', '']);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isVerifying, setIsVerifying] = useState(false);
  const [isVerified, setIsVerified] = useState(false);
  const [cooldown, setCooldown] = useState(45);
  const [isResending, setIsResending] = useState(false);
  const [resendSuccess, setResendSuccess] = useState(false);

  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  // Focus first OTP box on mount
  useEffect(() => {
    inputRefs.current[0]?.focus();
  }, []);

  // Cooldown countdown timer
  useEffect(() => {
    let interval: number;
    if (cooldown > 0) {
      interval = window.setInterval(() => {
        setCooldown((prev) => (prev > 0 ? prev - 1 : 0));
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [cooldown]);

  // Handle single digit input or full 6-digit paste
  const handleChange = (index: number, value: string) => {
    setErrorMsg(null);
    const cleaned = value.replace(/\D/g, ''); // Digits only

    const newOtp = [...otp];

    // If user pasted multiple digits (e.g. 6-digit code from Brevo email)
    if (cleaned.length > 1) {
      const pastedDigits = cleaned.slice(0, 6).split('');
      pastedDigits.forEach((char, i) => {
        if (i < 6) newOtp[i] = char;
      });
      setOtp(newOtp);
      const nextFocus = Math.min(pastedDigits.length, 5);
      inputRefs.current[nextFocus]?.focus();
      return;
    }

    newOtp[index] = cleaned;
    setOtp(newOtp);

    // Auto-advance to next box
    if (cleaned && index < 5) {
      inputRefs.current[index + 1]?.focus();
    }
  };

  // Handle backspace navigation
  const handleKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace' && !otp[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
    if (e.key === 'Enter') {
      handleSubmit();
    }
  };

  // Submit OTP Verification with Supabase Auth
  const handleSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const enteredCode = otp.join('');

    if (enteredCode.length < 6) {
      setErrorMsg('Please enter the complete 6-digit verification code.');
      return;
    }

    setIsVerifying(true);
    setErrorMsg(null);

    try {
      const { error } = await verifyOtp(email, enteredCode);

      if (error) {
        setIsVerifying(false);
        setErrorMsg(
          error.message?.includes('expired')
            ? 'This verification code has expired. Please request a new one.'
            : isConfigured
            ? error.message || 'Incorrect verification code. Please check your inbox or spam.'
            : `Incorrect code. Enter demo OTP: ${demoOtp}`
        );
        return;
      }

      setIsVerifying(false);
      setIsVerified(true);

      // Automatic transition to user's personal dashboard
      setTimeout(() => {
        onVerificationSuccess();
      }, 1200);
    } catch (err: any) {
      setIsVerifying(false);
      setErrorMsg(err.message || 'Failed to verify code. Please try again.');
    }
  };

  // Resend OTP using Supabase Auth (Brevo SMTP delivery)
  const handleResend = async () => {
    if (cooldown > 0 || isResending) return;
    setIsResending(true);
    setErrorMsg(null);

    try {
      const { error } = await resendOtp(email);
      setIsResending(false);

      if (error) {
        setErrorMsg(error.message || 'Failed to resend code. Please wait a moment.');
        return;
      }

      setCooldown(60);
      setResendSuccess(true);
      setTimeout(() => setResendSuccess(false), 3500);
    } catch (err: any) {
      setIsResending(false);
      setErrorMsg(err.message || 'Failed to resend code.');
    }
  };

  return (
    <div className="min-h-screen bg-[#F9F9F7] text-[#1A1C1B] font-sans flex flex-col justify-between selection:bg-black selection:text-white antialiased px-4 sm:px-6 py-8">
      
      {/* =========================================================================
          TOP LOGO HEADER
         ========================================================================= */}
      <header className="w-full pt-4 pb-6 flex items-center justify-center">
        <div 
          onClick={onBackToSignIn} 
          className="cursor-pointer inline-flex items-center gap-2.5 group select-none"
        >
          {/* Black circle soundwave emblem */}
          <div className="w-10 h-10 rounded-full bg-black flex items-center justify-center text-white shadow-sm">
            <svg viewBox="0 0 24 24" className="w-5 h-5 fill-current">
              <rect x="3" y="9" width="2" height="6" rx="1" />
              <rect x="7" y="6" width="2" height="12" rx="1" />
              <rect x="11" y="3" width="2" height="18" rx="1" />
              <rect x="15" y="7" width="2" height="10" rx="1" />
              <rect x="19" y="10" width="2" height="4" rx="1" />
            </svg>
          </div>
          <div className="flex flex-col text-left leading-none">
            <span className="text-[18px] font-bold tracking-tight text-black">
              VaaniLearn
            </span>
            <span className="text-[10px] tracking-widest text-[#747878] font-semibold uppercase mt-0.5">
              AI EDUCATION
            </span>
          </div>
        </div>
      </header>

      {/* =========================================================================
          CENTRAL VERIFICATION CARD
         ========================================================================= */}
      <main className="w-full flex-1 flex flex-col items-center justify-center max-w-[480px] mx-auto my-auto px-1 sm:px-0">
        <div className="w-full bg-white rounded-[28px] sm:rounded-[32px] p-5 sm:p-8 md:p-11 shadow-[0_20px_50px_rgba(0,0,0,0.05)] border border-slate-100 flex flex-col items-center text-center relative overflow-hidden">
          
          {/* Subtle Archival Aura */}
          <div className="absolute -top-24 left-1/2 -translate-x-1/2 w-64 h-64 bg-[#F4F4F2] rounded-full blur-3xl pointer-events-none opacity-60" />

          {/* SUCCESS STATE */}
          {isVerified ? (
            <div className="flex flex-col items-center w-full animate-in fade-in duration-200">
              <div className="w-16 h-16 rounded-full bg-[#F4F4F2] flex items-center justify-center mb-6 shadow-sm">
                <CheckCircle2 className="w-9 h-9 text-emerald-600 stroke-[2]" />
              </div>
              <h1 className="text-2xl sm:text-[30px] font-extrabold tracking-tight text-black mb-2">
                Your email is verified.
              </h1>
              <p className="text-sm text-[#5E5E5E] max-w-sm mb-7 leading-relaxed font-normal">
                Credentials authenticated securely. Entering your personal learning dashboard...
              </p>
              <button
                type="button"
                onClick={onVerificationSuccess}
                className="w-full py-3.5 px-6 rounded-full bg-black hover:bg-neutral-800 text-white font-medium text-sm transition-all duration-200 flex items-center justify-center gap-2 shadow-sm"
              >
                <span>Continue to Dashboard</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          ) : (
            /* OTP ENTRY STATE */
            <div className="flex flex-col items-center w-full animate-in fade-in duration-200">
              
              {/* Graphic Icon */}
              <div className="relative mb-5 flex items-center justify-center">
                <div className="w-16 h-16 rounded-full bg-[#F4F4F2] flex items-center justify-center text-black shadow-sm">
                  <Mail className="w-7 h-7 text-black stroke-[1.75]" />
                </div>
                <div className="absolute -bottom-1 -right-1 w-6 h-6 rounded-full bg-black flex items-center justify-center text-white shadow-sm">
                  <Sparkles className="w-3.5 h-3.5 text-white" />
                </div>
              </div>

              {/* Title & Copy */}
              <h1 className="text-2xl sm:text-[30px] font-extrabold tracking-tight text-black mb-1.5 leading-tight">
                Check your inbox.
              </h1>
              <p className="text-sm text-[#5E5E5E] max-w-sm mb-4 leading-relaxed font-normal">
                We've sent a 6-digit verification code to your email address:
              </p>

              {/* Masked Email Capsule */}
              <div className="w-full bg-[#F4F4F2] rounded-2xl px-4 py-2.5 flex items-center justify-between gap-2 mb-6">
                <div className="flex items-center gap-2 truncate">
                  <Lock className="w-3.5 h-3.5 text-[#747878] flex-shrink-0" />
                  <span className="text-xs sm:text-sm font-medium text-black tracking-wide truncate">
                    {email}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={onChangeEmail}
                  className="text-xs text-[#5E5E5E] hover:text-black transition-colors font-medium flex items-center gap-1 flex-shrink-0"
                  title="Change address"
                >
                  <Edit3 className="w-3.5 h-3.5" />
                  <span>Edit</span>
                </button>
              </div>

              {/* OTP Input Form */}
              <form onSubmit={handleSubmit} className="w-full space-y-5">
                
                {/* 6 Digit Input Boxes (Scaled smoothly for small mobile 320px up to desktop) */}
                <div className="flex items-center justify-center gap-1.5 sm:gap-2.5">
                  {otp.map((digit, idx) => (
                    <input
                      key={idx}
                      ref={(el) => (inputRefs.current[idx] = el)}
                      type="text"
                      inputMode="numeric"
                      maxLength={6}
                      value={digit}
                      onChange={(e) => handleChange(idx, e.target.value)}
                      onKeyDown={(e) => handleKeyDown(idx, e)}
                      className={`w-9 h-12 sm:w-11 sm:h-14 md:w-12 md:h-14 text-center text-lg sm:text-xl font-bold rounded-xl transition-all outline-none ${
                        digit
                          ? 'bg-white border-2 border-black text-black shadow-sm'
                          : 'bg-[#F4F5F7] border border-slate-200 text-slate-800 focus:border-black focus:bg-white'
                      }`}
                    />
                  ))}
                </div>

                {/* Error Message */}
                {errorMsg && (
                  <div className="flex items-center justify-center gap-1.5 text-xs text-rose-600 font-medium">
                    <AlertCircle className="w-4 h-4 flex-shrink-0" />
                    <span>{errorMsg}</span>
                  </div>
                )}

                {/* Demo Helper Banner when Supabase is not yet configured */}
                {!isConfigured && (
                  <div className="bg-slate-50 border border-slate-200/80 rounded-xl px-3 py-2 flex items-center justify-between text-xs text-slate-600">
                    <span className="flex items-center gap-1 text-[11px] text-slate-500 font-medium">
                      Demo Test Code:
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        setOtp(demoOtp.split(''));
                        setErrorMsg(null);
                      }}
                      className="font-mono font-bold text-black bg-white px-2.5 py-0.5 rounded-lg border border-slate-200 hover:border-black shadow-xs transition"
                    >
                      Auto-Fill: {demoOtp}
                    </button>
                  </div>
                )}

                {/* Primary Verify Button */}
                <button
                  type="submit"
                  disabled={isVerifying}
                  className="w-full py-3.5 px-6 rounded-full bg-black hover:bg-neutral-800 text-white font-medium text-sm transition-all duration-200 flex items-center justify-center gap-2 shadow-sm disabled:opacity-75 disabled:cursor-not-allowed"
                >
                  {isVerifying ? (
                    <>
                      <RotateCw className="w-4 h-4 animate-spin" />
                      <span>Verifying with Supabase...</span>
                    </>
                  ) : (
                    <>
                      <span>Verify Email & Continue</span>
                      <ArrowRight className="w-4 h-4" />
                    </>
                  )}
                </button>

              </form>

              {/* Resend & Back Actions */}
              <div className="w-full pt-4 space-y-2">
                <div className="flex flex-wrap items-center justify-center gap-1.5 text-xs text-[#5E5E5E]">
                  <span>Didn't receive the code?</span>
                  <button
                    type="button"
                    onClick={handleResend}
                    disabled={cooldown > 0 || isResending}
                    className="font-semibold text-black hover:underline disabled:opacity-50 disabled:no-underline"
                  >
                    {isResending ? 'Sending...' : 'Resend code'}
                  </button>
                  {cooldown > 0 && (
                    <span className="text-[11px] text-slate-400">({cooldown}s)</span>
                  )}
                </div>

                {resendSuccess && (
                  <p className="text-xs text-emerald-600 font-medium">
                    Fresh verification code dispatched to your inbox!
                  </p>
                )}

                <div className="pt-2">
                  <button
                    type="button"
                    onClick={onBackToSignIn}
                    className="text-xs text-[#747878] hover:text-black transition-colors inline-flex items-center gap-1"
                  >
                    <ArrowLeft className="w-3 h-3" />
                    <span>Return to sign in</span>
                  </button>
                </div>
              </div>

            </div>
          )}

        </div>

        {/* Auxiliary Security Note */}
        <div className="mt-6 flex flex-wrap items-center justify-center text-center gap-2 text-[#747878] text-xs font-normal px-2">
          <ShieldCheck className="w-4 h-4 text-[#747878] flex-shrink-0" />
          <span>Encrypted one-time magic token verification protocol</span>
        </div>

      </main>

      {/* =========================================================================
          FOOTER
         ========================================================================= */}
      <footer className="w-full max-w-[1200px] mx-auto pt-8 pb-4 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-[#747878] text-center">
        <div>
          © 2026 VaaniLearn AI. Editorial multilingual sanctuary.
        </div>
        <nav className="flex flex-wrap items-center justify-center gap-4 sm:gap-6">
          <a href="#terms" className="hover:text-black transition-colors">Terms</a>
          <a href="#privacy" className="hover:text-black transition-colors">Privacy</a>
          <a href="#languages" className="hover:text-black transition-colors">Languages</a>
          <a href="#status" className="hover:text-black transition-colors">Status</a>
        </nav>
      </footer>

    </div>
  );
};
