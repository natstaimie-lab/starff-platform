import { supabase } from './supabaseClient';

const API_URL = process.env.NEXT_PUBLIC_API_URL!;

/**
 * Call the Starff API. Attaches the logged-in user's Supabase access token so
 * the API knows who you are and what role you have.
 *
 * If the token has expired (401), we refresh the session once and retry — and
 * only if that still fails do we sign out and send the user to /login. This
 * stops a stale session from silently leaving pages empty.
 */
export async function apiFetch<T = any>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const call = (token?: string) =>
    fetch(API_URL + path, {
      ...init,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(init.headers ?? {}),
      },
    });

  const { data: { session } } = await supabase.auth.getSession();
  let res = await call(session?.access_token);

  if (res.status === 401) {
    // Token likely expired — force a refresh and retry once.
    const { data } = await supabase.auth.refreshSession();
    if (data.session?.access_token) {
      res = await call(data.session.access_token);
    }
    if (res.status === 401) {
      // Session is genuinely gone — clear it and return to login.
      await supabase.auth.signOut();
      if (typeof window !== 'undefined') window.location.href = '/login';
      throw new Error('Your session has expired. Please sign in again.');
    }
  }

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`API ${res.status}: ${body}`);
  }
  return res.json();
}
