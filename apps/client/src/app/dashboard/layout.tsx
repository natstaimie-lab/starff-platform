'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { ReactNode } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { apiFetch } from '@/lib/api';
import { Sidebar } from '@/components/Sidebar';
import { Topbar } from '@/components/Topbar';

export default function DashboardLayout({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [company, setCompany] = useState('');
  const [contact, setContact] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data }) => {
      if (!data.session) {
        router.replace('/login');
        return;
      }
      // Role gate — only client accounts may stay in the client portal.
      try {
        const who = await apiFetch<{ role: string | null }>('/auth/whoami');
        if (who.role !== 'CLIENT') {
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
        const me = await apiFetch<{ client: { name: string }; contact: { firstName: string; lastName: string } }>('/client/me');
        setCompany(me.client.name);
        setContact(`${me.contact.firstName} ${me.contact.lastName}`);
      } catch {
        setError('This login is not linked to a client account. Ask your Starff consultant to set one up.');
      }
      setReady(true);
    });
  }, [router]);

  if (!ready) return <div style={{ padding: 32, color: 'var(--text-secondary)' }}>Loading…</div>;

  if (error) {
    return (
      <div style={{ padding: 40, maxWidth: 460 }}>
        <p style={{ color: 'var(--error-600)', fontSize: 14 }}>{error}</p>
        <button className="btn-outline" style={{ marginTop: 16 }} onClick={() => supabase.auth.signOut().then(() => router.replace('/login'))}>Sign out</button>
      </div>
    );
  }

  return (
    <div className="app">
      <Sidebar />
      <div className="main">
        <Topbar company={company} contact={contact} />
        <div className="content">{children}</div>
      </div>
    </div>
  );
}
