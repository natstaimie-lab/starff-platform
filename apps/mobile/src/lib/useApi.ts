/**
 * useApi — tiny data-fetching hook with loading / error / refresh states, so
 * every screen gets consistent loading spinners, error retry and pull-to-
 * refresh without repeating boilerplate.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
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
    async (mode: 'initial' | 'refresh' | 'silent' = 'initial') => {
      // Silent keeps what's on screen untouched, with no spinner shifting the layout.
      if (mode !== 'silent') {
        setState((s) => ({
          ...s,
          loading: mode === 'initial',
          refreshing: mode === 'refresh',
          error: null,
        }));
      }
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
    silentRefresh: () => load('silent'),
  };
}

/**
 * Re-fetch quietly each time the screen comes back into focus (tab switch or
 * back navigation). Tab screens stay mounted, so without this a list loaded
 * once never picks up new offers or timesheets until a pull-to-refresh.
 * The first focus is skipped because useApi already loads on mount.
 */
export function useRefreshOnFocus(...refreshers: (() => unknown)[]) {
  const first = useRef(true);
  const latest = useRef(refreshers);
  latest.current = refreshers;
  useFocusEffect(
    useCallback(() => {
      if (first.current) {
        first.current = false;
        return;
      }
      for (const r of latest.current) void r();
    }, []),
  );
}
