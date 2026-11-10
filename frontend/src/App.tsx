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

  // Handle protected routing & session state changes
  useEffect(() => {
    if (!isLoading) {
      if (session && user) {
        // If authenticated and on auth screens, route to dashboard
        if (currentPage === 'login' || currentPage === 'signup' || currentPage === 'verify') {
          setCurrentPage('dashboard');
        }
      } else {
        // If not authenticated and trying to view dashboard, route to login
        if (currentPage === 'dashboard') {
          setCurrentPage('login');
        }
      }
    }
  }, [session, user, isLoading]);

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
                setCurrentPage('dashboard');
              } else {
                setCurrentPage('login');
              }
            }}
            onGetStartedClick={() => {
              if (session && user) {
                setCurrentPage('dashboard');
              } else {
                setCurrentPage('signup');
              }
            }}
          />
          <LandingPage
            onStartLearningFree={() => {
              if (session && user) {
                setCurrentPage('dashboard');
              } else {
                setCurrentPage('signup');
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
          onNavigateLogin={() => setCurrentPage('login')}
          onNavigateHome={() => setCurrentPage('landing')}
          onSignUpSuccess={(registeredEmail) => {
            setUserEmail(registeredEmail || 'newstudent@vaanilearn.ai');
            setCurrentPage('verify');
          }}
        />
      )}

      {/* 3. LOGIN PAGE */}
      {currentPage === 'login' && (
        <LoginPage
          onNavigateSignUp={() => setCurrentPage('signup')}
          onNavigateHome={() => setCurrentPage('landing')}
          onLoginSuccess={(signedInEmail) => {
            setUserEmail(signedInEmail || 'student@vaanilearn.ai');
            setCurrentPage('dashboard');
          }}
          onUnconfirmedEmail={(unconfirmedEmail) => {
            setUserEmail(unconfirmedEmail);
            setCurrentPage('verify');
          }}
        />
      )}

      {/* 4. EMAIL VERIFICATION WITH OTP */}
      {currentPage === 'verify' && (
        <EmailVerificationPage
          email={userEmail}
          demoOtp="123456"
          onVerificationSuccess={() => {
            setCurrentPage('dashboard');
          }}
          onBackToSignIn={() => setCurrentPage('login')}
          onChangeEmail={() => setCurrentPage('signup')}
        />
      )}

      {/* 5. PROTECTED PERSONAL DASHBOARD */}
      {currentPage === 'dashboard' && (
        <InteractiveAppDashboard
          currentUserEmail={userEmail}
          onBackToLanding={() => setCurrentPage('landing')}
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
