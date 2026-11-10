import React, { useState } from 'react';
import { 
  Eye, 
  EyeOff, 
  ArrowRight, 
  Lock,
  AlertCircle
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { ForgotPasswordModal } from './ForgotPasswordModal';

interface LoginPageProps {
  onNavigateSignUp: () => void;
  onNavigateHome: () => void;
  onLoginSuccess: (email: string) => void;
  onUnconfirmedEmail?: (email: string) => void;
}

export const LoginPage: React.FC<LoginPageProps> = ({
  onNavigateSignUp,
  onNavigateHome,
  onLoginSuccess,
  onUnconfirmedEmail
}) => {
  const { signIn } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isForgotModalOpen, setIsForgotModalOpen] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    if (!email.trim() || !password) {
      setErrorMessage('Please provide both email and password.');
      return;
    }

    setIsLoading(true);

    try {
      const { error, isUnconfirmed } = await signIn(email.trim().toLowerCase(), password);

      if (error) {
        if (isUnconfirmed) {
          // If the user hasn't verified their OTP yet, navigate to verification screen
          setIsLoading(false);
          if (onUnconfirmedEmail) {
            onUnconfirmedEmail(email.trim().toLowerCase());
          } else {
            setErrorMessage('Your email is not verified yet. Please verify your OTP to proceed.');
          }
          return;
        }

        setErrorMessage(
          error.message === 'Invalid login credentials'
            ? 'Incorrect email or password. Please try again.'
            : error.message || 'Failed to sign in. Please check your credentials.'
        );
        setIsLoading(false);
        return;
      }

      setIsLoading(false);
      onLoginSuccess(email.trim());
    } catch (err: any) {
      setErrorMessage(err.message || 'An unexpected error occurred during login.');
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#F8F9FA] flex flex-col justify-between px-4 py-8 sm:px-6 lg:px-8 font-sans selection:bg-black selection:text-white">
      
      {/* Top Bar / Back to Home */}
      <div className="w-full max-w-5xl mx-auto flex justify-between items-center">
        <button 
          onClick={onNavigateHome}
          className="text-xs text-slate-500 hover:text-black font-medium transition flex items-center gap-1"
        >
          <span>← Back to VaaniLearn Home</span>
        </button>
      </div>

      {/* Main Form Centerpiece */}
      <div className="w-full max-w-[440px] mx-auto my-auto space-y-6 pt-4 pb-8">
        
        {/* Header Branding */}
        <div className="flex flex-col items-center text-center space-y-3">
          
          {/* Logo in Black Circle */}
          <div onClick={onNavigateHome} className="cursor-pointer flex items-center gap-2">
            <div className="w-10 h-10 rounded-full bg-black flex items-center justify-center shadow-md">
              <svg viewBox="0 0 24 24" className="w-5 h-5 text-white fill-current">
                <rect x="3" y="9" width="2" height="6" rx="1" />
                <rect x="7" y="6" width="2" height="12" rx="1" />
                <rect x="11" y="3" width="2" height="18" rx="1" />
                <rect x="15" y="7" width="2" height="10" rx="1" />
                <rect x="19" y="10" width="2" height="4" rx="1" />
              </svg>
            </div>
            <div className="text-left leading-none">
              <p className="text-sm font-bold text-slate-900 tracking-tight">VaaniLearn</p>
              <p className="text-[9px] text-slate-400 font-semibold tracking-wider">AI EDUCATION</p>
            </div>
          </div>

          {/* Title & Subtitle */}
          <div>
            <h1 className="text-3xl font-extrabold tracking-tight text-slate-900">
              Welcome back.
            </h1>
            <p className="text-sm text-slate-500 mt-1">
              Continue your learning journey with VaaniLearn.
            </p>
          </div>

        </div>

        {/* Floating White Card */}
        <div className="bg-white rounded-[24px] sm:rounded-[28px] border border-slate-200/80 shadow-[0_10px_35px_rgba(0,0,0,0.04)] p-5 sm:p-8 space-y-5">
          
          {/* Error Banner */}
          {errorMessage && (
            <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-center gap-2 animate-in fade-in duration-150">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              <span>{errorMessage}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            
            {/* Email Field */}
            <div className="space-y-1.5">
              <label className="block text-xs font-medium text-slate-700">
                Email address
              </label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  setErrorMessage(null);
                }}
                placeholder="name@example.com"
                className="w-full px-4 py-3 rounded-xl bg-[#F4F5F7] border border-transparent focus:border-slate-300 focus:bg-white text-sm text-slate-900 placeholder-slate-400 outline-none transition"
              />
            </div>

            {/* Password Field */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="block text-xs font-medium text-slate-700">
                  Password
                </label>
                <button 
                  type="button"
                  onClick={() => setIsForgotModalOpen(true)}
                  className="text-xs text-slate-500 hover:text-black font-medium transition"
                >
                  Forgot password?
                </button>
              </div>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  required
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value);
                    setErrorMessage(null);
                  }}
                  placeholder="••••••••"
                  className="w-full px-4 py-3 rounded-xl bg-[#F4F5F7] border border-transparent focus:border-slate-300 focus:bg-white text-sm text-slate-900 placeholder-slate-400 outline-none transition pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {/* Remember Me & Secure Session */}
            <div className="flex items-center justify-between pt-1">
              <label className="flex items-center gap-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={rememberMe}
                  onChange={(e) => setRememberMe(e.target.checked)}
                  className="w-4 h-4 rounded border-slate-300 text-black focus:ring-0 accent-black cursor-pointer"
                />
                <span className="text-xs text-slate-600">Remember me</span>
              </label>

              <div className="flex items-center gap-1 text-xs text-slate-400 font-medium">
                <Lock className="w-3 h-3 text-slate-400" />
                <span>Secure session</span>
              </div>
            </div>

            {/* Sign in Button */}
            <button
              type="submit"
              disabled={isLoading}
              className="w-full py-3.5 px-4 rounded-full bg-black hover:bg-neutral-800 text-white font-medium text-sm flex items-center justify-center gap-2 shadow-sm transition duration-200 mt-2 disabled:opacity-75 disabled:cursor-not-allowed"
            >
              <span>{isLoading ? 'Signing in with Supabase...' : 'Sign in'}</span>
              <ArrowRight className="w-4 h-4" />
            </button>

          </form>

          {/* OR Divider */}
          <div className="relative flex items-center justify-center my-4">
            <div className="border-t border-slate-200 w-full"></div>
            <span className="bg-white px-3 text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
              OR
            </span>
          </div>

          {/* Continue with Google */}
          <button
            type="button"
            onClick={() => onLoginSuccess('google.user@vaanilearn.ai')}
            className="w-full py-3 px-4 rounded-full bg-[#F4F5F7] hover:bg-[#EAECEF] text-slate-700 font-medium text-sm flex items-center justify-center gap-2.5 transition duration-150"
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24">
              <path
                fill="#4285F4"
                d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
              />
              <path
                fill="#34A853"
                d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
              />
              <path
                fill="#FBBC05"
                d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
              />
              <path
                fill="#EA4335"
                d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
              />
            </svg>
            <span>Continue with Google</span>
          </button>

          {/* Language modes status bar */}
          <div className="pt-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
            <span className="text-[11px] text-slate-400">Supported: English, हिंदी, ગુજરાતી</span>
          </div>

        </div>

        {/* Link to Sign Up */}
        <p className="text-center text-xs text-slate-500">
          Don't have an account?{' '}
          <button
            type="button"
            onClick={onNavigateSignUp}
            className="font-semibold text-slate-900 underline hover:text-black transition"
          >
            Sign up
          </button>
        </p>

      </div>

      {/* Forgot Password Modal */}
      <ForgotPasswordModal
        isOpen={isForgotModalOpen}
        onClose={() => setIsForgotModalOpen(false)}
        defaultEmail={email}
      />

      {/* Footer */}
      <div className="w-full max-w-5xl mx-auto pt-6 border-t border-slate-200/60 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-slate-400">
        <p>© 2026 VaaniLearn AI. Editorial multilingual sanctuary.</p>
        <div className="flex items-center space-x-6">
          <a href="#terms" className="hover:text-slate-700 transition">Terms</a>
          <a href="#privacy" className="hover:text-slate-700 transition">Privacy</a>
          <a href="#languages" className="hover:text-slate-700 transition">Languages</a>
          <a href="#status" className="hover:text-slate-700 transition">Status</a>
        </div>
      </div>

    </div>
  );
};
