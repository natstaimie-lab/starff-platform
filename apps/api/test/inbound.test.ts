/**
 * Inbound replies: webhook signature check, quoted-thread stripping, unsubscribe words, opt-out rule.
 * Run: node --test apps/api/test/inbound.test.ts   (Node 22.18+)
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { verifySvix } from '../src/leads/svix.ts';
import { UNSUBSCRIBE_RX, optedOut, stripQuoted } from '../src/leads/lead-stages.ts';

const key = Buffer.from('test-secret-for-starff-inbound-123');
const secret = `whsec_${key.toString('base64')}`;
const sign = (id: string, ts: string, body: string) => `v1,${createHmac('sha256', key).update(`${id}.${ts}.${body}`).digest('base64')}`;

test('svix: a correctly signed webhook passes', () => {
  const ts = String(Math.floor(Date.now() / 1000));
  const body = '{"type":"email.received","data":{"email_id":"abc"}}';
  assert.equal(verifySvix(secret, body, { id: 'msg_1', timestamp: ts, signature: sign('msg_1', ts, body) }), true);
  // several signatures, one valid
  assert.equal(verifySvix(secret, body, { id: 'msg_1', timestamp: ts, signature: `v1,AAAA ${sign('msg_1', ts, body)}` }), true);
});

test('svix: tampered body, wrong secret, old timestamp or missing headers fail', () => {
  const ts = String(Math.floor(Date.now() / 1000));
  const body = '{"a":1}';
  const sig = sign('m', ts, body);
  assert.equal(verifySvix(secret, '{"a":2}', { id: 'm', timestamp: ts, signature: sig }), false);
  assert.equal(verifySvix(`whsec_${Buffer.from('other').toString('base64')}`, body, { id: 'm', timestamp: ts, signature: sig }), false);
  const old = String(Math.floor(Date.now() / 1000) - 3600);
  assert.equal(verifySvix(secret, body, { id: 'm', timestamp: old, signature: sign('m', old, body) }), false);
  assert.equal(verifySvix(secret, body, { id: 'm', timestamp: ts }), false);
  assert.equal(verifySvix('', body, { id: 'm', timestamp: ts, signature: sig }), false);
});

test('stripQuoted keeps only the new text', () => {
  const reply = 'Yes please, can you send a quote for 4 pickers?\n\nThanks\nSam\n\nOn Mon, 16 Nov 2026 at 10:00, Starff <hello@starff.co.uk> wrote:\n> Hi Sam,\n> Following up...';
  assert.equal(stripQuoted(reply), 'Yes please, can you send a quote for 4 pickers?\n\nThanks\nSam');
  assert.equal(stripQuoted('Not now thanks\n-----Original Message-----\nFrom: Starff'), 'Not now thanks');
  assert.equal(stripQuoted('Call me\n> quoted\n> more'), 'Call me');
  assert.equal(stripQuoted('Hello\r\n\r\nFrom: Starff <hello@starff.co.uk>\r\nSent: Monday'), 'Hello');
});

test('unsubscribe words are caught, normal replies are not', () => {
  for (const t of ['Please unsubscribe me', 'Remove me from your list', 'stop emailing me', "Don't email me again", 'opt out', 'No more emails please']) assert.ok(UNSUBSCRIBE_RX.test(t), t);
  for (const t of ['Yes, send a quote', 'Not right now, try in January', 'We already use an agency', 'Can you remove the minimum hours?']) assert.ok(!UNSUBSCRIBE_RX.test(t), t);
});

test('optedOut: unsubscribed, or Lost with an unsubscribe reason', () => {
  assert.equal(optedOut({ stage: 'CONTACTED', lostReason: null, unsubscribedAt: new Date() }), true);
  assert.equal(optedOut({ stage: 'LOST', lostReason: 'Asked to unsubscribe' }), true);
  assert.equal(optedOut({ stage: 'LOST', lostReason: 'Went with another agency' }), false);
  assert.equal(optedOut({ stage: 'NEW', lostReason: null, unsubscribedAt: null }), false);
});
