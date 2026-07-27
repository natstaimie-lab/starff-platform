/**
 * Centralised API client — the ONLY way the app talks to the backend.
 *
 * - Every call goes to the shared Starff NestJS API (config.apiUrl), the same
 *   API the admin dashboard and portals use. The app NEVER touches the
 *   database directly.
 * - The current Supabase access token is attached as a Bearer header.
 * - On a 401 we try one silent refreshSession() + retry; if that still fails
 *   we sign out cleanly (the AuthContext listener redirects to login). This
 *   mirrors the hardened apiFetch in the web portals.
 * - Mutating calls accept an idempotencyKey so retries can't double-submit
 *   (shift acceptance, timesheet submission, bookings, etc.).
 */
import { supabase } from '@/lib/supabase';
import { config } from '@/config/env';

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public body?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

type Json = Record<string, unknown> | unknown[];

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  body?: Json;
  /** De-dupes retried mutations on the server. */
  idempotencyKey?: string;
  /** Abort the request after this many ms (default 20s). */
  timeoutMs?: number;
  /** Internal: prevents infinite refresh loops. */
  _isRetry?: boolean;
}

async function authHeader(): Promise<Record<string, string>> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  return session?.access_token
    ? { Authorization: `Bearer ${session.access_token}` }
    : {};
}

export async function apiFetch<T = unknown>(
  path: string,
  opts: RequestOptions = {},
): Promise<T> {
  const { method = 'GET', body, idempotencyKey, timeoutMs = 20_000 } = opts;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  let res: Response;
  try {
    res = await fetch(`${config.apiUrl}${path}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : {}),
        ...(await authHeader()),
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });
  } catch (err) {
    clearTimeout(timeout);
    if (err instanceof Error && err.name === 'AbortError') {
      throw new ApiError(0, 'The request timed out. Check your connection.');
    }
    throw new ApiError(0, 'Network error. You appear to be offline.');
  }
  clearTimeout(timeout);

  // Expired token → refresh once, then retry the original request.
  if (res.status === 401 && !opts._isRetry) {
    const { data, error } = await supabase.auth.refreshSession();
    if (!error && data.session) {
      return apiFetch<T>(path, { ...opts, _isRetry: true });
    }
    await supabase.auth.signOut();
    throw new ApiError(401, 'Your session has expired. Please sign in again.');
  }

  const text = await res.text();
  const payload = text ? safeJson(text) : undefined;

  if (!res.ok) {
    const message =
      (payload as { message?: string | string[] })?.message ??
      `Request failed (${res.status})`;
    throw new ApiError(
      res.status,
      Array.isArray(message) ? message.join(', ') : String(message),
      payload,
    );
  }

  return payload as T;
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

/** A stable idempotency key for a logical action (e.g. accept shift X). */
export function idempotencyKey(...parts: (string | number)[]): string {
  return parts.join(':');
}
