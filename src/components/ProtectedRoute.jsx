import { useEffect } from 'react';
import { Outlet } from 'react-router-dom';
import { useAuth } from '@/lib/AuthContext';
import UserNotRegisteredError from '@/components/UserNotRegisteredError';
import JourneyLoading from '@/components/JourneyLoading';
import AccessRecovery from '@/components/system/AccessRecovery';

const DefaultFallback = () => (
  <JourneyLoading label="Checking your account…" onRetry={() => window.location.reload()} />
);

export default function ProtectedRoute({ fallback = <DefaultFallback />, unauthenticatedElement }) {
  const { isAuthenticated, isLoadingAuth, authChecked, authError, checkUserAuth } = useAuth();

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

  return <Outlet />;
}