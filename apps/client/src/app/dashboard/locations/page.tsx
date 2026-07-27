'use client';

import { useEffect, useState } from 'react';
import { apiFetch } from '@/lib/api';
import { Card } from '@/components/ui';
import * as Ic from '@/components/icons';

type Loc = { id: string; name: string; address: string; workers: number };

export default function LocationsPage() {
  const [rows, setRows] = useState<Loc[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => { apiFetch<Loc[]>('/client/locations').then(setRows).catch(() => {}).finally(() => setLoading(false)); }, []);

  return (
    <Card title="Company Locations">
      {loading ? <p className="mut">Loading…</p> : rows.length === 0 ? <p className="mut">No sites on file yet. Ask your Starff consultant to add your locations.</p> : rows.map((l) => (
        <div key={l.id} className="locrow">
          <span className="locic"><Ic.MapPin width={18} /></span>
          <div className="f1"><div className="locnm">{l.name}</div><div className="locad">{l.address || '—'}</div></div>
          <span className="fs12 mut nowrap">{l.workers} on site today</span>
        </div>
      ))}
    </Card>
  );
}
