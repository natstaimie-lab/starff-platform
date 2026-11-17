/**
 * Apollo prospecting helpers: ISO week key, domain tidy-up, contact choice, duplicate check, weekly cap.
 * Run: node --test apps/api/test/prospecting.test.ts   (Node 22.18+)
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { alreadyKnown, isoWeekKey, normaliseDomain, pickContact, roomLeft, titleRank } from '../src/leads/prospecting.ts';
import { normaliseCompany } from '../src/leads/client-match.ts';

test('ISO week key follows London days and ISO year rules', () => {
  assert.equal(isoWeekKey(new Date('2026-11-17T12:00:00Z')), '2026-W47');
  assert.equal(isoWeekKey(new Date('2026-11-16T00:30:00Z')), '2026-W47'); // Monday
  assert.equal(isoWeekKey(new Date('2026-11-15T23:30:00Z')), '2026-W46'); // Sunday night
  assert.equal(isoWeekKey(new Date('2027-01-01T12:00:00Z')), '2026-W53'); // Friday belongs to 2026's last week
  assert.equal(isoWeekKey(new Date('2026-06-28T23:30:00Z')), '2026-W27'); // 00:30 BST Monday
});

test('domains are tidied', () => {
  assert.equal(normaliseDomain('https://www.Acme.co.uk/jobs?x=1'), 'acme.co.uk');
  assert.equal(normaliseDomain('acme.com'), 'acme.com');
  assert.equal(normaliseDomain(null), '');
});

test('the best manager is picked, assistants are not', () => {
  assert.ok(titleRank('Operations Manager') < titleRank('Warehouse Manager'));
  assert.ok(titleRank('Assistant Warehouse Manager') >= 50);
  assert.ok(titleRank('Head of Site Operations') < 50);
  assert.ok(titleRank('Software Engineer') >= 50);
  const pick = pickContact([
    { id: 'a', title: 'Finance Director', has_email: true },
    { id: 'b', title: 'Warehouse Manager', has_email: false },
    { id: 'c', title: 'Warehouse Manager', has_email: true },
    { id: 'd', title: 'Assistant Operations Manager', has_email: true },
  ]);
  assert.equal(pick?.id, 'c');
  assert.equal(pickContact([{ id: 'x', title: 'Chef', has_email: true }]), null);
});

test('known companies are skipped by domain or name', () => {
  const known = { domains: new Set(['acme.co.uk']), names: new Set(['riverside warehouse']) };
  assert.ok(alreadyKnown({ name: 'New Name', website_url: 'https://www.acme.co.uk' }, known, normaliseCompany));
  assert.ok(alreadyKnown({ name: 'Riverside Warehouse Ltd' }, known, normaliseCompany));
  assert.ok(!alreadyKnown({ name: 'Brand New Logistics', primary_domain: 'bnl.com' }, known, normaliseCompany));
});

test('weekly cap', () => {
  assert.equal(roomLeft(20, 0), 20);
  assert.equal(roomLeft(20, 18), 2);
  assert.equal(roomLeft(20, 25), 0);
});
