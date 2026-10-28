// Overcharge reports summed up by route in the admin, so staff see where overcharging happens.
const { sql } = require('../lib');

const R301 = '00000000-0000-4000-8000-000000000301';
const R302 = '00000000-0000-4000-8000-000000000302';
const report = (route, kind, quoted, reference, { status = 'pending', daysAgo = 1 } = {}) =>
  `(gen_random_uuid(), '${route}', '${kind}', ${quoted}, ${reference ?? 'null'}, now() - interval '${daysAgo} days', '${status}', now() - interval '${daysAgo} days')`;

module.exports = {
  name: 'hotspots',
  app: 'admin',
  session: 'staff',
  // Test data only: skip the "signed-in reporter" and rate-limit triggers.
  setup: `
    set session_replication_role = replica;
    insert into overcharge_reports (client_id, route_id, kind, quoted_pesewas, reference_pesewas, occurred_at, status, created_at) values
      ${report(R301, 'overcharge', 2000, 1500)},
      ${report(R301, 'overcharge', 1800, 1500, { status: 'accepted' })},
      ${report(R301, 'short_drop', 1500, null)},
      ${report(R302, 'overcharge', 700, 500)},
      ${report(R302, 'overcharge', 900, 500, { status: 'rejected' })},
      ${report(R302, 'overcharge', 900, 500, { daysAgo: 40 })};
    set session_replication_role = origin;`,
  async run({ page, base, step }) {
    const name = (route) =>
      sql(`select o.name || ' → ' || d.name from routes r join stations o on o.id = r.origin_station_id join stations d on d.id = r.destination_station_id where r.id = '${route}'`);

    await step('hotspots list routes by overcharge reports in the last 30 days', async () => {
      await page.goto(`${base}/reports`);
      await page.getByRole('button', { name: 'Overcharging hotspots' }).click();
      const rows = page.getByRole('row');
      await rows.nth(1).getByRole('cell', { name: name(R301), exact: true }).waitFor();
      const first = (await rows.nth(1).getByRole('cell').allTextContents()).slice(0, 4);
      if (first.join('|') !== `${name(R301)}|3|1|GH¢4`) throw new Error(first.join('|'));
      const second = (await rows.nth(2).getByRole('cell').allTextContents()).slice(0, 4);
      if (second.join('|') !== `${name(R302)}|1|0|GH¢2`) throw new Error(second.join('|'));
      if ((await rows.count()) !== 3) throw new Error(`rows: ${await rows.count()}`);
    });
  },
};
