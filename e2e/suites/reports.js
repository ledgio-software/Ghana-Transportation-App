// P1-REPORT and P1-ALERT: report what you paid, one-tap overcharge, offline outbox, feature switch.
const { sql, openResults, PASSENGER } = require('../lib');

module.exports = {
  name: 'reports',
  app: 'passenger',
  session: 'passenger',
  setup: `insert into consents (user_id, consent_type, document_version, granted) values
    ('${PASSENGER}', 'terms', '2026-10-draft-3', true), ('${PASSENGER}', 'privacy', '2026-10-draft-3', true);`,
  async run({ page, base, step, browser }) {
    await step('report what you paid (online)', async () => {
      await openResults(page, base, 'Kasoa');
      await page.getByRole('button', { name: 'Report what you paid' }).click();
      await page.getByLabel('Amount you paid (GH¢)').fill('14');
      await page.getByRole('button', { name: 'Send report' }).click();
      await page.getByText('Thank you! Your report helps other travellers.').waitFor();
      const row = sql('select amount_pesewas||\',\'||user_id||\',\'||status from fare_reports');
      if (row !== `1400,${PASSENGER},pending`) throw new Error(row);
    });
    await step('offline: saved fares and the fair-price check still work (P1-OFF, P1-ALERT-02)', async () => {
      await openResults(page, base, 'Kasoa');
      await page.route('**/rest/v1/**', (route) => route.abort('internetdisconnected'));
      await page.reload();
      await page.getByText(/Offline\. Showing fares saved on/).first().waitFor();
      await page.getByText('GH¢11', { exact: true }).waitFor();
      await page.getByLabel('Fare you were asked to pay (GH¢)').fill('20');
      await page.getByText('Above normal fare').waitFor();
      await page.unroute('**/rest/v1/**');
    });
    await step('one-tap overcharge report (P1-ALERT-02)', async () => {
      await openResults(page, base, 'Kasoa');
      await page.getByLabel('Fare you were asked to pay (GH¢)').fill('20');
      await page.getByText('Above normal fare').waitFor();
      await page.getByRole('button', { name: 'Report overcharge' }).click();
      await page.getByText('Overcharge reported. Thank you.').waitFor();
      await page.waitForTimeout(1000);
      const row = sql("select quoted_pesewas||','||reference_pesewas||','||kind from overcharge_reports");
      if (row !== '2000,1100,overcharge') throw new Error(row);
    });
    await step('offline report is queued, then stored exactly once', async () => {
      // The server stores the report but the phone never hears back (signal lost mid-request).
      let mode = 'lose-response';
      await page.route('**/rest/v1/fare_reports*', async (route) => {
        if (mode === 'lose-response') {
          await route.fetch();
          return route.abort('internetdisconnected');
        }
        return route.continue();
      });
      await openResults(page, base, 'Kasoa');
      await page.getByRole('button', { name: 'Report what you paid' }).click();
      await page.getByLabel('Amount you paid (GH¢)').fill('16.50');
      await page.getByRole('radio', { name: 'Yesterday' }).click();
      await page.getByRole('button', { name: 'Send report' }).click();
      await page.getByText('Saved on your phone. It will send when you are back online.').waitFor();
      await page.getByRole('button', { name: 'Done' }).click();
      await page.waitForURL(/\/results/);
      await page.getByText('Official fare').first().waitFor();
      await page.goto(`${base}/`);
      await page.getByText('Reports waiting to send: 1').waitFor();
      mode = 'online';
      await page.reload();
      await page.getByText('Where are you going?').waitFor();
      await page.waitForTimeout(1500);
      if (await page.getByText(/Reports waiting to send/).count()) throw new Error('still waiting');
      const n = sql("select count(*) from fare_reports where amount_pesewas = 1650 and travelled_at < now() - interval '20 hours'");
      if (n !== '1') throw new Error(`expected exactly one, got ${n}`);
      await page.unroute('**/rest/v1/fare_reports*');
    });
    await step('signed out: asked to sign in first', async () => {
      const anon = await (await browser.newContext({ viewport: { width: 360, height: 800 } })).newPage();
      await openResults(anon, base, 'Kasoa');
      await anon.getByRole('button', { name: 'Report what you paid' }).click();
      await anon.getByText('Sign in to report fares. It only takes an SMS code.').waitFor();
    });
    await step('feature switch off hides reporting', async () => {
      sql("update feature_flags set enabled = false where key = 'phase1.fare_reports'");
      const fresh = await (await browser.newContext({ viewport: { width: 360, height: 800 } })).newPage();
      await openResults(fresh, base, 'Kasoa');
      await fresh.waitForTimeout(800);
      if (await fresh.getByRole('button', { name: 'Report what you paid' }).count()) throw new Error('button still shown');
      sql("update feature_flags set enabled = true where key = 'phase1.fare_reports'");
    });
  },
};
