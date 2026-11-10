import React, { useState } from 'react';
import { X, Mail, CheckCircle2, AlertCircle, ArrowRight } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

interface ForgotPasswordModalProps {
  isOpen: boolean;
  onClose: () => void;
  defaultEmail?: string;
}

export const ForgotPasswordModal: React.FC<ForgotPasswordModalProps> = ({
  isOpen,
  onClose,
  defaultEmail = '',
}) => {
  const { resetPasswordForEmail } = useAuth();
  const [email, setEmail] = useState(defaultEmail);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isSuccess, setIsSuccess] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !email.includes('@')) {
      setErrorMsg('Please enter a valid email address.');
      return;
    }

    setIsLoading(true);
    setErrorMsg(null);

    const { error } = await resetPasswordForEmail(email.trim().toLowerCase());
    setIsLoading(false);

    if (error) {
      setErrorMsg(error.message || 'Failed to send password recovery link.');
    } else {
      setIsSuccess(true);
    }
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="relative w-full max-w-[420px] bg-white rounded-[24px] sm:rounded-[28px] border border-slate-200/90 shadow-2xl p-5 sm:p-8 space-y-4 animate-in fade-in duration-150">
        
        {/* Close Button */}
        <button
          type="button"
          onClick={onClose}
          className="absolute top-5 right-5 text-slate-400 hover:text-black transition"
        >
          <X className="w-5 h-5" />
        </button>

        {isSuccess ? (
          <div className="text-center space-y-3 py-2">
            <div className="w-12 h-12 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center mx-auto">
              <CheckCircle2 className="w-6 h-6 stroke-[2]" />
            </div>
            <h3 className="text-xl font-bold text-slate-900">Recovery Email Dispatched</h3>
            <p className="text-xs text-slate-600 leading-relaxed">
              If an account exists for <span className="font-semibold text-black">{email}</span>, you will receive password reset instructions via Brevo SMTP shortly.
            </p>
            <button
              type="button"
              onClick={onClose}
              className="w-full mt-3 py-3 rounded-full bg-black hover:bg-neutral-800 text-white text-xs font-semibold transition"
            >
              Done
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="text-left space-y-1">
              <div className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center mb-3">
                <Mail className="w-5 h-5 text-slate-800" />
              </div>
              <h3 className="text-xl font-bold text-slate-900">Reset your password</h3>
              <p className="text-xs text-slate-500">
                Enter your registered email address to receive a secure recovery link.
              </p>
            </div>

            {errorMsg && (
              <div className="p-2.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-center gap-1.5">
                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                <span>{errorMsg}</span>
              </div>
            )}

            <div className="space-y-1 text-left">
              <label className="block text-xs font-medium text-slate-700">
                Email address
              </label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  setErrorMsg(null);
                }}
                placeholder="name@example.com"
                className="w-full px-4 py-3 rounded-xl bg-[#F4F5F7] border border-transparent focus:border-slate-300 focus:bg-white text-sm text-slate-900 placeholder-slate-400 outline-none transition"
              />
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="w-full py-3.5 px-4 rounded-full bg-black hover:bg-neutral-800 text-white font-medium text-sm flex items-center justify-center gap-2 shadow-sm transition disabled:opacity-75"
            >
              <span>{isLoading ? 'Sending recovery link...' : 'Send Recovery Link'}</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </form>
        )}

      </div>
    </div>
  );
};

