/**
 * Lead pipeline rules — plain functions so they can be tested without a DB.
 * Kept free of @prisma/client imports (string unions match the Prisma enums)
 * so `node --test` can load this file directly.
 */

export const LEAD_STAGES = ['NEW', 'CONTACTED', 'QUALIFIED', 'QUOTED', 'READY_TO_CLOSE', 'WON', 'LOST'] as const;
export type LeadStageName = (typeof LEAD_STAGES)[number];

export type ClientStatusName = 'LEAD' | 'PROSPECT' | 'ACTIVE' | 'ON_HOLD' | 'CLOSED';

/** Stages that mean the lead is finished (won or lost). */
export const CLOSED_STAGES: readonly LeadStageName[] = ['WON', 'LOST'];

/**
 * Check a stage change. Any move is allowed (staff need to undo mistakes and
 * reopen lost leads), except staying put, and LOST always needs a reason.
 * Returns an error message, or null when the change is fine.
 */
export function stageChangeError(from: LeadStageName, to: LeadStageName, reason?: string | null): string | null {
  if (!LEAD_STAGES.includes(to)) return `Unknown stage "${to}"`;
  if (from === to) return `The lead is already ${to}`;
  if (to === 'LOST' && !reason?.trim()) return 'Say why the lead was lost';
  return null;
}

/**
 * What a linked Client's status should become when its lead moves to `stage`,
 * or null to leave it alone. A lead only ever nudges a client forward from
 * LEAD to PROSPECT once we're talking to them. It never makes a client ACTIVE
 * (that happens when staff approve the client's onboarding) and never moves a
 * client backwards.
 */
export function clientStatusForStage(stage: LeadStageName, current: ClientStatusName): ClientStatusName | null {
  if (current !== 'LEAD') return null;
  if (stage === 'NEW' || stage === 'LOST') return null;
  return 'PROSPECT';
}

/** Where a new lead should start when it's created from an existing client. */
export function stageForClientStatus(status: ClientStatusName): LeadStageName {
  return status === 'LEAD' ? 'NEW' : 'CONTACTED';
}

/**
 * Start and end (exclusive) of the London calendar day containing `now`, as UTC
 * instants. Follow-ups are judged by the UK day, so a lead due "today" stays due
 * until midnight in London whatever the server's own time zone is.
 */
export function londonDay(now: Date = new Date()): { start: Date; end: Date } {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', year: 'numeric', month: '2-digit', day: '2-digit' })
      .formatToParts(now).map((p) => [p.type, p.value]),
  );
  const y = Number(parts.year), m = Number(parts.month), d = Number(parts.day);
  const offsetAt = (utcMs: number) => {
    const tz = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', timeZoneName: 'shortOffset' })
      .formatToParts(new Date(utcMs)).find((p) => p.type === 'timeZoneName')?.value ?? 'GMT';
    const mm = tz.match(/GMT([+-])(\d{1,2})(?::(\d{2}))?/);
    return mm ? (mm[1] === '-' ? -1 : 1) * (Number(mm[2]) * 60 + Number(mm[3] ?? 0)) : 0;
  };
  // Midnight London = midnight UTC minus London's offset at that moment.
  const startGuess = Date.UTC(y, m - 1, d);
  const start = startGuess - offsetAt(startGuess) * 60_000;
  const endGuess = Date.UTC(y, m - 1, d + 1);
  const end = endGuess - offsetAt(endGuess) * 60_000;
  return { start: new Date(start), end: new Date(end) };
}

export type FollowUpBucket = 'overdue' | 'today' | 'upcoming' | 'later' | 'none';

/** Which Today-list group an open lead's next follow-up falls in. `upcoming` = the next 7 days. */
export function followUpBucket(nextActionAt: Date | null, now: Date = new Date()): FollowUpBucket {
  if (!nextActionAt) return 'none';
  const { start, end } = londonDay(now);
  const t = nextActionAt.getTime();
  if (t < start.getTime()) return 'overdue';
  if (t < end.getTime()) return 'today';
  if (t < end.getTime() + 7 * 86_400_000) return 'upcoming';
  return 'later';
}
