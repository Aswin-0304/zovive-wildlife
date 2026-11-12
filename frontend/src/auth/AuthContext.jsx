import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { authApi, refreshCsrf, resetCsrf } from '../api.js';

const AuthContext = createContext(null);

// Set when the user signs out and removed once the server has confirmed the logout. While it exists the app never
// restores a session from the auth cookie, and the next page load retries the server logout. Other tabs listen for it.
const PENDING_LOGOUT_KEY = 'zovive.auth.pendingLogout';
const storage = {
  get: () => { try { return localStorage.getItem(PENDING_LOGOUT_KEY); } catch { return null; } },
  set: () => { try { localStorage.setItem(PENDING_LOGOUT_KEY, String(Date.now())); } catch { /* storage unavailable */ } },
  clear: () => { try { localStorage.removeItem(PENDING_LOGOUT_KEY); } catch { /* storage unavailable */ } },
};

// UI-only flag for this tab (no credentials): the user signed out here, so the login page opens ready to use instead of
// replaying the cinematic intro, in which the card waits off-screen until the ranger's rope pulls it in.
const SIGNED_OUT_KEY = 'zovive.auth.signedOut';
export const signedOutThisTab = () => { try { return sessionStorage.getItem(SIGNED_OUT_KEY) === '1'; } catch { return false; } };
const markSignedOut = (on) => { try { if (on) sessionStorage.setItem(SIGNED_OUT_KEY, '1'); else sessionStorage.removeItem(SIGNED_OUT_KEY); } catch { /* storage unavailable */ } };

export function AuthProvider({ children }) {
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [ready, setReady] = useState(false);
  const [connectionError, setConnectionError] = useState('');
  const [arrivalTransition, setArrivalTransition] = useState(false);
  // Incremented on every sign-in/sign-out so a slow /me or login response can never resurrect an older session.
  const epochRef = useRef(0);
  const logoutRef = useRef(null);

  // One server logout at a time; a second click (or a sign-in) joins the request already in flight.
  const serverLogout = useCallback(() => {
    if (!logoutRef.current) {
      // The API skips CSRF checks for requests that carry the auth cookie and drops the CSRF cookie on the first
      // authenticated call, so the token cached at page load is stale by now: always start logout with a fresh one.
      resetCsrf();
      logoutRef.current = authApi.logout()
        .then(() => { storage.clear(); return true; })
        .catch(() => false) // keep the marker: the cookie is cleared on the next successful attempt
        .finally(() => { logoutRef.current = null; resetCsrf(); });
    }
    return logoutRef.current;
  }, []);

  const refreshSession = useCallback(async () => {
    const epoch = epochRef.current;
    setConnectionError('');
    try {
      if (storage.get()) {
        await refreshCsrf();
        await serverLogout();
        if (storage.get()) throw Object.assign(new Error('Backend API is not responding.'), { status: 0 });
        if (epoch === epochRef.current) setUser(null);
        return null;
      }
      await refreshCsrf();
      const account = await authApi.me();
      if (epoch !== epochRef.current || storage.get()) return null;
      setUser(account);
      return account;
    } catch (error) {
      if (epoch === epochRef.current) setUser(null);
      if (error.status !== 401) setConnectionError(error.message || 'Authentication service is unavailable.');
      return null;
    } finally {
      setReady(true);
    }
  }, [serverLogout]);

  const signOut = useCallback(() => {
    // Local session ends immediately and unconditionally; the server call can finish (or fail) in the background.
    // The protected layout unmounts in the same render (no dashboard frame), and the login entry replaces the current
    // history entry; any protected entry reached with Back is redirected before it renders (user is null).
    epochRef.current += 1;
    storage.set();
    markSignedOut(true);
    setUser(null);
    setArrivalTransition(false);
    navigate('/login', { replace: true, state: { signedOut: true } });
    return serverLogout();
  }, [navigate, serverLogout]);

  useEffect(() => {
    refreshSession();
    const expired = () => { epochRef.current += 1; setUser(null); };
    // Another tab signed out (marker added) - end this tab's session too.
    const crossTab = (event) => { if (event.key === PENDING_LOGOUT_KEY && event.newValue) expired(); };
    // A page restored from the back/forward cache may still show a session that has since ended. Hide protected content
    // at once (boot screen; no session at all if a sign-out is pending) and only show it again once the server confirms.
    const restored = (event) => {
      if (!event.persisted) return;
      epochRef.current += 1;
      if (storage.get()) setUser(null);
      setReady(false);
      refreshSession();
    };
    // A sign-out whose server call failed (offline, server down) is retried as soon as the connection is back, so the
    // auth cookie is revoked and cleared without waiting for the next page load.
    const online = () => { if (storage.get()) serverLogout(); };
    window.addEventListener('zovive:unauthorized', expired);
    window.addEventListener('storage', crossTab);
    window.addEventListener('pageshow', restored);
    window.addEventListener('online', online);
    return () => {
      window.removeEventListener('zovive:unauthorized', expired);
      window.removeEventListener('storage', crossTab);
      window.removeEventListener('pageshow', restored);
      window.removeEventListener('online', online);
    };
  }, [refreshSession]);

  const signIn = useCallback(async (identifier, password, rememberMe, animateArrival = true) => {
    setConnectionError('');
    // A logout response that lands after a new login would expire the new cookie, so let it finish first.
    if (logoutRef.current) await logoutRef.current;
    const epoch = ++epochRef.current;
    const result = await authApi.login(identifier, password, rememberMe);
    if (epoch !== epochRef.current) return null;
    storage.clear();
    markSignedOut(false);
    setUser(result.user);
    setArrivalTransition(animateArrival);
    return result.user;
  }, []);

  const finishArrivalTransition = useCallback(() => setArrivalTransition(false), []);

  const value = useMemo(() => ({ user, ready, connectionError, arrivalTransition, finishArrivalTransition, refreshSession, signIn, signOut }),
    [user, ready, connectionError, arrivalTransition, finishArrivalTransition, refreshSession, signIn, signOut]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used inside AuthProvider');
  return context;
}
