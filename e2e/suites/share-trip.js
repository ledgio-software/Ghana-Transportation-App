// P1-SAFE-04 "Share my trip": the traveller sends a link; family open it and follow the dot
// until the traveller stops sharing. No sign-in on either side.
const { CIRCLE, MIDWAY, KASOA, fakeGoogle } = require('../fake-google');
const { sql } = require('../lib');

const URL_PATH = '/live-map?from=00000000-0000-4000-8000-000000000201&to=00000000-0000-4000-8000-000000000202';

const travellerDot = (page) =>
  page.evaluate(() => {
    const m = window.__fakeMaps.markers.find((x) => x.o.title === 'Traveller');
    return m ? m.o.position : null;
  });

module.exports = {
  name: 'share-trip',
  app: 'passenger',
  async run({ page, base, step, browser }) {
    const ctx = await browser.newContext({ viewport: { width: 360, height: 800 }, permissions: ['geolocation'], geolocation: CIRCLE });
    await fakeGoogle(ctx);
    let whatsapp = null;
    await ctx.route('https://wa.me/**', (route) => {
      whatsapp = route.request().url();
      route.fulfill({ contentType: 'text/html', body: '<p>WhatsApp</p>' });
    });
    const phone = await ctx.newPage();
    await phone.clock.install();
    let link = '';

    await step('share my trip gives a family link to send on WhatsApp', async () => {
      await phone.goto(`${base}${URL_PATH}`);
      await phone.getByText(/left$/).waitFor();
      await phone.getByRole('button', { name: 'Share my trip' }).click();
      await phone.getByText('Send the link to family or a friend').waitFor();
      link = (await phone.getByText(/\/follow\/[0-9a-f-]{36}$/).textContent()).trim();
      const popup = ctx.waitForEvent('page');
      await phone.getByRole('button', { name: 'Send on WhatsApp' }).click();
      await (await popup).waitForLoadState();
      const text = new URL(whatsapp).searchParams.get('text');
      if (text !== `I am travelling to Kasoa. Follow my trip live on Ghana Transport: ${link}`) throw new Error(text);
      await phone.getByRole('button', { name: 'Done' }).click();
      await phone.getByText('Sharing your trip. Keep this map open so they can see where you are.').waitFor();
    });

    await step('the database keeps only a secret hash and the latest position', async () => {
      const id = link.split('/').pop();
      for (let i = 0; i < 20 && sql(`select latitude from trip_shares where id = '${id}'`) === ''; i++) await phone.waitForTimeout(250);
      const row = sql(`select round(latitude::numeric, 4) || ',' || length(secret_hash) from trip_shares where id = '${id}'`);
      if (row !== `${CIRCLE.latitude},64`) throw new Error(row);
    });

    const family = await browser.newContext({ viewport: { width: 360, height: 800 } });
    await fakeGoogle(family);
    const watcher = await family.newPage();
    await watcher.clock.install();

    await step('family open the link without signing in and see where the traveller is', async () => {
      await watcher.goto(link);
      await watcher.getByText('Kwame Nkrumah Circle → Kasoa').waitFor();
      await watcher.getByText(/^30 min · 2\d km left$/).waitFor();
      await watcher.getByText('Updated just now').waitFor();
      const p = await travellerDot(watcher);
      if (!p || Math.abs(p.lat - CIRCLE.latitude) > 0.001) throw new Error(JSON.stringify(p));
    });

    await step('the dot moves on the family page as the traveller moves', async () => {
      await phone.clock.fastForward(21_000);
      await ctx.setGeolocation(MIDWAY);
      const id = link.split('/').pop();
      for (let i = 0; i < 20 && !sql(`select latitude from trip_shares where id = '${id}'`).startsWith('5.553'); i++) await phone.waitForTimeout(250);
      await watcher.clock.fastForward(16_000);
      await watcher.getByText(/^1[4-6] min · 1\d km left$/).waitFor();
      const p = await travellerDot(watcher);
      if (Math.abs(p.lng - MIDWAY.longitude) > 0.001) throw new Error(JSON.stringify(p));
    });

    await step('stop sharing: the family page says the trip ended and hides the dot', async () => {
      await phone.getByRole('button', { name: 'Stop sharing' }).click();
      await phone.getByRole('button', { name: 'Share my trip' }).waitFor();
      await watcher.clock.fastForward(16_000);
      await watcher.getByText('The trip has ended. Sharing is off.').waitFor();
      if (await travellerDot(watcher)) throw new Error('dot still shown');
      const id = link.split('/').pop();
      const row = sql(`select coalesce(latitude::text, 'none') from trip_shares where id = '${id}'`);
      if (row !== 'none') throw new Error(`position kept: ${row}`);
    });

    await step('arriving stops sharing by itself', async () => {
      await ctx.setGeolocation(CIRCLE);
      await phone.reload();
      await phone.getByText(/left$/).waitFor();
      await phone.getByRole('button', { name: 'Share my trip' }).click();
      await phone.getByRole('button', { name: 'Done' }).click();
      const id = (await sql("select id from trip_shares where ended_at is null order by created_at desc limit 1"));
      await ctx.setGeolocation({ latitude: KASOA.latitude + 0.0005, longitude: KASOA.longitude });
      await phone.getByText('You have arrived at Kasoa.').waitFor();
      await phone.getByRole('button', { name: 'Share my trip' }).waitFor();
      for (let i = 0; i < 20 && sql(`select ended_at is not null from trip_shares where id = '${id}'`) !== 't'; i++) await phone.waitForTimeout(250);
      if (sql(`select ended_at is not null from trip_shares where id = '${id}'`) !== 't') throw new Error('share not ended');
    });

    await step('a wrong link says so', async () => {
      await watcher.goto(`${base}/follow/not-a-trip`);
      await watcher.getByText('This trip link is not valid.').waitFor();
    });

    await ctx.close();
    await family.close();
    void page;
  },
};
