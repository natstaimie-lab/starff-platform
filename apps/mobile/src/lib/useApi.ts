/**
 * useApi — tiny data-fetching hook with loading / error / refresh states, so
 * every screen gets consistent loading spinners, error retry and pull-to-
 * refresh without repeating boilerplate.
 */
import { useCallback, useEffect, useState } from 'react';
import { ApiError } from '@/lib/api';

interface State<T> {
  data: T | null;
  loading: boolean;
  refreshing: boolean;
  error: string | null;
}

export function useApi<T>(fetcher: () => Promise<T>, deps: unknown[] = []) {
  const [state, setState] = useState<State<T>>({
    data: null,
    loading: true,
    refreshing: false,
    error: null,
  });

  const load = useCallback(
    async (mode: 'initial' | 'refresh' = 'initial') => {
      setState((s) => ({
        ...s,
        loading: mode === 'initial',
        refreshing: mode === 'refresh',
        error: null,
      }));
      try {
        const data = await fetcher();
        setState({ data, loading: false, refreshing: false, error: null });
      } catch (err) {
        const message =
          err instanceof ApiError
            ? err.message
            : 'Could not load. Please try again.';
        setState((s) => ({
          ...s,
          loading: false,
          refreshing: false,
          error: message,
        }));
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    deps,
  );

  useEffect(() => {
    void load('initial');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return {
    ...state,
    reload: () => load('initial'),
    refresh: () => load('refresh'),
  };
}
