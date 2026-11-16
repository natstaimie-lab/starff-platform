/**
 * Duplicate check used by "Convert to client".
 * Run: node --test apps/api/test/client-match.test.ts   (Node 22.18+)
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { findClientMatches, normaliseCompany, sameCompany } from '../src/leads/client-match.ts';

test('company names are tidied before comparing', () => {
  assert.equal(normaliseCompany('The Riverside Warehouse Co. Ltd'), 'riverside warehouse');
  assert.equal(normaliseCompany('RIVERSIDE WAREHOUSE LIMITED'), 'riverside warehouse');
  assert.equal(normaliseCompany('Smith & Sons (UK) PLC'), 'smith sons');
  assert.equal(normaliseCompany('Café Nero Group'), 'cafe nero');
  assert.equal(normaliseCompany(null), '');
});

test('same company despite legal endings, case and punctuation', () => {
  assert.ok(sameCompany('Bestway Wholesale Ltd', 'bestway wholesale limited'));
  assert.ok(sameCompany('Smith & Sons', 'Smith and Sons Ltd'));
  assert.ok(sameCompany('TEST – Riverside Warehouse Ltd', 'Test Riverside Warehouse'));
});

test('different companies do not match', () => {
  assert.ok(!sameCompany('Bestway Wholesale', 'Bestway Logistics'));
  assert.ok(!sameCompany('Riverside Warehouse', 'Riverside Warehousing'));
  assert.ok(!sameCompany('Ltd', 'Limited')); // nothing left after tidying
  assert.ok(!sameCompany('AB Ltd', 'AB Limited')); // too short to trust
});

const clients = [
  { id: 'c1', name: 'Amazon Logistics UK Ltd', billingEmail: 'ap@amazon.example', contactEmails: ['rachel@amazon.example'] },
  { id: 'c2', name: 'Riverside Warehouse Ltd', billingEmail: null, contactEmails: ['ops@other.example'] },
  { id: 'c3', name: 'Shocal London', billingEmail: 'sarah@riverside.example', contactEmails: [] },
];

test('matches on contact email, billing email or company name', () => {
  assert.deepEqual(findClientMatches({ companyName: 'Amazon Logistics', email: 'RACHEL@amazon.example ' }, clients), [{ clientId: 'c1', reasons: ['email', 'company'] }]);
  assert.deepEqual(findClientMatches({ companyName: 'New Co', email: 'ap@amazon.example' }, clients), [{ clientId: 'c1', reasons: ['email'] }]);
  assert.deepEqual(findClientMatches({ companyName: 'Brand New Ltd', email: 'x@y.example' }, clients), []);
});

test('email matches are listed before name-only matches', () => {
  const m = findClientMatches({ companyName: 'Riverside Warehouse', email: 'sarah@riverside.example' }, clients);
  assert.deepEqual(m.map((x) => x.clientId), ['c3', 'c2']);
});
