import { useEffect } from 'react';
import { Outlet, Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/lib/AuthContext';
import UserNotRegisteredError from '@/components/UserNotRegisteredError';
import JourneyLoading from '@/components/JourneyLoading';
import AccessRecovery from '@/components/system/AccessRecovery';

const DefaultFallback = () => (
  <JourneyLoading label="Checking your account…" onRetry={() => window.location.reload()} />
);

export default function ProtectedRoute({ fallback = <DefaultFallback />, unauthenticatedElement }) {
  const { user, isAuthenticated, isLoadingAuth, authChecked, authError, checkUserAuth } = useAuth();

  const { pathname } = useLocation();

  useEffect(() => {
    if (!authChecked && !isLoadingAuth) {
      checkUserAuth();
    }
  }, [authChecked, isLoadingAuth, checkUserAuth]);

  if (isLoadingAuth || !authChecked) {
    return fallback;
  }

  if (authError) {
    if (authError.type === 'user_not_registered') {
      return <UserNotRegisteredError />;
    }
    if (authError.type === 'auth_required') return unauthenticatedElement;
    return <AccessRecovery onRetry={checkUserAuth} />;
  }

  if (!isAuthenticated) {
    return unauthenticatedElement;
  }

  if (user?.access_role && !pathname.startsWith("/workspace") && pathname !== "/account")
    return <Navigate to="/workspace" replace />;
  return <Outlet />;
}