'use client';

import { useEffect, useState } from 'react';
import { apiFetch } from './api';

/** Current staff member's role ('ADMIN' | 'RECRUITER'), or null while loading. */
export function useRole(): string | null {
  const [role, setRole] = useState<string | null>(null);
  useEffect(() => {
    apiFetch<{ role: string }>('/staff/me').then((m) => setRole(m.role)).catch(() => setRole(null));
  }, []);
  return role;
}
