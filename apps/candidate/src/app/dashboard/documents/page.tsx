'use client';

import { useEffect, useRef, useState } from 'react';
import { apiFetch } from '@/lib/api';
import { supabase } from '@/lib/supabaseClient';
import { Card, Badge } from '@/components/ui';
import * as Ic from '@/components/icons';

type Doc = { id: string; type: string; fileName?: string; status: string; createdAt: string };

const TYPES = [
  { v: 'RIGHT_TO_WORK', l: 'Right to Work' },
  { v: 'ID', l: 'Proof of ID' },
  { v: 'DBS_CHECK', l: 'DBS Certificate' },
  { v: 'CV', l: 'CV / Work History' },
  { v: 'QUALIFICATION', l: 'Qualification' },
  { v: 'LICENCE', l: 'Licence' },
  { v: 'CERTIFICATE', l: 'Certificate' },
];
const typeLabel = (t: string) => TYPES.find((x) => x.v === t)?.l ?? t;
const statusTone: Record<string, string> = { VERIFIED: 'success', PENDING: 'warning', REJECTED: 'error', EXPIRED: 'error' };

export default function DocumentsPage() {
  const [docs, setDocs] = useState<Doc[]>([]);
  const [type, setType] = useState('RIGHT_TO_WORK');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const fileRef = useRef<HTMLInputElement>(null);

  const load = () => apiFetch<{ documents: Doc[] }>('/me').then((me) => setDocs(me.documents ?? [])).catch(() => {}).finally(() => setLoading(false));
  useEffect(() => { load(); }, []);

  async function upload(file: File) {
    setBusy(true); setError('');
    try {
      const { data } = await supabase.auth.getSession();
      const uid = data.session!.user.id;
      const path = `${uid}/${type}-${Date.now()}-${file.name}`;
      const { error: upErr } = await supabase.storage.from('candidate-documents').upload(path, file);
      if (upErr) throw upErr;
      await apiFetch('/me/documents', { method: 'POST', body: JSON.stringify({ type, fileUrl: path, fileName: file.name }) });
      if (fileRef.current) fileRef.current.value = '';
      load();
    } catch (e: any) { setError(e.message ?? 'Upload failed'); } finally { setBusy(false); }
  }

  return (
    <>
      <Card title="Upload a document" >
        <p className="mut" style={{ fontSize: 13.5, marginBottom: 14 }}>Your documents are stored securely and only shared with Starff staff for compliance checks.</p>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
          <select value={type} onChange={(e) => setType(e.target.value)} style={{ height: 40, padding: '0 12px', border: '1px solid var(--border-strong)', borderRadius: 'var(--radius-md)', fontSize: 14 }}>
            {TYPES.map((t) => <option key={t.v} value={t.v}>{t.l}</option>)}
          </select>
          <input ref={fileRef} type="file" onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} disabled={busy} style={{ fontSize: 13 }} />
          {busy && <span className="mut" style={{ fontSize: 13 }}>Uploading…</span>}
        </div>
        {error && <p style={{ color: 'var(--error-600)', fontSize: 13, marginTop: 10 }}>{error}</p>}
      </Card>

      <Card title="My Documents">
        {loading ? <p className="mut">Loading…</p> : docs.length === 0 ? (
          <p className="mut" style={{ fontSize: 13.5 }}>No documents uploaded yet. Add your Right to Work and ID to get started.</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            {docs.map((d) => (
              <div key={d.id} className="fx ac jb" style={{ padding: '12px 0', borderBottom: '1px solid var(--border-subtle)' }}>
                <div className="fx ac" style={{ gap: 12 }}>
                  <span style={{ width: 36, height: 36, borderRadius: 8, background: 'var(--surface-sunken)', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Ic.FileText width={18} /></span>
                  <div>
                    <div className="nm">{typeLabel(d.type)}</div>
                    <div className="sub2">{d.fileName ?? '—'}</div>
                  </div>
                </div>
                <Badge tone={(statusTone[d.status] ?? 'neutral') as any}>{d.status}</Badge>
              </div>
            ))}
          </div>
        )}
      </Card>
    </>
  );
}
