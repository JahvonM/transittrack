import React, { createContext, useState, useContext, useEffect, useRef } from 'react';
import { base44 } from '@/api/base44Client';
import { appParams } from '@/lib/app-params';
import { setAuditActor } from '@/lib/auditLog';
import { ACCENT_KEY, applyAccent } from '@/lib/accents';
import { httpStatus, errorData, sessionRejected } from '@/lib/requestError';

const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoadingAuth, setIsLoadingAuth] = useState(true);
  const [isLoadingPublicSettings, setIsLoadingPublicSettings] = useState(true);
  const [authError, setAuthError] = useState(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [appPublicSettings, setAppPublicSettings] = useState(null); // Contains only { id, public_settings }
  // True once the server has confirmed a session in this tab. Lets a failed
  // check tell "your sign-in ended" apart from "that call didn't get through".
  const sessionRef = useRef(false);
  const authRequestRef = useRef(null);
  const authEpoch = useRef(0);

  useEffect(() => {
    checkAppState();
  }, []);

  // Signup email runs independently: a delivery failure must not block login.
  // One delayed retry while this signed-in screen remains open; the server
  // keeps the delivery ledger and ignores existing accounts on rollout.
  useEffect(() => {
    if (!isAuthenticated || !user?.id) return;
    let stopped = false;
    let timer;
    const notify = async (canRetry) => {
      try {
        const response = await base44.functions.invoke('notifyAccountCreated', {});
        if (!stopped && canRetry && response.data?.retry_after_ms) timer = setTimeout(() => notify(false), 60_000);
      } catch {
        if (!stopped && canRetry) timer = setTimeout(() => notify(false), 60_000);
      }
    };
    notify(true);
    return () => { stopped = true; clearTimeout(timer); };
  }, [isAuthenticated, user?.id]);

  const checkAppState = async () => {
    setIsLoadingPublicSettings(true);
    setAuthError(null);
    // Paired tablets use their own device credential, not an account login.
    const tabletPage = /^\/(driver|kiosk)(\/|$)/.test(window.location.pathname);
    const settingsRequest = base44.app.getPublicSettings();
    const authRequest = appParams.token && !tabletPage ? checkUserAuth() : Promise.resolve();
    if (!appParams.token || tabletPage) {
      setIsLoadingAuth(false);
      setAuthChecked(true);
    }
    try {
      const publicSettings = await settingsRequest;
      setAppPublicSettings(publicSettings);
      await authRequest;
    } catch (error) {
      await authRequest;
      const reason = errorData(error).extra_data?.reason;
      setAuthError({
        type: httpStatus(error) === 403 && reason ? reason : 'app_unavailable',
        message: error.message || 'Could not connect to the app'
      });
    } finally {
      setIsLoadingPublicSettings(false);
    }
  };

  const acceptUser = (currentUser) => {
    sessionRef.current = true;
    setUser(currentUser);
    setAuditActor(currentUser);
    try {
      if (currentUser?.theme_accent && !localStorage.getItem(ACCENT_KEY)) applyAccent(currentUser.theme_accent);
    } catch { /* storage blocked */ }
    setIsAuthenticated(true);
    setAuthError(null);
    setIsLoadingAuth(false);
    setAuthChecked(true);
  };

  // The server has actually rejected the sign-in — the only case that ends a session.
  const endSession = () => {
    sessionRef.current = false;
    setUser(null);
    setAuditActor(null);
    setIsAuthenticated(false);
    setAuthError({ type: 'auth_required', message: 'Authentication required' });
    setIsLoadingAuth(false);
    setAuthChecked(true);
  };

  const checkUserAuth = () => {
    if (authRequestRef.current) return authRequestRef.current;
    const epoch = authEpoch.current;
    // Background profile refreshes must not unmount the passenger's screen.
    if (!sessionRef.current) setIsLoadingAuth(true);
    setAuthError(null);
    const pending = (async () => {
      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          const currentUser = await base44.auth.me();
          if (epoch === authEpoch.current) acceptUser(currentUser);
          return;
        } catch (error) {
          if (epoch !== authEpoch.current) return;
          if (sessionRejected(error)) { endSession(); return; }
          if (errorData(error).extra_data?.reason === 'user_not_registered') {
            setAuthError({ type: 'user_not_registered', message: error.message });
            break;
          }
          if (sessionRef.current) break;
          if (attempt === 0) await new Promise(resolve => setTimeout(resolve, 1500));
          else setAuthError({ type: 'auth_unavailable', message: 'Could not check your sign-in' });
        }
      }
      if (epoch === authEpoch.current) {
        setIsLoadingAuth(false);
        setAuthChecked(true);
      }
    })().finally(() => {
      if (authRequestRef.current === pending) authRequestRef.current = null;
    });
    authRequestRef.current = pending;
    return pending;
  };

  const logout = (shouldRedirect = true) => {
    authEpoch.current += 1;
    authRequestRef.current = null;
    sessionRef.current = false;
    setUser(null);
    setAuditActor(null);
    setIsAuthenticated(false);
    
    if (shouldRedirect) {
      // Use the SDK's logout method which handles token cleanup and redirect
      base44.auth.logout(window.location.href);
    } else {
      // Just remove the token without redirect
      base44.auth.logout();
    }
  };

  const navigateToLogin = () => {
    // Use the SDK's redirectToLogin method
    base44.auth.redirectToLogin(window.location.href);
  };

  return (
    <AuthContext.Provider value={{ 
      user, 
      isAuthenticated, 
      isLoadingAuth,
      isLoadingPublicSettings,
      authError,
      appPublicSettings,
      authChecked,
      logout,
      navigateToLogin,
      checkUserAuth,
      checkAppState
    }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};