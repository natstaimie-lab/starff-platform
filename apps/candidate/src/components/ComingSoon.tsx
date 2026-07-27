import { Card } from './ui';
import * as Ic from './icons';

export function ComingSoon({ title, note }: { title: string; note: string }) {
  return (
    <Card>
      <div style={{ padding: '48px 24px', textAlign: 'center' }}>
        <div style={{ width: 56, height: 56, borderRadius: 14, background: 'var(--orange-100)', color: 'var(--orange-500)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', marginBottom: 14 }}>
          <Ic.Sparkle />
        </div>
        <div style={{ fontSize: 18, fontWeight: 800 }}>{title}</div>
        <div className="dim" style={{ maxWidth: 420, margin: '8px auto 0', fontSize: 13.5 }}>{note}</div>
      </div>
    </Card>
  );
}
