// Shared helpers for the browser tests: signed test tokens, a Supabase-style API front door
// over PostgREST, static servers for the built apps, database access and a step runner.
const crypto = require('crypto');
const http = require('http');
const { execFileSync } = require('child_process');
const handler = require('serve-handler');

const JWT_SECRET = 'e2e-secret-e2e-secret-e2e-secret-0123456789';
const API_PORT = 54399;
const POSTGREST_PORT = 3001;
const EDITOR = '00000000-0000-4000-8000-0000000000e1';
const PASSENGER = '00000000-0000-4000-8000-0000000000f1';

function sign(claims) {
  const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
  const now = Math.floor(Date.now() / 1000);
  const head = b64({ alg: 'HS256', typ: 'JWT' });
  const body = b64({ iat: now, exp: now + 86400, ...claims });
  return `${head}.${body}.${crypto.createHmac('sha256', JWT_SECRET).update(`${head}.${body}`).digest('base64url')}`;
}

/** A stored Supabase session, as supabase-js keeps it in localStorage. */
function sessionFor(kind) {
  const staff = kind === 'staff';
  const id = staff ? EDITOR : PASSENGER;
  const claims = staff
    ? { email: 'editor@example.com', aal: 'aal2', amr: [{ method: 'password', timestamp: 1 }, { method: 'totp', timestamp: 2 }] }
    : { phone: '233240000001', aal: 'aal1' };
  return {
    access_token: sign({ sub: id, role: 'authenticated', aud: 'authenticated', session_id: kind, ...claims }),
    refresh_token: 'unused',
    token_type: 'bearer',
    expires_in: 86400,
    expires_at: Math.floor(Date.now() / 1000) + 86400,
    user: {
      id,
      aud: 'authenticated',
      role: 'authenticated',
      app_metadata: {},
      user_metadata: {},
      created_at: new Date().toISOString(),
      ...(staff
        ? { email: 'editor@example.com', factors: [{ id: 'f1', status: 'verified', factor_type: 'totp', created_at: '', updated_at: '' }] }
        : { phone: '233240000001' }),
    },
  };
}

/** Forwards /rest/v1/* to PostgREST, the way the Supabase gateway does. */
function startApiProxy() {
  const cors = {
    'access-control-allow-origin': '*',
    'access-control-allow-headers': '*',
    'access-control-allow-methods': '*',
    'access-control-expose-headers': '*',
  };
  return http
    .createServer((req, res) => {
      if (req.method === 'OPTIONS') {
        res.writeHead(204, cors);
        return res.end();
      }
      if (!req.url.startsWith('/rest/v1/')) {
        res.writeHead(404, cors);
        return res.end('{}');
      }
      const headers = { ...req.headers };
      delete headers.host;
      const upstream = http.request(
        { host: '127.0.0.1', port: POSTGREST_PORT, path: req.url.slice('/rest/v1'.length), method: req.method, headers },
        (r) => {
          res.writeHead(r.statusCode, { ...r.headers, ...cors });
          r.pipe(res);
        },
      );
      upstream.on('error', () => {
        res.writeHead(502, cors);
        res.end('{}');
      });
      req.pipe(upstream);
    })
    .listen(API_PORT);
}

/** Serves a built app: the passenger app is a single-page app, the admin uses clean URLs. */
function serveStatic(dir, port, { spa }) {
  const options = spa ? { public: dir, rewrites: [{ source: '**', destination: '/index.html' }] } : { public: dir, cleanUrls: true };
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => handler(req, res, options)).listen(port, () => resolve(server));
  });
}

function sql(query) {
  return execFileSync('psql', [process.env.E2E_DATABASE_URL, '-tAc', query]).toString().trim();
}

/** Runs named steps, keeps going after a failure, and records a screenshot of each failure. */
function stepper(page, outDir, suite) {
  const results = [];
  return {
    results,
    async step(name, fn) {
      try {
        await fn();
        results.push({ suite, name, ok: true });
        console.log(`  ok    ${name}`);
      } catch (err) {
        results.push({ suite, name, ok: false });
        console.log(`  FAIL  ${name}: ${process.env.E2E_VERBOSE ? err.message : String(err.message).split("\n")[0]}`);
        await page.screenshot({ path: `${outDir}/fail-${suite}-${name.replace(/\W+/g, '-')}.png`, fullPage: true }).catch(() => {});
      }
    },
  };
}

/** Opens the passenger app, picks two stations and shows the fares. */
async function openResults(page, base, to) {
  await page.goto(`${base}/`);
  await page.getByRole('button', { name: /^From/ }).click();
  await page.getByText('Kwame Nkrumah Circle').click();
  await page.getByRole('button', { name: /^To/ }).click();
  await page.getByText(to, { exact: true }).first().click();
  await page.getByRole('button', { name: 'Find fares' }).click();
  await page.getByText('Official fare').first().waitFor();
}

module.exports = { sign, sessionFor, startApiProxy, serveStatic, sql, stepper, openResults, EDITOR, PASSENGER, API_PORT, POSTGREST_PORT };
