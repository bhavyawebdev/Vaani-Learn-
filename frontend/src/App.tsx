import React, { useState, useEffect } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { Navbar } from './components/Navbar';
import { LandingPage } from './components/LandingPage';
import { LoginPage } from './components/LoginPage';
import { SignUpPage } from './components/SignUpPage';
import { EmailVerificationPage } from './components/EmailVerificationPage';
import { InteractiveAppDashboard } from './components/InteractiveAppDashboard';
import { Logo } from './components/Logo';

function AppContent() {
  const { user, session, isLoading } = useAuth();
  const [currentPage, setCurrentPage] = useState<'landing' | 'signup' | 'login' | 'verify' | 'dashboard'>('landing');
  const [userEmail, setUserEmail] = useState<string>('aadhya.sharma@domain.edu');
  const [oauthError, setOauthError] = useState<string | null>(null);

  const navigateTo = (page: 'landing' | 'signup' | 'login' | 'verify' | 'dashboard') => {
    if (page === 'dashboard') {
      sessionStorage.setItem('vaanilearn_active_view', 'dashboard');
    } else if (page === 'landing') {
      sessionStorage.setItem('vaanilearn_active_view', 'landing');
    }
    setCurrentPage(page);
  };

  // Detect any OAuth errors returned in URL query/hash
  useEffect(() => {
    const searchParams = new URLSearchParams(window.location.search);
    const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ''));
    const errDesc =
      searchParams.get('error_description') ||
      hashParams.get('error_description') ||
      searchParams.get('error') ||
      hashParams.get('error');

    if (errDesc) {
      sessionStorage.removeItem('vaanilearn_oauth_redirect');
      setOauthError(errDesc);
      window.history.replaceState({}, document.title, window.location.pathname);
      setCurrentPage('login');
    }
  }, []);

  // Handle protected routing & session state changes (including Google OAuth redirects & refreshes)
  useEffect(() => {
    if (!isLoading) {
      if (session && user) {
        const isOAuthReturn =
          sessionStorage.getItem('vaanilearn_oauth_redirect') === '1' ||
          window.location.hash.includes('access_token=') ||
          window.location.search.includes('code=');
        const shouldRestoreDashboard =
          sessionStorage.getItem('vaanilearn_active_view') === 'dashboard';

        if (isOAuthReturn) {
          sessionStorage.removeItem('vaanilearn_oauth_redirect');
          if (window.location.hash || window.location.search) {
            window.history.replaceState({}, document.title, window.location.pathname);
          }
          navigateTo('dashboard');
          return;
        }

        if (
          currentPage === 'login' ||
          currentPage === 'signup' ||
          currentPage === 'verify' ||
          (currentPage === 'landing' && shouldRestoreDashboard)
        ) {
          navigateTo('dashboard');
        }
      } else {
        sessionStorage.removeItem('vaanilearn_active_view');
        if (currentPage === 'dashboard') {
          setCurrentPage('login');
        }
      }
    }
  }, [session, user, isLoading, currentPage]);

  // Loading state while restoring session from localStorage / Supabase
  if (isLoading) {
    return (
      <div className="min-h-screen bg-white flex flex-col items-center justify-center p-6 text-center">
        <Logo size="lg" />
        <div className="mt-6 flex items-center gap-2 text-xs text-slate-500 font-medium">
          <span className="w-2 h-2 rounded-full bg-black animate-ping" />
          <span>Restoring secure session...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white text-slate-900 font-sans antialiased">
      
      {/* 1. LANDING PAGE */}
      {currentPage === 'landing' && (
        <>
          <Navbar
            onLoginClick={() => {
              if (session && user) {
                navigateTo('dashboard');
              } else {
                navigateTo('login');
              }
            }}
            onGetStartedClick={() => {
              if (session && user) {
                navigateTo('dashboard');
              } else {
                navigateTo('signup');
              }
            }}
          />
          <LandingPage
            onStartLearningFree={() => {
              if (session && user) {
                navigateTo('dashboard');
              } else {
                navigateTo('signup');
              }
            }}
            onExploreExperience={() => {
              window.scrollTo({ top: 120, behavior: 'smooth' });
            }}
          />
        </>
      )}

      {/* 2. SIGN UP PAGE */}
      {currentPage === 'signup' && (
        <SignUpPage
          onNavigateLogin={() => navigateTo('login')}
          onNavigateHome={() => navigateTo('landing')}
          onSignUpSuccess={(registeredEmail) => {
            setUserEmail(registeredEmail || 'newstudent@vaanilearn.ai');
            navigateTo('verify');
          }}
        />
      )}

      {/* 3. LOGIN PAGE */}
      {currentPage === 'login' && (
        <LoginPage
          initialError={oauthError}
          onNavigateSignUp={() => {
            setOauthError(null);
            navigateTo('signup');
          }}
          onNavigateHome={() => {
            setOauthError(null);
            navigateTo('landing');
          }}
          onLoginSuccess={(signedInEmail) => {
            setOauthError(null);
            setUserEmail(signedInEmail || 'student@vaanilearn.ai');
            navigateTo('dashboard');
          }}
          onUnconfirmedEmail={(unconfirmedEmail) => {
            setUserEmail(unconfirmedEmail);
            navigateTo('verify');
          }}
        />
      )}

      {/* 4. EMAIL VERIFICATION WITH OTP */}
      {currentPage === 'verify' && (
        <EmailVerificationPage
          email={userEmail}
          demoOtp="123456"
          onVerificationSuccess={() => {
            navigateTo('dashboard');
          }}
          onBackToSignIn={() => navigateTo('login')}
          onChangeEmail={() => navigateTo('signup')}
        />
      )}

      {/* 5. PROTECTED PERSONAL DASHBOARD */}
      {currentPage === 'dashboard' && (
        <InteractiveAppDashboard
          currentUserEmail={userEmail}
          onBackToLanding={() => navigateTo('landing')}
        />
      )}

    </div>
  );
}

export function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
}

export default App;
