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
  for (const s of ['CONTACTED', 'QUALIFIED', 'QUOTED', 'WON'] as const) {
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
