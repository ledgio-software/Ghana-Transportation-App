// P1-LEGAL: agreement before the first report, consent history, correct, download and delete data.
const fs = require('fs');
const { sql, openResults, PASSENGER } = require('../lib');

module.exports = {
  name: 'privacy',
  app: 'passenger',
  session: 'passenger',
  async run({ page, base, step, browser }) {
    page.on('dialog', (d) => d.accept());

    await step('first report asks for agreement, then works', async () => {
      await openResults(page, base, 'Kasoa');
      await page.getByRole('button', { name: 'Report what you paid' }).click();
      await page.getByRole('button', { name: 'Continue' }).click();
      await page.getByText('We keep your phone number to stop fake reports. We never sell your data.').waitFor();
      await page.getByRole('link', { name: 'Terms of use' }).waitFor();
      await page.getByRole('link', { name: 'Privacy policy' }).waitFor();
      await page.getByLabel('Send me news about new features (optional)').click();
      await page.getByRole('button', { name: 'I agree' }).click();
      await page.getByLabel('Amount you paid (GH¢)').fill('12');
      await page.getByRole('button', { name: 'Send report' }).click();
      await page.getByText('Thank you! Your report helps other travellers.').waitFor();
      const rows = sql(`select string_agg(consent_type||':'||granted||':'||document_version||':'||coalesce(app_version,'-'), ' ' order by consent_type) from consents where user_id = '${PASSENGER}'`);
      if (rows !== 'marketing:true:1:0.1.0 privacy:true:2026-10-draft-3:0.1.0 terms:true:2026-10-draft-3:0.1.0') throw new Error(rows);
    });
    await step('the full terms and privacy policy open from Settings, signed out too', async () => {
      const anon = await (await browser.newContext({ viewport: { width: 360, height: 800 } })).newPage();
      await anon.goto(`${base}/settings`);
      await anon.getByRole('button', { name: 'Terms of use' }).click();
      await anon.getByRole('heading', { name: 'Terms of Use', exact: true }).waitFor();
      await anon.getByText('Draft: this text is waiting for legal review and may change.').waitFor();
      await anon.getByText(/If anyone is in danger or hurt, call 112 straight away\./).waitFor();
      await anon.goto(`${base}/privacy-policy`);
      await anon.getByRole('heading', { name: 'Privacy Policy', exact: true }).waitFor();
      await anon.getByRole('heading', { name: '8. Your rights' }).waitFor();
      await anon.getByText(/Version 2026-10-draft-3/).waitFor();
      await anon.context().close();
    });
    await step('turning marketing off adds a new record', async () => {
      await page.goto(`${base}/privacy`);
      await page.getByText(/You agreed to the terms and privacy notice on/).waitFor();
      await page.getByLabel('News about new features').click();
      await page.waitForTimeout(800);
      const history = sql(`select string_agg(granted::text, ',' order by created_at) from consents where user_id = '${PASSENGER}' and consent_type = 'marketing'`);
      if (history !== 'true,false') throw new Error(history);
    });
    await step('correct my details', async () => {
      await page.getByLabel('Name (optional)').fill('Ama');
      await page.getByLabel('Home city (optional)').fill('Kumasi');
      await page.getByRole('button', { name: 'Save' }).click();
      await page.getByText('Saved.').waitFor();
      if (sql(`select display_name||','||home_city from profiles where id = '${PASSENGER}'`) !== 'Ama,Kumasi') throw new Error('not saved');
    });
    await step('download my data', async () => {
      const [dl] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Download my data' }).click()]);
      const data = JSON.parse(fs.readFileSync(await dl.path(), 'utf8'));
      if (data.profile.display_name !== 'Ama' || data.fare_reports.length !== 1 || data.consents.length !== 4) {
        throw new Error(JSON.stringify({ name: data.profile.display_name, reports: data.fare_reports.length, consents: data.consents.length }));
      }
    });
    await step('delete my account', async () => {
      // Stands in for the delete-account edge function: removes the auth user as the service would.
      await page.route('**/functions/v1/delete-account', async (route) => {
        sql(`delete from auth.users where id = '${PASSENGER}'`);
        await route.fulfill({ status: 200, contentType: 'application/json', body: '{"deleted":true}', headers: { 'access-control-allow-origin': '*' } });
      });
      await page.getByRole('button', { name: 'Delete my account' }).click();
      await page.getByText('Your account has been deleted.').waitFor();
      await page.getByRole('button', { name: 'Sign in' }).waitFor();
      const left = sql(`select (select count(*) from consents where user_id = '${PASSENGER}')||','||(select count(*) from profiles where id = '${PASSENGER}')||','||(select count(*) from fare_reports where user_id is null and amount_pesewas = 1200)`);
      if (left !== '0,0,1') throw new Error(`consents,profile,anonymous report = ${left}`);
    });
  },
};
