import React, { createContext, useState, useContext, useEffect, useRef } from 'react';
import { base44 } from '@/api/base44Client';
import { appParams } from '@/lib/app-params';
import { setAuditActor } from '@/lib/auditLog';
import { ACCENT_KEY, applyAccent } from '@/lib/accents';

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

  useEffect(() => {
    checkAppState();
  }, []);

  const checkAppState = async () => {
    try {
      setIsLoadingPublicSettings(true);
      setAuthError(null);
      
      try {
        const publicSettings = await base44.app.getPublicSettings();
        setAppPublicSettings(publicSettings);
        
        // If we got the app public settings successfully, check if user is authenticated
        if (appParams.token) {
          await checkUserAuth();
        } else {
          setIsLoadingAuth(false);
          setIsAuthenticated(false);
          setAuthChecked(true);
        }
        setIsLoadingPublicSettings(false);
      } catch (appError) {
        console.error('App state check failed:', appError);
        
        // Handle app-level errors
        if (appError.status === 403 && appError.data?.extra_data?.reason) {
          const reason = appError.data.extra_data.reason;
          if (reason === 'auth_required') {
            setAuthError({
              type: 'auth_required',
              message: 'Authentication required'
            });
          } else if (reason === 'user_not_registered') {
            setAuthError({
              type: 'user_not_registered',
              message: 'User not registered for this app'
            });
          } else {
            setAuthError({
              type: reason,
              message: appError.message
            });
          }
        } else {
          setAuthError({
            type: 'unknown',
            message: appError.message || 'Failed to load app'
          });
        }
        setIsLoadingPublicSettings(false);
        setIsLoadingAuth(false);
      }
    } catch (error) {
      console.error('Unexpected error:', error);
      setAuthError({
        type: 'unknown',
        message: error.message || 'An unexpected error occurred'
      });
      setIsLoadingPublicSettings(false);
      setIsLoadingAuth(false);
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

  const tokenRejected = (error) => error?.status === 401 || error?.status === 403;

  const checkUserAuth = async () => {
    setIsLoadingAuth(true);
    try {
      acceptUser(await base44.auth.me());
    } catch (error) {
      console.error('User auth check failed:', error);

      if (tokenRejected(error)) {
        endSession();
        return;
      }

      // A call that didn't get through — no connection, a rate limit, a hiccup
      // on the server — is not a sign-out. Keep the session already in hand.
      if (sessionRef.current) {
        setIsAuthenticated(true);
        setIsLoadingAuth(false);
        setAuthChecked(true);
        return;
      }

      // Nothing confirmed yet in this tab: one quiet retry before the login screen.
      await new Promise((resolve) => setTimeout(resolve, 1500));
      try {
        acceptUser(await base44.auth.me());
      } catch (retryError) {
        if (tokenRejected(retryError)) endSession();
        else {
          setIsAuthenticated(false);
          setIsLoadingAuth(false);
          setAuthChecked(true);
        }
      }
    }
  };

  const logout = (shouldRedirect = true) => {
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