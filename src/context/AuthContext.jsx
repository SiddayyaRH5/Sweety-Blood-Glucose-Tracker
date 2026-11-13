import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import {
  clearAuthToken,
  getAuthToken,
  setAuthToken,
} from '../services/apiClient.js';
import {
  fetchCurrentUserApi,
  loginUserApi,
  logoutUserApi,
  registerUserApi,
} from '../services/readingsService.js';

const AuthContext = createContext(null);

const PREVIEW_SESSION_KEY = 'sweety_autostart_preview';

function isAutostartRequested() {
  if (typeof window === 'undefined') return false;
  const params = new URLSearchParams(window.location.search);
  if (params.get('autostart') === '1') {
    sessionStorage.setItem(PREVIEW_SESSION_KEY, '1');
    return true;
  }
  return sessionStorage.getItem(PREVIEW_SESSION_KEY) === '1';
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [authError, setAuthError] = useState(null);

  useEffect(() => {
    let active = true;

    async function bootstrapSession() {
      if (isAutostartRequested()) {
        if (active) {
          setUser({
            id: 'preview-user',
            name: 'Maya Lin',
            email: 'maya.lin@example.com',
            isPreviewSession: true,
          });
          setLoading(false);
        }
        return;
      }

      const token = getAuthToken();
      if (!token) {
        if (active) {
          setUser(null);
          setLoading(false);
        }
        return;
      }

      try {
        const currentUser = await fetchCurrentUserApi();
        if (active) {
          setUser({
            id: currentUser.id,
            name: currentUser.name,
            email: currentUser.email,
            isPreviewSession: false,
          });
        }
      } catch {
        clearAuthToken();
        if (active) {
          setUser(null);
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }

    void bootstrapSession();
    return () => {
      active = false;
    };
  }, []);

  const login = useCallback(async (params) => {
    setAuthError(null);
    sessionStorage.removeItem(PREVIEW_SESSION_KEY);
    try {
      const session = await loginUserApi(params);
      setAuthToken(session.token);
      setUser({
        id: session.user.id,
        name: session.user.name,
        email: session.user.email,
        isPreviewSession: false,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unable to sign in.';
      setAuthError(message);
      throw err;
    }
  }, []);

  const register = useCallback(async (params) => {
    setAuthError(null);
    sessionStorage.removeItem(PREVIEW_SESSION_KEY);
    try {
      const session = await registerUserApi(params);
      setAuthToken(session.token);
      setUser({
        id: session.user.id,
        name: session.user.name,
        email: session.user.email,
        isPreviewSession: false,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unable to create account.';
      setAuthError(message);
      throw err;
    }
  }, []);

  const signOut = useCallback(async () => {
    setAuthError(null);
    const hadToken = Boolean(getAuthToken());
    if (hadToken) {
      await logoutUserApi();
    }
    sessionStorage.removeItem(PREVIEW_SESSION_KEY);
    clearAuthToken();
    setUser(null);
    if (typeof window !== 'undefined' && window.location.search.includes('autostart=1')) {
      window.history.replaceState({}, '', window.location.pathname);
    }
  }, []);

  const value = useMemo(
    () => ({
      user,
      loading,
      authError,
      login,
      register,
      signOut,
      clearAuthError: () => setAuthError(null),
    }),
    [user, loading, authError, login, register, signOut]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used inside AuthProvider');
  }
  return ctx;
}
