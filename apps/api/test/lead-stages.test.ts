/**
 * Lead pipeline rules.
 * Run: node --test apps/api/test/lead-stages.test.ts   (Node 22.18+)
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { clientStatusForStage, stageChangeError, stageForClientStatus } from '../src/leads/lead-stages.ts';

test('any real move is allowed, including reopening', () => {
  assert.equal(stageChangeError('NEW', 'CONTACTED'), null);
  assert.equal(stageChangeError('NEW', 'QUOTED'), null);
  assert.equal(stageChangeError('WON', 'QUALIFIED'), null);
  assert.equal(stageChangeError('LOST', 'NEW'), null);
});

test('staying put is refused', () => {
  assert.match(stageChangeError('QUOTED', 'QUOTED')!, /already/);
});

test('LOST needs a reason', () => {
  assert.match(stageChangeError('CONTACTED', 'LOST')!, /why/);
  assert.match(stageChangeError('CONTACTED', 'LOST', '   ')!, /why/);
  assert.equal(stageChangeError('CONTACTED', 'LOST', 'Went with another agency'), null);
});

test('unknown stage is refused', () => {
  assert.match(stageChangeError('NEW', 'MAYBE' as never)!, /Unknown/);
});

test('linked client: LEAD becomes PROSPECT once we are talking', () => {
  for (const s of ['CONTACTED', 'QUALIFIED', 'QUOTED', 'READY_TO_CLOSE', 'WON'] as const) {
    assert.equal(clientStatusForStage(s, 'LEAD'), 'PROSPECT', s);
  }
  assert.equal(clientStatusForStage('NEW', 'LEAD'), null);
  assert.equal(clientStatusForStage('LOST', 'LEAD'), null);
});

test('linked client: never made ACTIVE, never moved backwards', () => {
  for (const c of ['PROSPECT', 'ACTIVE', 'ON_HOLD', 'CLOSED'] as const) {
    assert.equal(clientStatusForStage('WON', c), null, c);
    assert.equal(clientStatusForStage('LOST', c), null, c);
  }
});

test('lead from a client starts NEW for LEAD clients, CONTACTED otherwise', () => {
  assert.equal(stageForClientStatus('LEAD'), 'NEW');
  assert.equal(stageForClientStatus('PROSPECT'), 'CONTACTED');
  assert.equal(stageForClientStatus('ACTIVE'), 'CONTACTED');
});

import { followUpBucket, londonDay } from '../src/leads/lead-stages.ts';

test('London day in winter (GMT) is midnight to midnight UTC', () => {
  const { start, end } = londonDay(new Date('2026-11-16T10:00:00Z'));
  assert.equal(start.toISOString(), '2026-11-16T00:00:00.000Z');
  assert.equal(end.toISOString(), '2026-11-17T00:00:00.000Z');
});

test('London day in summer (BST) starts at 23:00 UTC the day before', () => {
  const { start, end } = londonDay(new Date('2026-07-01T23:30:00Z')); // 00:30 on 2 July in London
  assert.equal(start.toISOString(), '2026-07-01T23:00:00.000Z');
  assert.equal(end.toISOString(), '2026-07-02T23:00:00.000Z');
});

test('follow-up buckets: overdue, today, next 7 days, later, none', () => {
  const now = new Date('2026-11-16T15:00:00Z');
  assert.equal(followUpBucket(new Date('2026-11-15T00:00:00Z'), now), 'overdue');
  assert.equal(followUpBucket(new Date('2026-11-16T00:00:00Z'), now), 'today'); // date picked as "16 Nov"
  assert.equal(followUpBucket(new Date('2026-11-16T23:59:00Z'), now), 'today');
  assert.equal(followUpBucket(new Date('2026-11-17T00:00:00Z'), now), 'upcoming');
  assert.equal(followUpBucket(new Date('2026-11-23T23:00:00Z'), now), 'upcoming');
  assert.equal(followUpBucket(new Date('2026-11-24T00:00:00Z'), now), 'later');
  assert.equal(followUpBucket(null, now), 'none');
});

test('a date picked in summer still counts as that London day', () => {
  // Date inputs save midnight UTC = 01:00 in London, still the same day.
  const now = new Date('2026-07-02T08:00:00Z');
  assert.equal(followUpBucket(new Date('2026-07-02T00:00:00Z'), now), 'today');
  assert.equal(followUpBucket(new Date('2026-07-01T00:00:00Z'), now), 'overdue');
});
