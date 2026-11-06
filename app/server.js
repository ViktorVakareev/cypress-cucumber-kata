// Kata Payments: the small application under test.
// Plain Node.js http server, no dependencies: serves the single-page UI from
// app/public and a JSON REST API under /api.
//
//   node app/server.js               -> http://localhost:3000
//   node app/server.js --test-mode   -> also enables POST /api/test/reset (clears payments)
//   PORT=4000 node app/server.js     -> another port
// The demo password is read from KATA_PASSWORD (.env, created by `npm run setup`).

'use strict';

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { createStore, createSessions, ValidationError, DomainError } = require('./domain');

const PUBLIC_DIR = path.join(__dirname, 'public');
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
};

function createApp({ testMode = false } = {}) {
  const store = createStore();
  const sessions = createSessions();

  function send(res, status, body, headers = {}) {
    const payload = body === undefined ? '' : JSON.stringify(body);
    res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', ...headers });
    res.end(payload);
  }

  function sendError(res, status, code, message, field) {
    send(res, status, { error: { code, message, ...(field ? { field } : {}) } });
  }

  function readJson(req) {
    return new Promise((resolve, reject) => {
      let raw = '';
      req.on('data', (chunk) => {
        raw += chunk;
        if (raw.length > 100_000) reject(new DomainError(413, 'TOO_LARGE', 'Request body too large'));
      });
      req.on('end', () => {
        if (!raw) return resolve({});
        try {
          resolve(JSON.parse(raw));
        } catch {
          reject(new DomainError(400, 'BAD_JSON', 'Request body is not valid JSON'));
        }
      });
      req.on('error', reject);
    });
  }

  function tokenFrom(req) {
    const auth = req.headers.authorization ?? '';
    if (auth.startsWith('Bearer ')) return auth.slice(7);
    const cookie = req.headers.cookie ?? '';
    const match = cookie.match(/(?:^|;\s*)session=([^;]+)/);
    return match ? decodeURIComponent(match[1]) : null;
  }

  function requireUser(req) {
    const user = sessions.find(tokenFrom(req));
    if (!user) throw new DomainError(401, 'UNAUTHENTICATED', 'Log in first');
    return user;
  }

  async function handleApi(req, res, url) {
    const { pathname } = url;
    const method = req.method;

    if ((method === 'GET' || method === 'HEAD') && pathname === '/api/health') return send(res, 200, { status: 'ok' });

    if (method === 'POST' && pathname === '/api/test/reset') {
      if (!testMode) return sendError(res, 404, 'NOT_FOUND', 'Not found');
      // Clears payments only. Sessions survive, so cy.session() can cache logins across tests.
      store.reset();
      return send(res, 204);
    }

    if (method === 'POST' && pathname === '/api/login') {
      const body = await readJson(req);
      const result = sessions.login(body.username, body.password);
      if (!result) return sendError(res, 401, 'INVALID_CREDENTIALS', 'Username or password is incorrect');
      // Browsers get an HttpOnly cookie. API clients can send {"cookie": false} and use the
      // returned token as "Authorization: Bearer <token>" instead.
      const headers = body.cookie === false
        ? {}
        : { 'Set-Cookie': `session=${result.token}; Path=/; HttpOnly; SameSite=Strict` };
      return send(res, 200, { ...result.user, token: result.token }, headers);
    }

    if (method === 'POST' && pathname === '/api/logout') {
      sessions.logout(tokenFrom(req));
      return send(res, 204, undefined, { 'Set-Cookie': 'session=; Path=/; HttpOnly; Max-Age=0' });
    }

    if (method === 'GET' && pathname === '/api/me') return send(res, 200, requireUser(req));

    if (pathname === '/api/payments') {
      const user = requireUser(req);
      if (method === 'GET') return send(res, 200, store.list());
      if (method === 'POST') {
        const body = await readJson(req);
        const key = req.headers['idempotency-key'];
        const { payment, replayed } = store.create(user, body, key);
        return replayed
          ? send(res, 200, payment, { 'Idempotent-Replay': 'true' })
          : send(res, 201, payment, { Location: `/api/payments/${payment.id}` });
      }
      return sendError(res, 405, 'METHOD_NOT_ALLOWED', 'Method not allowed');
    }

    const item = pathname.match(/^\/api\/payments\/([A-Z0-9-]+)(?:\/(approve|reject))?$/);
    if (item) {
      const user = requireUser(req);
      const [, id, action] = item;
      if (method === 'GET' && !action) return send(res, 200, store.get(id));
      if (method === 'POST' && action === 'approve') return send(res, 200, store.approve(user, id));
      if (method === 'POST' && action === 'reject') return send(res, 200, store.reject(user, id));
      return sendError(res, 405, 'METHOD_NOT_ALLOWED', 'Method not allowed');
    }

    return sendError(res, 404, 'NOT_FOUND', 'Not found');
  }

  function serveStatic(res, pathname) {
    const file = pathname === '/' ? 'index.html' : pathname.slice(1);
    const fullPath = path.normalize(path.join(PUBLIC_DIR, file));
    if (!fullPath.startsWith(PUBLIC_DIR) || !fs.existsSync(fullPath) || fs.statSync(fullPath).isDirectory()) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      return res.end('Not found');
    }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(fullPath)] ?? 'application/octet-stream' });
    fs.createReadStream(fullPath).pipe(res);
  }

  return http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://localhost');
    try {
      if (url.pathname.startsWith('/api/')) return await handleApi(req, res, url);
      return serveStatic(res, url.pathname);
    } catch (err) {
      if (err instanceof ValidationError) return sendError(res, 400, 'VALIDATION_ERROR', err.message, err.field);
      if (err instanceof DomainError) return sendError(res, err.status, err.code, err.message);
      console.error(err);
      return sendError(res, 500, 'INTERNAL_ERROR', 'Something went wrong');
    }
  });
}

module.exports = { createApp };

if (require.main === module) {
  // The demo password comes from .env (created by `npm install`, never committed).
  try {
    process.loadEnvFile();
  } catch {
    // no .env file: fall through to the check below
  }
  if (!process.env.KATA_PASSWORD) {
    console.error('KATA_PASSWORD is not set. Run `npm run setup` to create a local .env file.');
    process.exit(1);
  }
  const testMode = process.argv.includes('--test-mode');
  const port = Number(process.env.PORT ?? 3000);
  createApp({ testMode }).listen(port, () => {
    console.log(`Kata Payments on http://localhost:${port}${testMode ? ' (test mode)' : ''}`);
  });
}
