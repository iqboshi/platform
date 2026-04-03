import type { AuthUser, PermissionKey, RegisterPayload } from '@platform/types';

import { createContext } from 'react';

export const TOKEN_STORAGE_KEY = 'platform.auth.token';

export type AuthStatus = 'loading' | 'authenticated' | 'guest';

export interface AuthContextValue {
  status: AuthStatus;
  token: string | null;
  currentUser: AuthUser | null;
  login: (credentials: { email: string; password: string }) => Promise<AuthUser>;
  register: (payload: RegisterPayload) => Promise<void>;
  logout: () => Promise<void>;
  refreshCurrentUser: () => Promise<AuthUser | null>;
  hasPermission: (permission: PermissionKey) => boolean;
}

export const AuthContext = createContext<AuthContextValue | null>(null);
