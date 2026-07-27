'use client';

import type { ReactNode } from 'react';
import * as Ic from './icons';

export function Modal({
  title,
  subtitle,
  onClose,
  children,
  footer,
  width = 480,
}: {
  title: string;
  subtitle?: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  width?: number;
}) {
  return (
    <div
      onClick={onClose}
      style={{ position: 'fixed', inset: 0, background: 'rgba(11,31,58,.42)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 16 }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{ background: 'var(--surface-card)', borderRadius: 'var(--radius-lg)', width, maxWidth: '100%', maxHeight: '90vh', overflow: 'auto', boxShadow: '0 24px 60px rgba(11,31,58,.24)' }}
      >
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, padding: '18px 20px', borderBottom: '1px solid var(--border-subtle)' }}>
          <div>
            <div style={{ fontSize: 16, fontWeight: 800 }}>{title}</div>
            {subtitle && <div className="dim" style={{ fontSize: 13, marginTop: 2 }}>{subtitle}</div>}
          </div>
          <button onClick={onClose} className="iconbtn" style={{ width: 32, height: 32 }} aria-label="Close">
            <Ic.Plus width={18} style={{ transform: 'rotate(45deg)' }} />
          </button>
        </div>
        <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 14 }}>{children}</div>
        {footer && (
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, padding: '14px 20px', borderTop: '1px solid var(--border-subtle)' }}>
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label style={{ display: 'block' }}>
      <span style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 5 }}>{label}</span>
      {children}
    </label>
  );
}

const inputStyle: React.CSSProperties = {
  width: '100%', height: 40, padding: '0 12px', border: '1px solid var(--border-strong)',
  borderRadius: 'var(--radius-md)', fontFamily: 'var(--font-sans)', fontSize: 14, outline: 'none', background: 'var(--surface-card)', color: 'var(--text-primary)',
};

export function TextInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} style={inputStyle} />;
}

export function SelectInput(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} style={inputStyle} />;
}

export function Button({ variant = 'primary', ...props }: { variant?: 'primary' | 'outline' } & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  const base: React.CSSProperties = {
    height: 40, padding: '0 16px', borderRadius: 'var(--radius-md)', fontFamily: 'var(--font-sans)', fontWeight: 700, fontSize: 13.5, cursor: 'pointer',
  };
  const styles = variant === 'primary'
    ? { ...base, border: 'none', background: 'var(--blue-500)', color: '#fff' }
    : { ...base, border: '1px solid var(--border-strong)', background: 'var(--surface-card)', color: 'var(--text-secondary)' };
  return <button {...props} style={styles} />;
}
