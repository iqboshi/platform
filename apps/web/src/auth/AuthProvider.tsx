import type { AuthUser, RegisterPayload } from '@platform/types';

import { type ReactNode, useCallback, useEffect, useMemo, useState } from 'react';

import {
  loadCurrentUser,
  login as loginRequest,
  logout as logoutRequest,
  register as registerRequest,
} from '@/lib/api';
import { AuthContext, TOKEN_STORAGE_KEY, type AuthContextValue, type AuthStatus } from './auth-context';

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>('loading');
  const [token, setToken] = useState<string | null>(null);
  const [currentUser, setCurrentUser] = useState<AuthUser | null>(null);

  useEffect(() => {
    const storedToken = window.localStorage.getItem(TOKEN_STORAGE_KEY);
    if (!storedToken) {
      setStatus('guest');
      return;
    }

    setToken(storedToken);
    loadCurrentUser(storedToken)
      .then((user) => {
        setCurrentUser(user);
        setStatus('authenticated');
      })
      .catch(() => {
        window.localStorage.removeItem(TOKEN_STORAGE_KEY);
        setToken(null);
        setCurrentUser(null);
        setStatus('guest');
      });
  }, []);

  const login = useCallback(async (credentials: { email: string; password: string }): Promise<AuthUser> => {
    const response = await loginRequest(credentials);
    window.localStorage.setItem(TOKEN_STORAGE_KEY, response.accessToken);
    setToken(response.accessToken);
    setCurrentUser(response.user);
    setStatus('authenticated');
    return response.user;
  }, []);

  const register = useCallback(async (payload: RegisterPayload): Promise<void> => {
    await registerRequest(payload);
  }, []);

  const logout = useCallback(async (): Promise<void> => {
    if (token) {
      try {
        await logoutRequest(token);
      } catch {
        // Ignore logout API failures for local token clearing.
      }
    }
    window.localStorage.removeItem(TOKEN_STORAGE_KEY);
    setToken(null);
    setCurrentUser(null);
    setStatus('guest');
  }, [token]);

  const refreshCurrentUser = useCallback(async (): Promise<AuthUser | null> => {
    if (!token) {
      setCurrentUser(null);
      setStatus('guest');
      return null;
    }

    try {
      const user = await loadCurrentUser(token);
      setCurrentUser(user);
      setStatus('authenticated');
      return user;
    } catch {
      window.localStorage.removeItem(TOKEN_STORAGE_KEY);
      setToken(null);
      setCurrentUser(null);
      setStatus('guest');
      return null;
    }
  }, [token]);

  const value = useMemo<AuthContextValue>(
    () => ({
      status,
      token,
      currentUser,
      login,
      register,
      logout,
      refreshCurrentUser,
      hasPermission: (permission) => currentUser?.permissions.includes(permission) ?? false,
    }),
    [currentUser, login, logout, refreshCurrentUser, register, status, token],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
