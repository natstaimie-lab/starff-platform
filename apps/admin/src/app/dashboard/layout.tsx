'use client';

import { useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import type { ReactNode } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { apiFetch } from '@/lib/api';
import { Sidebar } from '@/components/Sidebar';
import { Topbar } from '@/components/Topbar';

const TITLES: Record<string, [string, string]> = {
  '/dashboard': ['Dashboard', 'Overview of your recruitment operations'],
  '/dashboard/candidates': ['Candidates', 'Manage your candidate pipeline'],
  '/dashboard/workers': ['Workers', 'Active workers and their availability'],
  '/dashboard/clients': ['Clients', 'Client organisations and accounts'],
  '/dashboard/enquiries': ['Enquiries', 'Submissions from the website forms'],
  '/dashboard/bookings': ['Job Bookings', 'Open and confirmed staffing requests'],
  '/dashboard/shifts': ['Shifts', 'Upcoming shifts and staffing progress'],
  '/dashboard/timesheets': ['Timesheets', 'Review and approve submitted hours'],
  '/dashboard/payroll': ['Payroll & Invoices', 'Worker pay runs and client invoicing'],
  '/dashboard/compliance': ['Compliance Dashboard', 'Right to work, documents, licences & training'],
  '/dashboard/invoices': ['Payroll & Invoices', 'Billing, payments and payroll runs'],
  '/dashboard/ai': ['AI Assistant', 'Insights and answers across your operation'],
  '/dashboard/messages': ['Messages', 'Talk to candidates and clients in one place'],
  '/dashboard/settings': ['Settings', 'Your workspace and notification preferences'],
};

export default function DashboardLayout({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [ready, setReady] = useState(false);
  const [email, setEmail] = useState('');

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data }) => {
      if (!data.session) { router.replace('/login'); return; }
      // Role gate — only staff may stay in the admin dashboard.
      try {
        const me = await apiFetch<{ role: string | null }>('/auth/whoami');
        if (me.role !== 'ADMIN' && me.role !== 'RECRUITER') {
          await supabase.auth.signOut();
          router.replace('/login');
          return;
        }
      } catch {
        await supabase.auth.signOut();
        router.replace('/login');
        return;
      }
      setEmail(data.session.user.email ?? '');
      setReady(true);
    });
  }, [router]);

  if (!ready) return <div style={{ padding: 32, color: 'var(--text-secondary)' }}>Loading…</div>;

  const [title, subtitle] = TITLES[pathname] ?? ['Starff', ''];

  return (
    <div className="app">
      <Sidebar />
      <div className="main">
        <Topbar title={title} subtitle={subtitle} email={email} />
        <div className="content">{children}</div>
      </div>
    </div>
  );
}
