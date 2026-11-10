import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { User, Session, AuthError } from '@supabase/supabase-js';
import { supabase, isSupabaseConfigured } from '../lib/supabase';
import { UserProfile, SignUpPayload, AuthContextType } from '../types/auth';

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  // Fetch user profile from public.profiles
  const fetchProfile = useCallback(async (userId: string, userEmail?: string, metadataName?: string) => {
    if (!isSupabaseConfigured) {
      // Fallback local profile for preview
      setProfile({
        id: userId,
        full_name: metadataName || 'Student',
        email: userEmail || 'student@vaanilearn.ai',
        avatar_url: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });
      return;
    }

    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .maybeSingle();

      if (error && error.code !== 'PGRST116') {
        console.error('[VaaniLearn Auth] Error fetching profile:', error.message);
      }

      if (data) {
        setProfile(data as UserProfile);
      } else {
        // Fallback to auth metadata if trigger is still processing
        setProfile({
          id: userId,
          full_name: metadataName || userEmail?.split('@')[0] || 'Student',
          email: userEmail || '',
          avatar_url: null,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        });
      }
    } catch (err) {
      console.error('[VaaniLearn Auth] Profile fetch exception:', err);
    }
  }, []);

  // Initialize session and listen for auth state changes
  useEffect(() => {
    let isMounted = true;

    async function initAuth() {
      try {
        if (!isSupabaseConfigured) {
          setIsLoading(false);
          return;
        }

        const { data: { session: initialSession }, error } = await supabase.auth.getSession();
        if (error) {
          console.error('[VaaniLearn Auth] Session fetch error:', error.message);
        }

        if (isMounted) {
          setSession(initialSession);
          setUser(initialSession?.user ?? null);
          if (initialSession?.user) {
            await fetchProfile(
              initialSession.user.id,
              initialSession.user.email,
              initialSession.user.user_metadata?.full_name || initialSession.user.user_metadata?.name
            );
          }
          setIsLoading(false);
        }
      } catch (err) {
        console.error('[VaaniLearn Auth] Init auth error:', err);
        if (isMounted) setIsLoading(false);
      }
    }

    initAuth();

    // Setup listener for token refresh, login, logout, etc.
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event, newSession) => {
      if (!isMounted) return;

      setSession(newSession);
      setUser(newSession?.user ?? null);

      if (newSession?.user) {
        await fetchProfile(
          newSession.user.id,
          newSession.user.email,
          newSession.user.user_metadata?.full_name || newSession.user.user_metadata?.name
        );
      } else {
        setProfile(null);
      }
      setIsLoading(false);
    });

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, [fetchProfile]);

  // Sign up with Supabase Auth
  const signUp = async ({ fullName, email, password }: SignUpPayload) => {
    if (!isSupabaseConfigured) {
      // Demo simulated signup if keys not yet supplied
      return { error: null, email };
    }

    try {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            full_name: fullName,
          },
        },
      });

      if (error) {
        return { error };
      }

      return { error: null, email: data.user?.email || email };
    } catch (err: any) {
      return { error: err };
    }
  };

  // Sign in with email and password
  const signIn = async (email: string, password: string) => {
    if (!isSupabaseConfigured) {
      // Demo fallback
      return { error: null, isUnconfirmed: false };
    }

    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        const isUnconfirmed = error.message.toLowerCase().includes('email not confirmed');
        return { error, isUnconfirmed };
      }

      setSession(data.session);
      setUser(data.user);
      if (data.user) {
        await fetchProfile(
          data.user.id,
          data.user.email,
          data.user.user_metadata?.full_name
        );
      }

      return { error: null, isUnconfirmed: false };
    } catch (err: any) {
      return { error: err, isUnconfirmed: false };
    }
  };

  // Sign in / Sign up with Google OAuth via Supabase
  const signInWithGoogle = async () => {
    if (!isSupabaseConfigured) {
      return {
        error: new Error(
          'Supabase credentials are not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in frontend/.env.'
        ),
      };
    }

    try {
      sessionStorage.setItem('vaanilearn_oauth_redirect', '1');
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: window.location.origin,
          queryParams: {
            access_type: 'offline',
            prompt: 'select_account',
          },
        },
      });

      if (error) {
        sessionStorage.removeItem('vaanilearn_oauth_redirect');
        return { error };
      }

      return { error: null };
    } catch (err: any) {
      sessionStorage.removeItem('vaanilearn_oauth_redirect');
      return { error: err };
    }
  };

  // Verify OTP token for signup
  const verifyOtp = async (email: string, token: string) => {
    if (!isSupabaseConfigured) {
      // Demo mode verification: accept demo OTP 123456
      if (token === '123456') {
        return { error: null };
      }
      return { error: new Error('Invalid demo verification code. Use 123456.') };
    }

    try {
      const { data, error } = await supabase.auth.verifyOtp({
        email,
        token,
        type: 'signup',
      });

      if (error) {
        return { error };
      }

      if (data.user) {
        setUser(data.user);
        setSession(data.session);
        await fetchProfile(
          data.user.id,
          data.user.email,
          data.user.user_metadata?.full_name
        );
      }

      return { error: null };
    } catch (err: any) {
      return { error: err };
    }
  };

  // Resend OTP verification code
  const resendOtp = async (email: string) => {
    if (!isSupabaseConfigured) {
      return { error: null };
    }

    try {
      const { error } = await supabase.auth.resend({
        type: 'signup',
        email,
      });

      return { error };
    } catch (err: any) {
      return { error: err };
    }
  };

  // Sign out
  const signOut = async () => {
    sessionStorage.removeItem('vaanilearn_active_view');
    sessionStorage.removeItem('vaanilearn_oauth_redirect');
    if (isSupabaseConfigured) {
      await supabase.auth.signOut();
    }
    setUser(null);
    setSession(null);
    setProfile(null);
  };

  // Password Recovery: Request Reset Email
  const resetPasswordForEmail = async (email: string) => {
    if (!isSupabaseConfigured) {
      return { error: null };
    }

    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/reset-password`,
      });
      return { error };
    } catch (err: any) {
      return { error: err };
    }
  };

  // Update Password
  const updatePassword = async (newPassword: string) => {
    if (!isSupabaseConfigured) {
      return { error: null };
    }

    try {
      const { error } = await supabase.auth.updateUser({
        password: newPassword,
      });
      return { error };
    } catch (err: any) {
      return { error: err };
    }
  };

  // Update user profile in public.profiles
  const updateProfile = async (updates: Partial<Pick<UserProfile, 'full_name' | 'avatar_url'>>) => {
    if (!user) {
      return { error: new Error('User is not authenticated.') };
    }

    if (!isSupabaseConfigured) {
      setProfile((prev) => prev ? { ...prev, ...updates, updated_at: new Date().toISOString() } : null);
      return { error: null };
    }

    try {
      const { data, error } = await supabase
        .from('profiles')
        .update({
          ...updates,
          updated_at: new Date().toISOString(),
        })
        .eq('id', user.id)
        .select()
        .single();

      if (error) {
        return { error };
      }

      setProfile(data as UserProfile);
      return { error: null, profile: data as UserProfile };
    } catch (err: any) {
      return { error: err };
    }
  };

  const refreshProfile = async () => {
    if (user) {
      await fetchProfile(user.id, user.email, user.user_metadata?.full_name);
    }
  };

  const value: AuthContextType = {
    user,
    profile,
    session,
    isLoading,
    isConfigured: isSupabaseConfigured,
    signUp,
    signIn,
    signInWithGoogle,
    verifyOtp,
    resendOtp,
    signOut,
    resetPasswordForEmail,
    updatePassword,
    updateProfile,
    refreshProfile,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

