// Kata Payments UI: plain JavaScript, no framework.
// Every element a test needs has a data-cy attribute.

const $ = (selector) => document.querySelector(selector);
let currentUser = null;

async function api(path, options = {}) {
  const response = await fetch(path, {
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json', ...(options.headers ?? {}) },
    ...options,
  });
  const text = await response.text();
  const body = text ? JSON.parse(text) : null;
  if (!response.ok) {
    const error = new Error(body?.error?.message ?? `Request failed (${response.status})`);
    error.status = response.status;
    throw error;
  }
  return body;
}

function show(selector, visible) {
  $(selector).hidden = !visible;
}

function formatAmount(amount, currency) {
  const [whole, fraction] = amount.split('.');
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return `${fraction === undefined ? grouped : `${grouped}.${fraction}`} ${currency}`;
}

function showBanner(message) {
  const banner = $('[data-cy=error-banner]');
  banner.textContent = message;
  banner.hidden = !message;
}

// ---------------------------------------------------------------------------
// Views
// ---------------------------------------------------------------------------
function showLogin() {
  currentUser = null;
  show('#login-view', true);
  show('#payments-view', false);
  show('[data-cy=current-user]', false);
  show('[data-cy=logout]', false);
}

async function showPayments(user) {
  currentUser = user;
  show('#login-view', false);
  show('#payments-view', true);
  $('[data-cy=current-user]').textContent = `${user.username} (${user.role})`;
  show('[data-cy=current-user]', true);
  show('[data-cy=logout]', true);
  show('[data-cy=new-payment]', user.role === 'maker');
  await loadPayments();
}

async function loadPayments() {
  showBanner('');
  show('[data-cy=loading]', true);
  show('[data-cy=payments-table]', false);
  show('[data-cy=empty]', false);
  try {
    const payments = await api('/api/payments');
    renderPayments(payments);
  } catch (error) {
    showBanner(`Could not load payments: ${error.message}`);
  } finally {
    show('[data-cy=loading]', false);
  }
}

function renderPayments(payments) {
  const body = $('[data-cy=payments-body]');
  body.innerHTML = '';
  show('[data-cy=empty]', payments.length === 0);
  show('[data-cy=payments-table]', payments.length > 0);

  for (const p of payments) {
    const row = document.createElement('tr');
    row.dataset.cy = 'payment-row';
    row.dataset.id = p.id;
    const actionable = ['Submitted', 'Awaiting second approval'].includes(p.status);
    const canAct = currentUser?.role === 'checker' && actionable;
    row.innerHTML = `
      <td data-cy="payment-id"></td>
      <td data-cy="payment-reference"></td>
      <td data-cy="payment-amount" class="num"></td>
      <td data-cy="payment-status"></td>
      <td data-cy="payment-created-by"></td>
      <td class="actions">${canAct
        ? '<button type="button" data-cy="approve">Approve</button> <button type="button" class="secondary" data-cy="reject">Reject</button>'
        : ''}</td>`;
    // textContent, not innerHTML, for user-supplied values (no HTML injection).
    row.querySelector('[data-cy=payment-id]').textContent = p.id;
    row.querySelector('[data-cy=payment-reference]').textContent = p.reference;
    row.querySelector('[data-cy=payment-amount]').textContent = formatAmount(p.amount, p.currency);
    row.querySelector('[data-cy=payment-status]').textContent = p.status;
    row.querySelector('[data-cy=payment-created-by]').textContent = p.createdBy;
    body.appendChild(row);
  }
}

// ---------------------------------------------------------------------------
// Events
// ---------------------------------------------------------------------------
$('#login-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const loginError = $('[data-cy=login-error]');
  loginError.hidden = true;
  try {
    const user = await api('/api/login', {
      method: 'POST',
      body: JSON.stringify({ username: $('#username').value.trim(), password: $('#password').value }),
    });
    $('#password').value = '';
    await showPayments(user);
  } catch (error) {
    loginError.textContent = error.message;
    loginError.hidden = false;
  }
});

$('[data-cy=logout]').addEventListener('click', async () => {
  await api('/api/logout', { method: 'POST' }).catch(() => {});
  showLogin();
});

$('#payment-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const formError = $('[data-cy=form-error]');
  formError.hidden = true;
  const form = event.target;
  const data = Object.fromEntries(new FormData(form).entries());
  try {
    await api('/api/payments', { method: 'POST', body: JSON.stringify(data) });
    form.reset();
    await loadPayments();
  } catch (error) {
    formError.textContent = error.message;
    formError.hidden = false;
  }
});

$('[data-cy=payments-body]').addEventListener('click', async (event) => {
  const button = event.target.closest('button[data-cy]');
  if (!button) return;
  const id = button.closest('tr').dataset.id;
  const action = button.dataset.cy; // "approve" or "reject"
  button.disabled = true;
  try {
    await api(`/api/payments/${id}/${action}`, { method: 'POST' });
    await loadPayments();
  } catch (error) {
    showBanner(error.message);
    button.disabled = false;
  }
});

// ---------------------------------------------------------------------------
// Start: already logged in (cookie) -> payments, otherwise -> login.
// ---------------------------------------------------------------------------
api('/api/me').then(showPayments).catch(showLogin);
