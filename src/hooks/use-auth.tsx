'use client';
import React, { createContext, useContext, useState, ReactNode, useCallback, useEffect, useRef } from 'react';
import { useToast } from '@/hooks/use-toast';
import type { User } from '@/lib/types';
import { useSupabase } from '@/supabase';
import type { User as SupabaseUser } from '@supabase/supabase-js';

interface AuthContextType {
  isAuthenticated: boolean;
  user: User | null;
  loading: boolean;
  loginWithEmail: (email: string, password: string) => Promise<boolean>;
  signupWithEmail: (email: string, password: string) => Promise<boolean>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

/** Build a minimal User from Supabase auth data (no DB call, never blocks). */
function userFromAuth(supabaseUser: SupabaseUser): User {
  return {
    id: supabaseUser.id,
    name: supabaseUser.email?.split('@')[0] || 'Anonymous',
    email: supabaseUser.email,
    photoURL: null,
    role: 'employee',
  };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();
  const supabase = useSupabase();

  // Enrich user profile from the DB (non-blocking, fire-and-forget).
  // Called after the user is already set so auth is not blocked.
  const enrichUserProfile = useCallback(async (supabaseUser: SupabaseUser) => {
    try {
      const { data: existingUser, error: selectError } = await supabase
        .from('users')
        .select('*')
        .eq('id', supabaseUser.id)
        .single();

      if (selectError && selectError.code !== 'PGRST116') {
        console.error('[enrichUserProfile] select error:', selectError);
      }

      if (existingUser) {
        setUser({
          id: existingUser.id,
          name: existingUser.name || supabaseUser.email?.split('@')[0] || 'Anonymous',
          email: existingUser.email || supabaseUser.email,
          photoURL: existingUser.photo_url,
          role: existingUser.role === 'admin' ? 'admin' : 'employee',
        });
      } else {
        // New user — insert into users table
        const appUser: User = userFromAuth(supabaseUser);
        const { error: insertError } = await supabase
          .from('users')
          .insert({
            id: supabaseUser.id,
            name: appUser.name,
            email: appUser.email,
            photo_url: appUser.photoURL,
            role: appUser.role,
          });

        if (insertError) {
          console.error('[enrichUserProfile] insert error:', insertError);
        }
        // User object stays as the auth-derived one (already set)
      }
    } catch (err) {
      console.error('[enrichUserProfile] unexpected error:', err);
      // User object stays as the auth-derived one (already set)
    }
  }, [supabase]);

  useEffect(() => {
    let mounted = true;
    let initialResolved = false;
    let nullSessionTimer: ReturnType<typeof setTimeout> | null = null;

    // Hard safety net: force loading off after 8s no matter what
    const hardTimeout = setTimeout(() => {
      if (mounted && !initialResolved) {
        console.warn('[auth] 8s hard timeout — forcing loading off');
        initialResolved = true;
        setLoading(false);
      }
    }, 8000);

    const resolveInitial = (appUser: User | null) => {
      if (!mounted || initialResolved) return;
      initialResolved = true;
      if (nullSessionTimer) { clearTimeout(nullSessionTimer); nullSessionTimer = null; }
      clearTimeout(hardTimeout);
      setUser(appUser);
      setLoading(false);
    };

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        if (!mounted) return;

        // Cancel any pending null-session timer when a session arrives
        if (nullSessionTimer && session?.user) {
          clearTimeout(nullSessionTimer);
          nullSessionTimer = null;
        }

        if (session?.user) {
          // Set user immediately from auth data (never blocks / deadlocks)
          const authUser = userFromAuth(session.user);
          if (!initialResolved) {
            resolveInitial(authUser);
          } else {
            setUser(prev => prev ?? authUser);
            setLoading(false);
          }
          // Enrich with DB profile data in the background (non-blocking)
          enrichUserProfile(session.user);
        } else if (event === 'INITIAL_SESSION') {
          // null INITIAL_SESSION: token may be expired, Supabase is mid-refresh.
          // SIGNED_IN / TOKEN_REFRESHED will follow shortly.
          nullSessionTimer = setTimeout(() => {
            if (mounted && !initialResolved) resolveInitial(null);
          }, 3000);
        } else if (event === 'SIGNED_OUT') {
          if (!initialResolved) {
            resolveInitial(null);
          } else {
            setUser(null);
          }
        }
      }
    );

    return () => {
      mounted = false;
      clearTimeout(hardTimeout);
      if (nullSessionTimer) clearTimeout(nullSessionTimer);
      subscription.unsubscribe();
    };
  }, [supabase, enrichUserProfile]);

  const isAuthenticated = !!user;

  const loginWithEmail = useCallback(async (email: string, password: string): Promise<boolean> => {
    setLoading(true);
    try {
      // Race signInWithPassword against a 10s timeout.
      // Prevents infinite "Processing..." if the auth lock is held by a background refresh.
      const loginResult = await Promise.race([
        supabase.auth.signInWithPassword({ email, password }),
        new Promise<{ error: Error }>(resolve =>
          setTimeout(() => resolve({ error: new Error('LOGIN_TIMEOUT') }), 10000)
        ),
      ]);

      if (loginResult.error) {
        if ((loginResult.error as any).message === 'LOGIN_TIMEOUT') {
          throw new Error('登入超時，請重新整理頁面後再試。');
        }
        throw loginResult.error;
      }

      toast({ title: '登入成功' });
      return true;
    } catch (error: any) {
      console.error("Email sign-in failed", error);
      let description = '發生未知錯誤，請稍後再試。';
      if (error.message?.includes('Invalid login credentials')) {
        description = '電子郵件或密碼不正確。';
      } else if (error.message?.includes('登入超時')) {
        description = error.message;
      }
      toast({ variant: 'destructive', title: '登入失敗', description });
      setLoading(false);
      return false;
    }
  }, [supabase, toast]);

  const signupWithEmail = useCallback(async (email: string, password: string): Promise<boolean> => {
    setLoading(true);
    try {
      const { error } = await supabase.auth.signUp({ email, password });
      if (error) throw error;
      toast({ title: '註冊成功', description: '歡迎加入！' });
      setLoading(false);
      return true;
    } catch (error: any) {
      console.error("Email sign-up failed", error);
      let description = '發生未知錯誤，請稍後再試。';
      if (error.message?.includes('already registered')) {
        description = '這個電子郵件地址已經被註冊了。';
      } else if (error.message?.includes('Password should be')) {
        description = '密碼強度不足，請使用更長的密碼。';
      } else if (error.message?.includes('valid email')) {
        description = '請輸入有效的電子郵件地址。';
      }
      toast({ variant: 'destructive', title: '註冊失敗', description });
      setLoading(false);
      return false;
    }
  }, [supabase, toast]);

  const logout = useCallback(async () => {
    setLoading(true);
    try {
      await supabase.auth.signOut();
      setUser(null);
      toast({ title: '已登出', description: '您已成功登出。' });
    } catch (error) {
      console.error("Sign out failed", error);
      toast({ variant: 'destructive', title: '登出失敗', description: '登出時發生錯誤。' });
    } finally {
      setLoading(false);
    }
  }, [supabase, toast]);

  return (
    <AuthContext.Provider value={{ isAuthenticated, user, loading, loginWithEmail, signupWithEmail, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
