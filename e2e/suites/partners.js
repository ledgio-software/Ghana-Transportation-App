// P1-ADMIN-09: GPRTU (or another union or operator) sends fare changes through the fare API with a
// key an admin made; the change shows in the app's fares and on the Partners page.
const { sql, sign, API_PORT } = require('../lib');

const FADAMA_ROUTE = '00000000-0000-4000-8000-000000000302';

/** What a partner's system does: one HTTPS call with its key (docs/partner-fare-api.md). */
async function sendFares(key, fares) {
  const res = await fetch(`http://localhost:${API_PORT}/rest/v1/rpc/partner_update_fares`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', apikey: 'anon', authorization: `Bearer ${sign({ role: 'anon' })}` },
    body: JSON.stringify({ p_key: key, p_fares: fares }),
  });
  return { status: res.status, body: await res.json() };
}

module.exports = {
  name: 'partners',
  app: 'admin',
  session: 'staff',
  async run({ page, base, step }) {
    page.on('dialog', (d) => d.accept());
    let key = '';

    await step('an admin makes a key for GPRTU; it is shown once', async () => {
      await page.goto(`${base}/partners`);
      await page.getByRole('heading', { name: 'Fare API partners' }).waitFor();
      await page.getByLabel('Partner name').fill('GPRTU Greater Accra');
      await page.getByLabel('Their fares belong to').selectOption({ label: 'GPRTU' });
      await page.getByRole('button', { name: 'Make key' }).click();
      key = (await page.getByLabel('New partner key').textContent()).trim();
      if (!/^gtp_[0-9a-f]{64}$/.test(key)) throw new Error(key);
      await page.getByRole('button', { name: 'I have copied it' }).click();
      await page.getByRole('cell', { name: `…${key.slice(-4)}` }).waitFor();
      if (await page.getByText(key).count()) throw new Error('key still shown');
    });

    await step('GPRTU sends a fare change: the fare changes at once, with a result per fare', async () => {
      const { status, body } = await sendFares(key, [
        { origin: 'kwame-nkrumah-circle', destination: 'fadama', vehicle_type: 'trotro', amount_ghs: 6.5 },
        { origin: 'no-such-station', destination: 'fadama', vehicle_type: 'trotro', amount_ghs: 6 },
      ]);
      if (status !== 200) throw new Error(`${status} ${JSON.stringify(body)}`);
      const statuses = body.results.map((r) => r.status).join(',');
      if (statuses !== 'changed,error') throw new Error(JSON.stringify(body));
      const now = sql(`select amount_pesewas from fares where route_id = '${FADAMA_ROUTE}' and effective_to is null`);
      if (now !== '650') throw new Error(`fare now ${now}`);
    });

    await step('the Partners page shows the update and any problems', async () => {
      await page.reload();
      const row = page.getByRole('row', { name: /GPRTU Greater Accra\s+2\s+1\s+0\s+0\s+1/ });
      await row.waitFor();
      await page.getByText('Fare 2: unknown station code: no-such-station').waitFor();
    });

    await step('a stopped key is refused', async () => {
      await page.getByRole('button', { name: 'Stop key' }).click();
      await page.getByText('Stopped').waitFor();
      const { status } = await sendFares(key, [{ origin: 'kwame-nkrumah-circle', destination: 'fadama', vehicle_type: 'trotro', amount_ghs: 7 }]);
      if (status === 200) throw new Error('stopped key still works');
      if (sql(`select amount_pesewas from fares where route_id = '${FADAMA_ROUTE}' and effective_to is null`) !== '650') throw new Error('fare changed');
    });
  },
};
