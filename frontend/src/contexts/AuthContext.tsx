import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, setAuthToken, clearAuthToken } from '@/services/api';

interface User {
  id: number;
  email: string;
  displayName: string;
  role: 'super_admin' | 'admin' | 'director' | 'manager' | 'supervisor' | 'agent' | 'externe' | 'stagiaire';
  tenantId: number;
  enterpriseId?: number;
  directionId?: number;
  serviceId?: number;
  avatarUrl?: string;
}

interface AuthContextType {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (data: RegisterData) => Promise<void>;
  loginWithLdap: (username: string, password: string) => Promise<void>;
  completeSSOLogin: (provider: 'google' | 'azure', code: string) => Promise<void>;
  logout: () => void;
  updateUser: (data: Partial<User>) => void;
  switchTenant: (tenantId: number) => Promise<void>;
}

interface RegisterData {
  email: string;
  password: string;
  displayName: string;
  tenantId?: number;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const navigate = useNavigate();

  // Check for existing token on mount
  useEffect(() => {
    const initAuth = async () => {
      const token = localStorage.getItem('accessToken');
      if (token) {
        setAuthToken(token);
        try {
          const response = await api.get('/auth/me');
          setUser(response.data.data);
        } catch {
          // Token invalid, clear it
          localStorage.removeItem('accessToken');
          localStorage.removeItem('refreshToken');
          clearAuthToken();
        }
      }
      setIsLoading(false);
    };

    initAuth();
  }, []);

  // Shared by every login path (local, LDAP, SSO callback) — FIX: navigate happens
  // here so callers never need to navigate after calling one of these methods.
  const applySession = useCallback((userData: User, accessToken: string, refreshToken?: string) => {
    localStorage.setItem('accessToken', accessToken);
    if (refreshToken) localStorage.setItem('refreshToken', refreshToken);
    setAuthToken(accessToken);
    setUser(userData);
    // If this login followed a session-timeout logout, return to the page the
    // user was on instead of dumping them back on the generic dashboard.
    const redirectTo = sessionStorage.getItem('postLoginRedirect');
    sessionStorage.removeItem('postLoginRedirect');
    navigate(redirectTo || '/dashboard', { replace: true });
  }, [navigate]);

  const login = useCallback(async (email: string, password: string) => {
    const response = await api.post('/auth/login', { email, password });
    const { user: userData, accessToken, refreshToken } = response.data.data;
    applySession(userData, accessToken, refreshToken);
  }, [applySession]);

  const register = useCallback(async (data: RegisterData) => {
    const response = await api.post('/auth/register', data);
    const { user: userData, accessToken, refreshToken } = response.data.data;
    applySession(userData, accessToken, refreshToken);
  }, [applySession]);

  const loginWithLdap = useCallback(async (username: string, password: string) => {
    const response = await api.post('/auth/ldap/login', { username, password });
    const { user: userData, accessToken, refreshToken } = response.data.data;
    applySession(userData, accessToken, refreshToken);
  }, [applySession]);

  const completeSSOLogin = useCallback(async (provider: 'google' | 'azure', code: string) => {
    const response = await api.post(`/auth/sso/${provider}/callback`, { code });
    const { user: userData, accessToken, refreshToken } = response.data.data;
    applySession(userData, accessToken, refreshToken);
  }, [applySession]);

  const logout = useCallback(() => {
    api.post('/auth/logout').catch(() => {});
    localStorage.removeItem('accessToken');
    localStorage.removeItem('refreshToken');
    clearAuthToken();
    setUser(null);
    navigate('/login', { replace: true });
  }, [navigate]);

  const updateUser = useCallback((data: Partial<User>) => {
    setUser(prev => prev ? { ...prev, ...data } : null);
  }, []);

  // super_admin only: act as a different tenant without a full logout/login —
  // swaps the token pair for one scoped to that tenant, then re-fetches /auth/me.
  const switchTenant = useCallback(async (tenantId: number) => {
    const response = await api.post('/auth/switch-tenant', { tenantId });
    const { accessToken, refreshToken } = response.data.data;
    localStorage.setItem('accessToken', accessToken);
    localStorage.setItem('refreshToken', refreshToken);
    setAuthToken(accessToken);
    const me = await api.get('/auth/me');
    setUser(me.data.data);
  }, []);

  return (
    <AuthContext.Provider
      value={{
        user,
        isAuthenticated: !!user,
        isLoading,
        login,
        register,
        loginWithLdap,
        completeSSOLogin,
        logout,
        updateUser,
        switchTenant,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components -- context hook co-located with its Provider
export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
