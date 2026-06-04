import type { AuthUser, RegisterPayload } from '@platform/types';

import { type ReactNode, useCallback, useEffect, useMemo, useState } from 'react';

import { isPortfolioDemo } from '@/config/env';
import {
  loadCurrentUser,
  login as loginRequest,
  logout as logoutRequest,
  register as registerRequest,
} from '@/lib/api';
import { portfolioDemoUser } from '@/mocks/platform';
import { AuthContext, TOKEN_STORAGE_KEY, type AuthContextValue, type AuthStatus } from './auth-context';

const DEMO_TOKEN = 'portfolio-demo-token';

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>(isPortfolioDemo ? 'authenticated' : 'loading');
  const [token, setToken] = useState<string | null>(isPortfolioDemo ? DEMO_TOKEN : null);
  const [currentUser, setCurrentUser] = useState<AuthUser | null>(
    isPortfolioDemo ? portfolioDemoUser : null,
  );

  useEffect(() => {
    if (isPortfolioDemo) {
      window.localStorage.setItem(TOKEN_STORAGE_KEY, DEMO_TOKEN);
      return;
    }

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
    if (isPortfolioDemo) {
      window.localStorage.setItem(TOKEN_STORAGE_KEY, DEMO_TOKEN);
      setToken(DEMO_TOKEN);
      setCurrentUser(portfolioDemoUser);
      setStatus('authenticated');
      return portfolioDemoUser;
    }

    const response = await loginRequest(credentials);
    window.localStorage.setItem(TOKEN_STORAGE_KEY, response.accessToken);
    setToken(response.accessToken);
    setCurrentUser(response.user);
    setStatus('authenticated');
    return response.user;
  }, []);

  const register = useCallback(async (payload: RegisterPayload): Promise<void> => {
    if (isPortfolioDemo) {
      return;
    }

    await registerRequest(payload);
  }, []);

  const logout = useCallback(async (): Promise<void> => {
    if (isPortfolioDemo) {
      window.localStorage.setItem(TOKEN_STORAGE_KEY, DEMO_TOKEN);
      setToken(DEMO_TOKEN);
      setCurrentUser(portfolioDemoUser);
      setStatus('authenticated');
      return;
    }

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
    if (isPortfolioDemo) {
      setToken(DEMO_TOKEN);
      setCurrentUser(portfolioDemoUser);
      setStatus('authenticated');
      return portfolioDemoUser;
    }

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
