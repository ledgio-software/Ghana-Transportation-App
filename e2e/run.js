// Runs every suite against a fresh database: migrations + seed, PostgREST, the built apps.
// Usage: see scripts/test-e2e.sh (it builds the apps and fetches PostgREST first).
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn, execFileSync } = require('child_process');
const { chromium } = require('playwright');
const lib = require('./lib');

const ROOT = path.resolve(__dirname, '..');
const ADMIN_URL = process.env.DATABASE_URL;
const POSTGREST_BIN = process.env.POSTGREST_BIN;
const DIST = { admin: process.env.ADMIN_DIST, passenger: process.env.PASSENGER_DIST };
const OUT = process.env.E2E_OUT ?? path.join(__dirname, 'results');
const DB = 'gta_e2e';

if (!ADMIN_URL || !POSTGREST_BIN || !DIST.admin || !DIST.passenger) {
  console.error('Set DATABASE_URL, POSTGREST_BIN, ADMIN_DIST and PASSENGER_DIST (scripts/test-e2e.sh does this).');
  process.exit(2);
}
process.env.E2E_DATABASE_URL = ADMIN_URL.replace(/\/[^/]*$/, `/${DB}`);

const suites = fs
  .readdirSync(path.join(__dirname, 'suites'))
  .filter((f) => f.endsWith('.js') && (!process.env.E2E_ONLY || f.startsWith(process.env.E2E_ONLY)))
  .map((f) => require(`./suites/${f}`));

const psql = (url, args) =>
  execFileSync('psql', [url, '-q', '-v', 'ON_ERROR_STOP=1', ...args], {
    stdio: ['ignore', 'ignore', 'inherit'],
    env: { ...process.env, PGOPTIONS: '-c client_min_messages=warning' },
  });

function freshDatabase(extraSql) {
  psql(ADMIN_URL, ['-c', `drop database if exists ${DB} with (force)`, '-c', `create database ${DB}`]);
  const url = process.env.E2E_DATABASE_URL;
  const files = [
    'supabase/tests/bootstrap_plain_postgres.sql',
    ...fs.readdirSync(path.join(ROOT, 'supabase/migrations')).sort().map((f) => `supabase/migrations/${f}`),
    'supabase/seed.sql',
  ];
  for (const f of files) psql(url, ['-f', path.join(ROOT, f)]);
  psql(url, [
    '-c',
    `do $$ begin
       if not exists (select 1 from pg_roles where rolname = 'authenticator') then
         create role authenticator login noinherit;
       end if;
     end $$;
     alter role authenticator with login password 'e2e-authenticator';
     grant anon, authenticated, service_role to authenticator;
     insert into auth.users (id, email) values ('${lib.EDITOR}', 'editor@example.com');
     insert into public.user_roles (user_id, role) values
       ('${lib.EDITOR}', 'admin'), ('${lib.EDITOR}', 'data_editor'), ('${lib.EDITOR}', 'moderator');
     insert into auth.users (id, phone) values ('${lib.PASSENGER}', '233240000001');
     ${extraSql ?? ''}`,
  ]);
}

async function startPostgrest() {
  const url = new URL(process.env.E2E_DATABASE_URL);
  url.username = 'authenticator';
  url.password = 'e2e-authenticator';
  const conf = path.join(os.tmpdir(), 'gta-e2e-postgrest.conf');
  fs.writeFileSync(
    conf,
    [
      `db-uri = "${url}"`,
      'db-schemas = "public"',
      'db-anon-role = "anon"',
      'jwt-secret = "e2e-secret-e2e-secret-e2e-secret-0123456789"',
      `server-port = ${lib.POSTGREST_PORT}`,
    ].join('\n'),
  );
  const proc = spawn(POSTGREST_BIN, [conf], { stdio: ['ignore', 'ignore', 'pipe'] });
  let log = '';
  proc.stderr.on('data', (d) => (log += d));
  for (let i = 0; i < 50; i++) {
    try {
      const res = await fetch(`http://127.0.0.1:${lib.POSTGREST_PORT}/vehicle_types?limit=1`);
      if (res.ok) return proc;
    } catch {
      // not up yet
    }
    await new Promise((r) => setTimeout(r, 200));
  }
  proc.kill();
  throw new Error(`PostgREST did not start:\n${log}`);
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const proxy = lib.startApiProxy();
  const servers = {
    admin: await lib.serveStatic(DIST.admin, 8090, { spa: false }),
    passenger: await lib.serveStatic(DIST.passenger, 8091, { spa: true }),
  };
  const browser = await chromium.launch();
  const results = [];

  for (const suite of suites) {
    console.log(`\n${suite.name}`);
    freshDatabase(suite.setup);
    const postgrest = await startPostgrest();
    const context = await browser.newContext({
      viewport: suite.app === 'admin' ? { width: 1280, height: 900 } : { width: 360, height: 800 },
      acceptDownloads: true,
    });
    // Signed in on first load only, so signing out or deleting the account sticks.
    await context.addInitScript((session) => {
      if (!localStorage.getItem('e2e-signed-in')) {
        localStorage.setItem('e2e-signed-in', '1');
        localStorage.setItem('sb-localhost-auth-token', JSON.stringify(session));
      }
    }, lib.sessionFor(suite.session));
    const page = await context.newPage();
    const pageErrors = [];
    page.on('pageerror', (e) => pageErrors.push(e.message));
    const { step, results: suiteResults } = lib.stepper(page, OUT, suite.name);
    const base = `http://localhost:${suite.app === 'admin' ? 8090 : 8091}`;
    try {
      await suite.run({ page, base, step, browser });
    } catch (err) {
      suiteResults.push({ suite: suite.name, name: 'suite crashed', ok: false });
      console.log(`  FAIL  suite crashed: ${err.message}`);
    }
    if (pageErrors.length) {
      suiteResults.push({ suite: suite.name, name: 'no page errors', ok: false });
      console.log(`  FAIL  page errors: ${pageErrors.join(' | ')}`);
    }
    results.push(...suiteResults);
    await context.close();
    postgrest.kill();
  }

  await browser.close();
  proxy.close();
  Object.values(servers).forEach((s) => s.close());
  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length} passed, ${failed.length} failed`);
  process.exit(failed.length ? 1 : 0);
})();
