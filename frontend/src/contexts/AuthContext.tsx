import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, setAuthToken, clearAuthToken } from '@/services/api';
import { clearSessionReplacedFlag } from '@/lib/sessionEnd';

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
  /** External participants (role 'externe'): the company they come from. */
  externalCompany?: string | null;
  jobTitle?: string | null;
}

interface LoginOptions {
  /** 'external': the external participants' portal, which only accepts role 'externe'. */
  portal?: 'external';
}

/** Second sign-in step: a 6-digit code was emailed, no session yet (POST /auth/2fa/verify). */
export interface TwoFactorChallenge {
  challengeToken: string;
  /** "j***@domain.com" */
  emailHint: string;
  /** Seconds the code stays valid. */
  expiresIn: number;
  /** Seconds before "Renvoyer le code" is allowed. */
  resendAfter: number;
}

/** What a sign-in resolves to when it did not open a session right away. */
export type LoginOutcome = { twoFactor: TwoFactorChallenge } | void;

interface AuthContextType {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (email: string, password: string, options?: LoginOptions) => Promise<LoginOutcome>;
  register: (data: RegisterData) => Promise<{ pending: boolean; message?: string }>;
  loginWithLdap: (username: string, password: string) => Promise<LoginOutcome>;
  /** Enters the emailed code; opens the session (and navigates) on success. */
  verifyTwoFactor: (challengeToken: string, code: string) => Promise<void>;
  /** Sends a new code; resolves to the new timings. */
  resendTwoFactor: (challengeToken: string) => Promise<Pick<TwoFactorChallenge, 'emailHint' | 'expiresIn' | 'resendAfter'>>;
  completeSSOLogin: (provider: 'google' | 'azure', code: string, state: string) => Promise<void>;
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

function twoFactorFrom(data: any): TwoFactorChallenge {
  return {
    challengeToken: data.challengeToken,
    emailHint: data.emailHint,
    expiresIn: data.expiresIn,
    resendAfter: data.resendAfter,
  };
}

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
    // Signed in again: the "signed out by another device" banner has served.
    clearSessionReplacedFlag();
    // If this login followed a session-timeout logout, return to the page the
    // user was on instead of dumping them back on the generic dashboard.
    const redirectTo = sessionStorage.getItem('postLoginRedirect');
    sessionStorage.removeItem('postLoginRedirect');
    navigate(redirectTo || '/dashboard', { replace: true });
  }, [navigate]);

  const login = useCallback(async (email: string, password: string, options?: LoginOptions): Promise<LoginOutcome> => {
    const response = await api.post('/auth/login', { email, password, portal: options?.portal });
    // Two-step sign-in: the page shows the code step, nothing is stored yet.
    if (response.data.data.twoFactorRequired) {
      return { twoFactor: twoFactorFrom(response.data.data) };
    }
    // Password older than the organization allows: no session yet, the user
    // chooses a new password first (the short-lived token travels in router
    // state, not in the URL).
    if (response.data.data.passwordExpired) {
      navigate('/reset-password', {
        replace: true,
        state: { resetToken: response.data.data.resetToken, passwordExpired: true },
      });
      return;
    }
    const { user: userData, accessToken, refreshToken } = response.data.data;
    applySession(userData, accessToken, refreshToken);
  }, [applySession, navigate]);

  // Self-registered accounts start 'pending' — no session is issued until an
  // n+1 activates the account, so there's nothing to applySession() with here.
  const register = useCallback(async (data: RegisterData) => {
    const response = await api.post('/auth/register', data);
    const { pending, message } = response.data.data;
    return { pending: !!pending, message };
  }, []);

  const loginWithLdap = useCallback(async (username: string, password: string): Promise<LoginOutcome> => {
    const response = await api.post('/auth/ldap/login', { username, password });
    if (response.data.data.twoFactorRequired) {
      return { twoFactor: twoFactorFrom(response.data.data) };
    }
    const { user: userData, accessToken, refreshToken } = response.data.data;
    applySession(userData, accessToken, refreshToken);
  }, [applySession]);

  const verifyTwoFactor = useCallback(async (challengeToken: string, code: string) => {
    const response = await api.post('/auth/2fa/verify', { challengeToken, code });
    const { user: userData, accessToken, refreshToken } = response.data.data;
    applySession(userData, accessToken, refreshToken);
  }, [applySession]);

  const resendTwoFactor = useCallback(async (challengeToken: string) => {
    const response = await api.post('/auth/2fa/resend', { challengeToken });
    return response.data.data;
  }, []);

  const completeSSOLogin = useCallback(async (provider: 'google' | 'azure', code: string, state: string) => {
    const response = await api.post(`/auth/sso/${provider}/callback`, { code, state });
    const { user: userData, accessToken, refreshToken } = response.data.data;
    applySession(userData, accessToken, refreshToken);
  }, [applySession]);

  const logout = useCallback(() => {
    // Ends this session server-side. Both tokens are sent explicitly (captured
    // before they are cleared below): the refresh token still names the session
    // once the access token has expired.
    const accessToken = localStorage.getItem('accessToken');
    const refreshToken = localStorage.getItem('refreshToken');
    api
      .post('/auth/logout', { refreshToken }, { headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : {} })
      .catch(() => {});
    localStorage.removeItem('accessToken');
    localStorage.removeItem('refreshToken');
    clearAuthToken();
    // External participants go back to their own portal.
    const loginPath = user?.role === 'externe' ? '/external/login' : '/login';
    setUser(null);
    navigate(loginPath, { replace: true });
  }, [navigate, user?.role]);

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
        verifyTwoFactor,
        resendTwoFactor,
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
