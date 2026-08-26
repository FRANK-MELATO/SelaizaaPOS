import { useState, useEffect, useCallback } from 'react';
import toast from 'react-hot-toast';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:5000/api';

/**
 * Monitors network connectivity and API availability.
 * Returns { isOnline, isApiReachable }.
 * Shows a toast banner when connectivity changes.
 */
function useOnlineStatus() {
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [isApiReachable, setIsApiReachable] = useState(true);

  const checkApi = useCallback(async () => {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000);
      const response = await fetch(`${API_URL}/health`, {
        method: 'GET',
        signal: controller.signal,
        cache: 'no-cache'
      });
      clearTimeout(timeout);
      setIsApiReachable(response.ok);
      return response.ok;
    } catch {
      setIsApiReachable(false);
      return false;
    }
  }, []);

  useEffect(() => {
    let offlineToastId = null;

    const handleOnline = () => {
      setIsOnline(true);
      if (offlineToastId) {
        toast.dismiss(offlineToastId);
        offlineToastId = null;
      }
      checkApi().then(reachable => {
        if (reachable) {
          toast.success('Connection restored', { duration: 3000 });
        }
      });
    };

    const handleOffline = () => {
      setIsOnline(false);
      setIsApiReachable(false);
      offlineToastId = toast.error('You are offline. POS is running in offline mode.', {
        duration: Infinity,
        id: 'offline-toast'
      });
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    // Initial check
    if (navigator.onLine) {
      checkApi();
    }

    // Periodic check every 30 seconds
    const interval = setInterval(() => {
      if (navigator.onLine) {
        checkApi();
      }
    }, 30000);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      clearInterval(interval);
    };
  }, [checkApi]);

  return { isOnline, isApiReachable, checkApi };
}

export default useOnlineStatus;
