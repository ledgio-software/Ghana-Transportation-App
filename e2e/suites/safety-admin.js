// P1-SAFE in the admin: review driver reports with photos, forward them, see ratings, edit emergency numbers.
const { sql, PASSENGER } = require('../lib');

const PHOTO = `${PASSENGER}/00000000-0000-4000-8000-0000000dd001/1.jpg`;
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');

module.exports = {
  name: 'safety-admin',
  app: 'admin',
  session: 'staff',
  setup: `
    insert into driver_reports (client_id, user_id, kind, vehicle_plate, occurred_at, note, photo_paths) values
      (gen_random_uuid(), '${PASSENGER}', 'reckless_driving', 'GR 1234-24', now(), 'Overtaking on a blind curve', array['${PHOTO}']);
    insert into driver_ratings (client_id, user_id, rating, tags, route_id, travelled_at) values
      (gen_random_uuid(), '${PASSENGER}', 5, array['safe_driving'], '00000000-0000-4000-8000-000000000301', now()),
      (gen_random_uuid(), '${PASSENGER}', 3, array['rude'], '00000000-0000-4000-8000-000000000301', now());`,
  async run({ page, base, step }) {
    // Storage is not part of the test stack: sign photo links and serve the photo here.
    await page.route('**/storage/v1/object/sign/report-photos', (route) => {
      const { paths } = route.request().postDataJSON();
      route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify(paths.map((p) => ({ path: p, signedURL: `/object/sign/report-photos/${p}?token=t`, error: null }))),
      });
    });
    await page.route('**/storage/v1/object/sign/report-photos/**', (route) => route.fulfill({ contentType: 'image/png', body: PNG }));
    await page.goto(`${base}/safety`);

    await step('driver report shows with its photo; forwarding needs a recipient', async () => {
      const card = page.getByRole('region', { name: 'Report: Reckless driving' });
      await card.getByText('GR 1234-24').waitFor();
      await card.getByText('Overtaking on a blind curve').waitFor();
      const img = card.getByRole('img', { name: 'Vehicle photo' });
      await img.waitFor();
      if (!(await img.evaluate((el) => el.complete && el.naturalWidth === 1))) throw new Error('photo did not load');
      await card.getByRole('button', { name: 'Mark forwarded' }).click();
      await page.getByText('Say who you forwarded it to (for example "MTTD Accra").').waitFor();
      await card.getByLabel('Forwarded to').fill('MTTD Accra');
      await card.getByLabel('Staff note').fill('Called the desk');
      await card.getByRole('button', { name: 'Mark forwarded' }).click();
      await page.getByText('Nothing here.').waitFor();
      const row = sql("select status||'|'||forwarded_to||'|'||staff_note||'|'||(moderated_by is not null) from driver_reports");
      if (row !== 'forwarded|MTTD Accra|Called the desk|true') throw new Error(row);
      await page.getByLabel('Show').selectOption('forwarded');
      await page.getByRole('region', { name: 'Report: Reckless driving' }).waitFor();
    });

    await step('ratings with the average', async () => {
      await page.getByRole('button', { name: 'Driver ratings' }).click();
      await page.getByText('4.0 ★').waitFor();
      await page.getByRole('cell', { name: 'safe driving' }).waitFor();
    });

    await step('emergency numbers: add, refuse a bad number, hide one', async () => {
      await page.getByRole('button', { name: 'Emergency numbers' }).click();
      await page.getByRole('cell', { name: '112' }).waitFor();
      await page.getByLabel('Name shown in the app').fill('MTTD Accra');
      await page.getByLabel('Phone number').fill('call us');
      await page.getByRole('button', { name: 'Add number' }).click();
      await page.getByText('Check the number: digits only, for example 0302123456 or 112.').waitFor();
      await page.getByLabel('Phone number').fill('0302 000 000');
      await page.getByRole('button', { name: 'Add number' }).click();
      await page.getByText('Saved MTTD Accra.').waitFor();
      const added = sql("select phone||'|'||kind from emergency_contacts where name = 'MTTD Accra'");
      if (added !== '0302000000|road_safety') throw new Error(added);
      await page.getByRole('row', { name: /Fire service/ }).getByRole('button', { name: 'Edit' }).click();
      await page.getByLabel('Shown in the app', { exact: true }).uncheck();
      await page.getByRole('button', { name: 'Save changes' }).click();
      await page.getByRole('row', { name: /Fire service/ }).getByText('hidden').waitFor();
      if (sql("select is_active from emergency_contacts where phone = '192'") !== 'f') throw new Error('not hidden');
    });
  },
};
