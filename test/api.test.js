// HTTP-level tests for the app's REST API (node:test + fetch, no dependencies).
// The Cypress API feature covers the same contract from the test-suite side.

'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createApp } = require('../app/server');

// Same password as the app: from .env (`npm run setup`) or the environment.
try {
  process.loadEnvFile();
} catch {
  // no .env file: KATA_PASSWORD must come from the environment
}
const PASSWORD = process.env.KATA_PASSWORD;
assert.ok(PASSWORD, 'KATA_PASSWORD is not set. Run `npm run setup`.');

let server;
let base;

test.before(async () => {
  server = createApp({ testMode: true });
  await new Promise((resolve) => server.listen(0, resolve));
  base = `http://localhost:${server.address().port}`;
});

test.after(() => new Promise((resolve) => server.close(resolve)));

async function login(username) {
  const res = await fetch(`${base}/api/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password: PASSWORD }),
  });
  assert.equal(res.status, 200);
  return (await res.json()).token;
}

function call(path, { token, method = 'GET', body, headers = {} } = {}) {
  return fetch(`${base}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...headers,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

const payment = {
  debtorIban: 'BG80BNBG96611020345678',
  creditorIban: 'DE89370400440532013000',
  amount: '250.00',
  currency: 'EUR',
  reference: 'API test',
};

test.beforeEach(async () => {
  const res = await call('/api/test/reset', { method: 'POST' });
  assert.equal(res.status, 204);
});

test('health is public', async () => {
  const res = await call('/api/health');
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { status: 'ok' });
});

test('login: wrong password gives 401, right one sets an HttpOnly cookie', async () => {
  const bad = await call('/api/login', { method: 'POST', body: { username: 'maker1', password: 'nope' } });
  assert.equal(bad.status, 401);
  const good = await call('/api/login', { method: 'POST', body: { username: 'maker1', password: PASSWORD } });
  assert.equal(good.status, 200);
  assert.match(good.headers.get('set-cookie'), /session=.+; Path=\/; HttpOnly/);
});

test('login with {"cookie": false} returns a token but sets no cookie', async () => {
  const res = await call('/api/login', { method: 'POST', body: { username: 'checker1', password: PASSWORD, cookie: false } });
  assert.equal(res.status, 200);
  assert.equal(res.headers.get('set-cookie'), null);
  assert.ok((await res.json()).token);
});

test('reset clears payments but keeps sessions', async () => {
  const maker = await login('maker1');
  await call('/api/payments', { token: maker, method: 'POST', body: payment });
  await call('/api/test/reset', { method: 'POST' });
  const list = await call('/api/payments', { token: maker });
  assert.equal(list.status, 200);
  assert.deepEqual(await list.json(), []);
});

test('payments: no token gives 401', async () => {
  assert.equal((await call('/api/payments')).status, 401);
});

test('payments: maker creates (201 + Location), viewer cannot (403)', async () => {
  const maker = await login('maker1');
  const created = await call('/api/payments', { token: maker, method: 'POST', body: payment });
  assert.equal(created.status, 201);
  assert.equal(created.headers.get('location'), '/api/payments/PAY-0001');
  const viewer = await login('viewer1');
  assert.equal((await call('/api/payments', { token: viewer, method: 'POST', body: payment })).status, 403);
});

test('payments: invalid input gives 400 with the field', async () => {
  const maker = await login('maker1');
  const res = await call('/api/payments', { token: maker, method: 'POST', body: { ...payment, debtorIban: 'XX00' } });
  assert.equal(res.status, 400);
  assert.deepEqual((await res.json()).error, {
    code: 'VALIDATION_ERROR',
    message: 'Debtor IBAN is not valid',
    field: 'debtorIban',
  });
});

test('payments: an Idempotency-Key replay returns 200 and no duplicate', async () => {
  const maker = await login('maker1');
  const headers = { 'Idempotency-Key': 'abc-123' };
  const first = await call('/api/payments', { token: maker, method: 'POST', body: payment, headers });
  const second = await call('/api/payments', { token: maker, method: 'POST', body: payment, headers });
  assert.equal(first.status, 201);
  assert.equal(second.status, 200);
  assert.equal(second.headers.get('idempotent-replay'), 'true');
  const list = await (await call('/api/payments', { token: maker })).json();
  assert.equal(list.length, 1);
});

test('approve: same checker twice gives 409', async () => {
  const maker = await login('maker1');
  const checker = await login('checker1');
  await call('/api/payments', { token: maker, method: 'POST', body: { ...payment, amount: '2000000.00' } });
  assert.equal((await call('/api/payments/PAY-0001/approve', { token: checker, method: 'POST' })).status, 200);
  const again = await call('/api/payments/PAY-0001/approve', { token: checker, method: 'POST' });
  assert.equal(again.status, 409);
  assert.equal((await again.json()).error.code, 'ALREADY_APPROVED');
});

test('unknown payment gives 404, bad JSON gives 400', async () => {
  const maker = await login('maker1');
  assert.equal((await call('/api/payments/PAY-9999', { token: maker })).status, 404);
  const res = await fetch(`${base}/api/payments`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${maker}`, 'Content-Type': 'application/json' },
    body: '{not json',
  });
  assert.equal(res.status, 400);
});

test('reset endpoint is disabled outside test mode', async () => {
  const prod = createApp({ testMode: false });
  await new Promise((resolve) => prod.listen(0, resolve));
  const res = await fetch(`http://localhost:${prod.address().port}/api/test/reset`, { method: 'POST' });
  assert.equal(res.status, 404);
  await new Promise((resolve) => prod.close(resolve));
});

test('static: the UI is served, path traversal is not', async () => {
  const page = await fetch(`${base}/`);
  assert.equal(page.status, 200);
  assert.match(await page.text(), /Kata Payments/);
  const traversal = await fetch(`${base}/..%2fdomain.js`);
  assert.equal(traversal.status, 404);
});
