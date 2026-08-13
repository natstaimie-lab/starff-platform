'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { ReactNode } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { apiFetch } from '@/lib/api';
import { Sidebar } from '@/components/Sidebar';
import { Topbar } from '@/components/Topbar';

// Fetch the candidate profile; if this account has no profile yet (first login
// after sign-up), create it from the sign-up metadata, then load it.
async function ensureProfile(): Promise<string> {
  try {
    const me = await apiFetch<any>('/me');
    return `${me.firstName} ${me.lastName}`;
  } catch {
    const { data } = await supabase.auth.getSession();
    const u = data.session!.user;
    await apiFetch('/candidates', {
      method: 'POST',
      body: JSON.stringify({
        userId: u.id,
        email: u.email,
        firstName: (u.user_metadata?.firstName as string) ?? 'New',
        lastName: (u.user_metadata?.lastName as string) ?? 'Candidate',
      }),
    });
    const me = await apiFetch<any>('/me');
    return `${me.firstName} ${me.lastName}`;
  }
}

export default function DashboardLayout({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [name, setName] = useState('');

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data }) => {
      if (!data.session) {
        router.replace('/login');
        return;
      }
      // Role gate — only workers may stay here (and before ensureProfile, so a
      // non-candidate login can never auto-create a candidate profile).
      try {
        const who = await apiFetch<{ role: string | null }>('/auth/whoami');
        if (who.role !== 'CANDIDATE') {
          await supabase.auth.signOut();
          router.replace('/login');
          return;
        }
      } catch {
        await supabase.auth.signOut();
        router.replace('/login');
        return;
      }
      try {
        setName(await ensureProfile());
      } catch {
        setName(data.session.user.email ?? 'Candidate');
      }
      setReady(true);
    });
  }, [router]);

  if (!ready) return <div style={{ padding: 32, color: 'var(--text-secondary)' }}>Loading…</div>;

  return (
    <div className="app">
      <Sidebar />
      <div className="main">
        <Topbar name={name} />
        <div className="content">{children}</div>
      </div>
    </div>
  );
}
