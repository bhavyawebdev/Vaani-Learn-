import { User, Session, AuthError } from '@supabase/supabase-js';

export interface UserProfile {
  id: string;
  full_name: string;
  email: string;
  avatar_url: string | null;
  created_at: string;
  updated_at: string;
}

export interface SignUpPayload {
  fullName: string;
  email: string;
  password: string;
}

export interface AuthState {
  user: User | null;
  profile: UserProfile | null;
  session: Session | null;
  isLoading: boolean;
  isConfigured: boolean;
}

export interface AuthContextType extends AuthState {
  signUp: (payload: SignUpPayload) => Promise<{ error: AuthError | Error | null; email?: string }>;
  signIn: (email: string, password: string) => Promise<{ error: AuthError | Error | null; isUnconfirmed?: boolean }>;
  signInWithGoogle: () => Promise<{ error: AuthError | Error | null }>;
  verifyOtp: (email: string, token: string) => Promise<{ error: AuthError | Error | null }>;
  resendOtp: (email: string) => Promise<{ error: AuthError | Error | null }>;
  signOut: () => Promise<void>;
  resetPasswordForEmail: (email: string) => Promise<{ error: AuthError | Error | null }>;
  updatePassword: (newPassword: string) => Promise<{ error: AuthError | Error | null }>;
  updateProfile: (updates: Partial<Pick<UserProfile, 'full_name' | 'avatar_url'>>) => Promise<{ error: Error | null; profile?: UserProfile }>;
  refreshProfile: () => Promise<void>;
}

