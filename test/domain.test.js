// Unit tests for the app's business rules (node:test, no dependencies).
// These guard the app itself, so the Cypress suite tests a known-good target.

'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { parseAmount, formatAmount, isValidIban, createStore } = require('../app/domain');

const maker = { username: 'maker1', role: 'maker' };
const checker1 = { username: 'checker1', role: 'checker' };
const checker2 = { username: 'checker2', role: 'checker' };
const viewer = { username: 'viewer1', role: 'viewer' };

const valid = {
  debtorIban: 'BG80BNBG96611020345678',
  creditorIban: 'DE89370400440532013000',
  amount: '100.00',
  currency: 'EUR',
  reference: 'Invoice 42',
};

test('IBAN: valid examples pass, a changed digit fails', () => {
  assert.equal(isValidIban('BG80BNBG96611020345678'), true);
  assert.equal(isValidIban('DE89 3704 0044 0532 0130 00'), true); // spaces allowed
  assert.equal(isValidIban('GB82WEST12345698765432'), true);
  assert.equal(isValidIban('DE89370400440532013001'), false);
  assert.equal(isValidIban('not-an-iban'), false);
  assert.equal(isValidIban(''), false);
});

test('amount: boundaries in minor units, no floating point', () => {
  assert.equal(parseAmount('0.01', 'EUR'), 1);
  assert.equal(parseAmount('10000000.00', 'EUR'), 1_000_000_000);
  assert.equal(parseAmount('0.1', 'EUR'), 10);
  assert.equal(parseAmount('1500', 'JPY'), 1500);
  assert.throws(() => parseAmount('0.00', 'EUR'), /greater than zero/);
  assert.throws(() => parseAmount('10000000.01', 'EUR'), /must not exceed/);
  assert.throws(() => parseAmount('1.005', 'EUR'), /at most 2 decimal/);
  assert.throws(() => parseAmount('1.5', 'JPY'), /no decimal places/);
  assert.throws(() => parseAmount('100', 'XYZ'), /Unsupported currency/);
  assert.throws(() => parseAmount(100, 'EUR'), /decimal string/);
});

test('amount: formatting keeps the currency precision', () => {
  assert.equal(formatAmount(1, 'EUR'), '0.01');
  assert.equal(formatAmount(123456, 'EUR'), '1234.56');
  assert.equal(formatAmount(1500, 'JPY'), '1500');
});

test('create: maker creates a Submitted payment with a sequential id', () => {
  const store = createStore();
  const { payment } = store.create(maker, valid);
  assert.equal(payment.id, 'PAY-0001');
  assert.equal(payment.status, 'Submitted');
  assert.equal(payment.amount, '100.00');
  assert.equal(payment.requiresSecondApproval, false);
});

test('create: only makers, valid IBANs, different accounts, reference required', () => {
  const store = createStore();
  assert.throws(() => store.create(viewer, valid), /Only makers/);
  assert.throws(() => store.create(maker, { ...valid, creditorIban: 'DE89370400440532013001' }), /Creditor IBAN is not valid/);
  assert.throws(() => store.create(maker, { ...valid, creditorIban: valid.debtorIban }), /must differ/);
  assert.throws(() => store.create(maker, { ...valid, reference: '  ' }), /Reference is required/);
});

test('idempotency: the same key from the same user returns the same payment', () => {
  const store = createStore();
  const first = store.create(maker, valid, 'key-1');
  const second = store.create(maker, valid, 'key-1');
  assert.equal(second.replayed, true);
  assert.equal(second.payment.id, first.payment.id);
  assert.equal(store.list().length, 1);
});

test('maker-checker: small payment needs one checker', () => {
  const store = createStore();
  const { payment } = store.create(maker, valid);
  assert.equal(store.approve(checker1, payment.id).status, 'Approved');
});

test('maker-checker: 1,000,000.00 or more needs two different checkers', () => {
  const store = createStore();
  const { payment } = store.create(maker, { ...valid, amount: '1000000.00' });
  assert.equal(payment.requiresSecondApproval, true);
  assert.equal(store.approve(checker1, payment.id).status, 'Awaiting second approval');
  assert.throws(() => store.approve(checker1, payment.id), /cannot approve twice/);
  assert.equal(store.approve(checker2, payment.id).status, 'Approved');
});

test('maker-checker: 999,999.99 needs only one checker (boundary)', () => {
  const store = createStore();
  const { payment } = store.create(maker, { ...valid, amount: '999999.99' });
  assert.equal(store.approve(checker1, payment.id).status, 'Approved');
});

test('state: approved or rejected payments cannot change again', () => {
  const store = createStore();
  const { payment } = store.create(maker, valid);
  store.reject(checker1, payment.id);
  assert.throws(() => store.approve(checker2, payment.id), /cannot be approved/);
  assert.throws(() => store.reject(checker2, payment.id), /cannot be rejected/);
});

test('roles: makers cannot approve', () => {
  const store = createStore();
  const { payment } = store.create(maker, valid);
  assert.throws(() => store.approve(maker, payment.id), /Only checkers/);
});
