import React, { useEffect } from 'react';
import ErrorState from '@/components/system/ErrorState';

export default function AccessRecovery({ onRetry, title = "Couldn't check your sign-in", description = "Your saved sign-in has not been removed. Check your connection, then try again." }) {
  useEffect(() => {
    const retry = () => onRetry?.();
    window.addEventListener('online', retry);
    return () => window.removeEventListener('online', retry);
  }, [onRetry]);
  return <div className="min-h-[70dvh] grid place-items-center px-6"><ErrorState title={title} description={description} onRetry={onRetry} /></div>;
}