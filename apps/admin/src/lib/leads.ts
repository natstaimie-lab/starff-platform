// Shared types, labels and helpers for the CRM leads screens.
// Stage names match the Prisma LeadStage enum — no display-only states.

export const STAGES = ['NEW', 'CONTACTED', 'QUALIFIED', 'QUOTED', 'READY_TO_CLOSE', 'WON', 'LOST'] as const;
export type Stage = (typeof STAGES)[number];

export const STAGE_LABEL: Record<Stage, string> = {
  NEW: 'New', CONTACTED: 'Contacted', QUALIFIED: 'Qualified', QUOTED: 'Quote sent', READY_TO_CLOSE: 'Ready to close', WON: 'Won', LOST: 'Lost',
};
export const STAGE_TONE: Record<Stage, 'neutral' | 'info' | 'warning' | 'success' | 'error'> = {
  NEW: 'warning', CONTACTED: 'info', QUALIFIED: 'info', QUOTED: 'info', READY_TO_CLOSE: 'warning', WON: 'success', LOST: 'error',
};
export const SOURCE_LABEL: Record<string, string> = {
  ENQUIRY: 'Website enquiry', CLIENT: 'Existing client', MANUAL: 'Added by staff', AI: 'AI salesperson', REFERRAL: 'Referral', OUTBOUND: 'Outbound',
};
export const ACTIVITY_LABEL: Record<string, string> = {
  CALL: 'Call', EMAIL: 'Email', NOTE: 'Note', MEETING: 'Meeting', STAGE_CHANGE: 'Stage change',
};

export type Lead = {
  id: string; stage: Stage; source: string; companyName: string;
  contactName: string | null; contactEmail: string | null; contactPhone: string | null; contactRole: string | null;
  sector: string | null; city: string | null; postcode: string | null; estimatedValue: string | null; notes: string | null;
  clientId: string | null; enquiryId: string | null; ownerId: string | null; createdByAi: boolean;
  nextActionAt: string | null; lastActivityAt: string | null; stageChangedAt: string; lostReason: string | null;
  archivedAt: string | null; createdAt: string;
  client: { id: string; name: string; status: string } | null;
  _count?: { activities: number };
};

export type Activity = {
  id: string; type: string; direction: string | null; subject: string | null; body: string | null;
  outcome: string | null; meta: { from?: string; to?: string; reason?: string | null } | null;
  occurredAt: string; byAi: boolean;
};

export type LeadDetail = Lead & {
  enquiry: { id: string; type: string; status: string; message: string | null; createdAt: string } | null;
  activities: Activity[];
};

/** Turn an apiFetch error ("API 400: {json}") into the API's plain message. */
export function apiError(e: unknown, fallback: string): string {
  const m = String((e as Error)?.message || fallback);
  const json = m.match(/\{.*\}$/s);
  if (json) {
    try {
      const msg = JSON.parse(json[0]).message;
      if (msg) return Array.isArray(msg) ? msg.join(' ') : String(msg);
    } catch { /* keep raw */ }
  }
  return m;
}

export const fmtDate = (d: string | null) =>
  d ? new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';
export const fmtDateTime = (d: string) =>
  new Date(d).toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
export const gbp = (v: string | number) => '£' + Number(v).toLocaleString('en-GB', { maximumFractionDigits: 0 });

/** Follow-up date is today or earlier, and the lead is still open. */
export const isDue = (l: Pick<Lead, 'nextActionAt' | 'stage'>) =>
  !!l.nextActionAt && l.stage !== 'WON' && l.stage !== 'LOST' && new Date(l.nextActionAt).getTime() <= Date.now();

/** yyyy-mm-dd for a date input, from an ISO string. */
export const toDateInput = (d: string | null) => (d ? new Date(d).toISOString().slice(0, 10) : '');
