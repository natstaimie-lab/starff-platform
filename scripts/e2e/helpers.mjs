// Shared helpers for the end-to-end API tests.
//
// These tests drive the REAL running API (http://localhost:3001/api/v1) with
// real Supabase-auth tokens for each role, assert results against the database,
// and clean up everything they create. Run the API first, then:
//   node --env-file=.env scripts/e2e/run.mjs
import { PrismaClient } from '@prisma/client';

export const p = new PrismaClient();
export const SUPABASE_URL = process.env.SUPABASE_URL;
export const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;
export const ANON = process.env.SUPABASE_ANON_KEY;
export const SECRET = process.env.WORDPRESS_WEBHOOK_SECRET;
// Target the local API by default; set E2E_API_BASE (e.g. the live Railway URL,
// including the /api/v1 prefix) to smoke-test a deployed environment instead.
export const API = process.env.E2E_API_BASE || `http://localhost:${process.env.API_PORT || 3001}/api/v1`;

export const log = (...a) => console.log(...a);
let PASS = true;
export const check = (label, ok) => { if (!ok) PASS = false; log(`   ${ok ? '✅' : '❌'} ${label}`); return ok; };
export const allPassed = () => PASS;

/** A fresh resource tracker so each flow can clean up exactly what it made. */
export const track = () => ({ authUsers: [], userIds: [], candidateIds: [], clientIds: [], jobIds: [], enquiryIds: [] });

/** Create a Supabase auth user + matching platform User row, return a bearer token. */
export async function makeUser(created, role, tag) {
  const stamp = Date.now() + Math.floor(Math.random() * 1e4);
  const email = `e2e-${tag}-${stamp}@starff.test`;
  const password = 'E2e-Test-' + Math.random().toString(36).slice(2, 10) + '!';
  const cr = await fetch(`${SUPABASE_URL}/auth/v1/admin/users`, {
    method: 'POST', headers: { apikey: SERVICE, Authorization: `Bearer ${SERVICE}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password, email_confirm: true }),
  }).then((r) => r.json());
  if (!cr.id) throw new Error(`auth user ${tag}: ${JSON.stringify(cr)}`);
  created.authUsers.push(cr.id);
  await p.user.upsert({ where: { id: cr.id }, create: { id: cr.id, email, role, isActive: true, firstName: 'E2E', lastName: tag }, update: { role, isActive: true } });
  const tok = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: 'POST', headers: { apikey: ANON, 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password }),
  }).then((r) => r.json());
  if (!tok.access_token) throw new Error(`no token for ${tag}`);
  return { id: cr.id, email, bearer: tok.access_token };
}

/** Authenticated request to the API. */
export const req = (path, bearer, method = 'POST', body) => fetch(`${API}${path}`, {
  method, headers: { Authorization: `Bearer ${bearer}`, 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined,
});

/** Public WordPress webhook call (shared-secret header, no login). */
export const webhook = (body, secret = SECRET) => fetch(`${API}/enquiries`, {
  method: 'POST', headers: { 'Content-Type': 'application/json', ...(secret ? { 'x-webhook-secret': secret } : {}) }, body: JSON.stringify(body),
});

/** Delete exactly what a flow created, in dependency order. Best-effort. */
export async function cleanup(created) {
  for (const jid of created.jobIds) {
    await p.timesheet.deleteMany({ where: { shift: { jobId: jid } } }).catch(() => {});
    await p.shift.deleteMany({ where: { jobId: jid } }).catch(() => {});
    await p.application.deleteMany({ where: { jobId: jid } }).catch(() => {});
    await p.job.delete({ where: { id: jid } }).catch(() => {});
  }
  for (const cid of created.candidateIds) {
    await p.reliabilityIncident.deleteMany({ where: { candidateId: cid } }).catch(() => {});
    await p.candidateDocument.deleteMany({ where: { candidateId: cid } }).catch(() => {});
    await p.timesheet.deleteMany({ where: { candidateId: cid } }).catch(() => {});
    await p.candidate.delete({ where: { id: cid } }).catch(() => {});
  }
  for (const clid of created.clientIds) {
    await p.clientContact.deleteMany({ where: { clientId: clid } }).catch(() => {});
    await p.client.delete({ where: { id: clid } }).catch(() => {});
  }
  if (created.enquiryIds.filter(Boolean).length) await p.enquiry.deleteMany({ where: { id: { in: created.enquiryIds.filter(Boolean) } } }).catch(() => {});
  for (const uid of [...created.userIds, ...created.authUsers]) {
    await p.user.delete({ where: { id: uid } }).catch(() => {});
  }
  for (const uid of created.authUsers) {
    await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${uid}`, { method: 'DELETE', headers: { apikey: SERVICE, Authorization: `Bearer ${SERVICE}` } }).catch(() => {});
  }
}
