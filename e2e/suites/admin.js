// P1-ADMIN: stations, operators, sources, routes, fares and moderation through the dashboard.
const { sql, EDITOR, PASSENGER } = require('../lib');

module.exports = {
  name: 'admin',
  app: 'admin',
  session: 'staff',
  setup: `
    insert into fare_reports (client_id, user_id, route_id, vehicle_type, amount_pesewas, travelled_at) values
      (gen_random_uuid(), '${PASSENGER}', '00000000-0000-4000-8000-000000000301', 'trotro', 1500, now()),
      (gen_random_uuid(), '${PASSENGER}', '00000000-0000-4000-8000-000000000301', 'trotro', 99900, now());`,
  async run({ page, base, step }) {
    page.on('dialog', (d) => d.accept('12.50'));
    await page.goto(`${base}/stations`);

    await step('stations: add with coordinates', async () => {
      await page.getByLabel('Name (agreed spelling)').fill('Kaneshie');
      if ((await page.getByLabel('Short id').inputValue()) !== 'kaneshie') throw new Error('short id not generated');
      await page.getByLabel('City or town').fill('Accra');
      await page.getByLabel('Latitude').fill('5.5660');
      await page.getByLabel('Longitude').fill('-0.2360');
      await page.getByLabel('GhanaPostGPS').fill('ga-123-4567');
      await page.getByRole('button', { name: 'Add station' }).click();
      await page.getByText('Saved Kaneshie.').waitFor();
      await page.getByRole('cell', { name: 'GA-123-4567' }).waitFor();
    });
    await step('stations: swapped coordinates rejected', async () => {
      await page.getByLabel('Name (agreed spelling)').fill('Swapped');
      await page.getByLabel('City or town').fill('Accra');
      await page.getByLabel('Latitude').fill('-0.2360');
      await page.getByLabel('Longitude').fill('5.5660');
      await page.getByRole('button', { name: 'Add station' }).click();
      await page.getByText(/outside Ghana/).waitFor();
    });
    await step('stations: edit', async () => {
      await page.getByRole('row', { name: /Kaneshie/ }).getByRole('button', { name: 'Edit' }).click();
      await page.getByLabel('Name (agreed spelling)').fill('Kaneshie Market');
      await page.getByRole('button', { name: 'Save changes' }).click();
      await page.getByText('Saved Kaneshie Market.').waitFor();
    });
    await step('operators and sources: add', async () => {
      await page.getByRole('link', { name: 'Operators & sources' }).click();
      await page.getByPlaceholder('VIP Jeoun').fill('2M Express');
      await page.getByRole('button', { name: 'Add operator' }).click();
      await page.getByRole('cell', { name: '2M Express' }).waitFor();
      await page.getByPlaceholder('GPRTU Greater Accra schedule, June 2026').fill('Kaneshie station board, Oct 2026');
      await page.getByLabel('Type').nth(1).selectOption('station_board');
      await page.getByRole('button', { name: 'Add source' }).click();
      await page.getByRole('cell', { name: 'Kaneshie station board, Oct 2026' }).waitFor();
    });
    await step('routes: add', async () => {
      await page.getByRole('link', { name: 'Routes' }).click();
      await page.getByLabel('From').selectOption({ label: 'Kaneshie Market (Accra)' });
      await page.getByLabel('To').selectOption({ label: 'Kasoa (Kasoa)' });
      await page.getByLabel('Usual travel time in minutes (optional)').fill('45');
      await page.getByRole('button', { name: 'Add route' }).click();
      await page.getByRole('cell', { name: 'Kaneshie Market → Kasoa' }).waitFor();
    });
    await step('fares: add, duplicate refused, change keeps history, confirm', async () => {
      await page.getByRole('link', { name: 'Fares' }).click();
      await page.getByLabel('Route').selectOption({ label: 'Kaneshie Market → Kasoa' });
      await page.getByLabel('Source').selectOption({ label: 'Kaneshie station board, Oct 2026' });
      await page.getByLabel('Fare (GH¢)').fill('10');
      await page.getByRole('button', { name: 'Add fare' }).click();
      await page.getByText('Added GH¢10.').waitFor();
      const row = page.getByRole('row', { name: /Kaneshie Market → Kasoa/ });
      await page.getByLabel('Fare (GH¢)').fill('11');
      await page.getByRole('button', { name: 'Add fare' }).click();
      await page.getByText(/already has a current fare/).waitFor();
      await row.getByRole('button', { name: 'Change' }).click();
      await row.getByText('GH¢12.50 (official)').waitFor();
      await row.getByRole('button', { name: 'Still correct' }).click();
      const history = sql(`select string_agg(f.amount_pesewas::text, ',' order by f.created_at) from fares f join routes r on r.id = f.route_id join stations s on s.id = r.origin_station_id where s.slug = 'kaneshie'`);
      if (history !== '1000,1250') throw new Error(`history ${history}`);
      if (sql(`select count(*) from audit_log where actor_id = '${EDITOR}' and table_name = 'fares'`) === '0') throw new Error('not audited');
    });
    await step('reports: accept and reject', async () => {
      await page.getByRole('link', { name: 'Reports' }).click();
      await page.getByRole('row', { name: /GH¢999/ }).getByRole('button', { name: 'Reject' }).click();
      await page.getByRole('row', { name: /GH¢15 ·/ }).getByRole('button', { name: 'Accept' }).click();
      await page.getByText('Nothing waiting.').waitFor();
      const statuses = sql(`select string_agg(status, ',' order by amount_pesewas) from fare_reports`);
      if (statuses !== 'accepted,rejected') throw new Error(statuses);
    });
  },
};
