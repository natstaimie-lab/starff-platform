/**
 * Lead pipeline rules — plain functions so they can be tested without a DB.
 * Kept free of @prisma/client imports (string unions match the Prisma enums)
 * so `node --test` can load this file directly.
 */

export const LEAD_STAGES = ['NEW', 'CONTACTED', 'QUALIFIED', 'QUOTED', 'WON', 'LOST'] as const;
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
