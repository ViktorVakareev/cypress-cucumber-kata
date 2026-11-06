// Domain rules for the Kata Payments app: pure functions plus an in-memory store.
// No dependencies, so the rules can be unit-tested with node:test.

'use strict';

const crypto = require('node:crypto');

// ---------------------------------------------------------------------------
// Users. Demo only: every user shares one password, read from the KATA_PASSWORD
// environment variable (local .env file, never committed). Not production practice.
// ---------------------------------------------------------------------------
const USERS = {
  maker1: { username: 'maker1', role: 'maker' },
  maker2: { username: 'maker2', role: 'maker' },
  checker1: { username: 'checker1', role: 'checker' },
  checker2: { username: 'checker2', role: 'checker' },
  viewer1: { username: 'viewer1', role: 'viewer' },
};

function demoPassword() {
  const password = process.env.KATA_PASSWORD;
  if (!password) throw new Error('KATA_PASSWORD is not set. Run `npm run setup`.');
  return password;
}

// ---------------------------------------------------------------------------
// Money. Amounts travel as decimal strings ("1000.50") and are stored as
// integer minor units, so there is never any floating-point arithmetic.
// ---------------------------------------------------------------------------
const CURRENCIES = { EUR: 2, USD: 2, GBP: 2, JPY: 0 }; // currency -> decimal places
const MAX_MAJOR_UNITS = 10_000_000; // 10,000,000.00 is the largest allowed amount
const SECOND_APPROVAL_MAJOR_UNITS = 1_000_000; // >= this needs two checkers

class ValidationError extends Error {
  constructor(field, message) {
    super(message);
    this.field = field;
  }
}

/** Parse "1234.50" into minor units for the given currency, or throw ValidationError. */
function parseAmount(amount, currency) {
  const decimals = CURRENCIES[currency];
  if (decimals === undefined) {
    throw new ValidationError('currency', `Unsupported currency: ${currency}`);
  }
  if (typeof amount !== 'string') {
    throw new ValidationError('amount', 'Amount must be a decimal string, e.g. "100.00"');
  }
  const pattern = decimals === 0 ? /^\d{1,10}$/ : new RegExp(`^\\d{1,10}(\\.\\d{1,${decimals}})?$`);
  if (!pattern.test(amount)) {
    throw new ValidationError(
      'amount',
      decimals === 0
        ? `${currency} amounts have no decimal places`
        : `Amount must have at most ${decimals} decimal places`,
    );
  }
  const [whole, fraction = ''] = amount.split('.');
  const minor = Number(whole) * 10 ** decimals + Number(fraction.padEnd(decimals, '0') || 0);
  if (minor <= 0) {
    throw new ValidationError('amount', 'Amount must be greater than zero');
  }
  if (minor > MAX_MAJOR_UNITS * 10 ** decimals) {
    throw new ValidationError('amount', 'Amount must not exceed 10,000,000');
  }
  return minor;
}

/** Format minor units back into a decimal string with the currency's precision. */
function formatAmount(minor, currency) {
  const decimals = CURRENCIES[currency];
  if (decimals === 0) return String(minor);
  const s = String(minor).padStart(decimals + 1, '0');
  return `${s.slice(0, -decimals)}.${s.slice(-decimals)}`;
}

// ---------------------------------------------------------------------------
// IBAN: length 15-34, two letters, two check digits, mod-97 must equal 1.
// ---------------------------------------------------------------------------
function normaliseIban(iban) {
  return String(iban ?? '').replace(/\s+/g, '').toUpperCase();
}

function isValidIban(iban) {
  const value = normaliseIban(iban);
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]{11,30}$/.test(value)) return false;
  const rearranged = value.slice(4) + value.slice(0, 4);
  const digits = rearranged.replace(/[A-Z]/g, (ch) => String(ch.charCodeAt(0) - 55));
  // Mod-97 on a long digit string, processed in chunks to stay within Number precision.
  let remainder = 0;
  for (let i = 0; i < digits.length; i += 7) {
    remainder = Number(String(remainder) + digits.slice(i, i + 7)) % 97;
  }
  return remainder === 1;
}

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------
class DomainError extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

