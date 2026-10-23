// P1-NOTIF: saved trips and fare-change alerts.
const { sql, openResults, PASSENGER } = require('../lib');

const FADAMA_ROUTE = '00000000-0000-4000-8000-000000000302';
const ghs = (p) => (p % 100 ? `GH¢${Math.floor(p / 100)}.${String(p % 100).padStart(2, '0')}` : `GH¢${p / 100}`);

module.exports = {
  name: 'saved',
  app: 'passenger',
  session: 'passenger',
  async run({ page, base, step, browser }) {
    await step('signed out: saving asks to sign in', async () => {
      const anon = await (await browser.newContext({ viewport: { width: 360, height: 800 } })).newPage();
      await openResults(anon, base, 'Fadama');
      await anon.getByText('Sign in to save trips and get alerts when fares change.').waitFor();
      await anon.getByRole('button', { name: 'Save this trip' }).click();
      await anon.getByRole('button', { name: 'Send code' }).waitFor();
    });
    await step('save a trip, see it on home', async () => {
      await openResults(page, base, 'Fadama');
      await page.getByRole('button', { name: 'Save this trip' }).click();
      await page.getByText('Saved. We will tell you when the fare changes.').waitFor();
      if (sql(`select count(*) from saved_routes where user_id = '${PASSENGER}' and route_id = '${FADAMA_ROUTE}'`) !== '1') throw new Error('not saved');
      await page.goto(`${base}/`);
      await page.getByRole('button', { name: 'Kwame Nkrumah Circle → Fadama' }).waitFor();
    });
    await step('fare change shows as an alert and is marked read', async () => {
      sql(`select change_fare((select id from fares where route_id = '${FADAMA_ROUTE}' and effective_to is null), 650)`);
      await page.reload();
      await page.getByRole('button', { name: 'Fare changes on your trips: 1 new' }).click();
      await page.getByText(`GPRTU · Trotro: ${ghs(500)} → ${ghs(650)}`).waitFor();
      await page.waitForTimeout(800);
      if (sql(`select count(*) from notifications where user_id = '${PASSENGER}' and read_at is null`) !== '0') throw new Error('not marked read');
    });
    await step('alert opens the fares; no longer new on home', async () => {
      await page.getByRole('button', { name: 'See fares' }).click();
      await page.getByText(ghs(650), { exact: true }).waitFor();
      await page.goto(`${base}/`);
      await page.getByRole('button', { name: 'Kwame Nkrumah Circle → Fadama' }).waitFor();
      await page.waitForTimeout(800);
      if (await page.getByText(/Fare changes on your trips/).count()) throw new Error('still shown as new');
    });
    await step('remove a saved trip', async () => {
      await page.getByRole('button', { name: 'Kwame Nkrumah Circle → Fadama' }).click();
      await page.getByRole('button', { name: 'Remove from saved trips' }).click();
      await page.getByRole('button', { name: 'Save this trip' }).waitFor();
      if (sql(`select count(*) from saved_routes where user_id = '${PASSENGER}'`) !== '0') throw new Error('not removed');
    });
    await step('switch the app to Twi and back (P1-ACC)', async () => {
      await page.goto(`${base}/settings`);
      await page.getByRole('radio', { name: 'Twi' }).click();
      await page.goto(`${base}/`);
      await page.getByText('Wo rekɔ he?').waitFor();
      await page.goto(`${base}/settings`);
      await page.getByRole('radio', { name: 'English' }).click();
      await page.goto(`${base}/`);
      await page.getByText('Where are you going?').waitFor();
    });
  },
};