function createStore() {
  let payments = new Map();
  let idempotency = new Map(); // `${username}:${key}` -> payment id
  let nextNumber = 1;

  function reset() {
    payments = new Map();
    idempotency = new Map();
    nextNumber = 1;
  }

  function toView(p) {
    return {
      id: p.id,
      debtorIban: p.debtorIban,
      creditorIban: p.creditorIban,
      amount: formatAmount(p.minor, p.currency),
      currency: p.currency,
      reference: p.reference,
      status: p.status,
      createdBy: p.createdBy,
      approvals: [...p.approvals],
      requiresSecondApproval: p.requiresSecondApproval,
      createdAt: p.createdAt,
    };
  }

  function list() {
    return [...payments.values()].map(toView);
  }

  function get(id) {
    const p = payments.get(id);
    if (!p) throw new DomainError(404, 'NOT_FOUND', `Payment ${id} not found`);
    return toView(p);
  }

  /** Returns { payment, replayed }. */
  function create(user, body, idempotencyKey) {
    if (user.role !== 'maker') {
      throw new DomainError(403, 'FORBIDDEN', 'Only makers can create payments');
    }
    if (idempotencyKey) {
      const existingId = idempotency.get(`${user.username}:${idempotencyKey}`);
      if (existingId) return { payment: toView(payments.get(existingId)), replayed: true };
    }
    const b = body ?? {};
    if (!isValidIban(b.debtorIban)) throw new ValidationError('debtorIban', 'Debtor IBAN is not valid');
    if (!isValidIban(b.creditorIban)) throw new ValidationError('creditorIban', 'Creditor IBAN is not valid');
    if (normaliseIban(b.debtorIban) === normaliseIban(b.creditorIban)) {
      throw new ValidationError('creditorIban', 'Creditor IBAN must differ from debtor IBAN');
    }
    const currency = String(b.currency ?? '');
    const minor = parseAmount(b.amount, currency);
    const reference = String(b.reference ?? '').trim();
    if (reference.length === 0 || reference.length > 35) {
      throw new ValidationError('reference', 'Reference is required (max 35 characters)');
    }

    const id = `PAY-${String(nextNumber++).padStart(4, '0')}`;
    const payment = {
      id,
      debtorIban: normaliseIban(b.debtorIban),
      creditorIban: normaliseIban(b.creditorIban),
      minor,
      currency,
      reference,
      status: 'Submitted',
      createdBy: user.username,
      approvals: [],
      requiresSecondApproval: minor >= SECOND_APPROVAL_MAJOR_UNITS * 10 ** CURRENCIES[currency],
      createdAt: new Date().toISOString(),
    };
    payments.set(id, payment);
    if (idempotencyKey) idempotency.set(`${user.username}:${idempotencyKey}`, id);
    return { payment: toView(payment), replayed: false };
  }

  function approve(user, id) {
    const p = payments.get(id);
    if (!p) throw new DomainError(404, 'NOT_FOUND', `Payment ${id} not found`);
    if (user.role !== 'checker') {
      throw new DomainError(403, 'FORBIDDEN', 'Only checkers can approve payments');
    }
    if (!['Submitted', 'Awaiting second approval'].includes(p.status)) {
      throw new DomainError(409, 'INVALID_STATE', `A payment in status "${p.status}" cannot be approved`);
    }
    if (p.approvals.includes(user.username)) {
      throw new DomainError(409, 'ALREADY_APPROVED', 'The same checker cannot approve twice');
    }
    p.approvals.push(user.username);
    p.status = p.requiresSecondApproval && p.approvals.length < 2 ? 'Awaiting second approval' : 'Approved';
    return toView(p);
  }

  function reject(user, id) {
    const p = payments.get(id);
    if (!p) throw new DomainError(404, 'NOT_FOUND', `Payment ${id} not found`);
    if (user.role !== 'checker') {
      throw new DomainError(403, 'FORBIDDEN', 'Only checkers can reject payments');
    }
    if (!['Submitted', 'Awaiting second approval'].includes(p.status)) {
      throw new DomainError(409, 'INVALID_STATE', `A payment in status "${p.status}" cannot be rejected`);
    }
    p.status = 'Rejected';
    return toView(p);
  }

  return { reset, list, get, create, approve, reject };
}

// ---------------------------------------------------------------------------
// Sessions: random token -> user, kept in memory.
// ---------------------------------------------------------------------------
function createSessions() {
  const sessions = new Map();
  return {
    login(username, password) {
      const user = USERS[username];
      if (!user || password !== demoPassword()) return null;
      const token = crypto.randomUUID();
      sessions.set(token, { username: user.username, role: user.role });
      return { token, user: { username: user.username, role: user.role } };
    },
    find(token) {
      return token ? sessions.get(token) ?? null : null;
    },
    logout(token) {
      sessions.delete(token);
    },
    clear() {
      sessions.clear();
    },
  };
}

module.exports = {
  USERS,
  CURRENCIES,
  ValidationError,
  DomainError,
  parseAmount,
  formatAmount,
  isValidIban,
  normaliseIban,
  createStore,
  createSessions,
};
