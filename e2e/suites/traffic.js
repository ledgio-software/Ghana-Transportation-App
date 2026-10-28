// P1-TRIP-05 "Traffic home": where I am and the minutes home in today's traffic. Google Maps and
// the web app's /api/traffic function are stand-ins (../fake-google.js), so tests never call Google.
const { CIRCLE, MIDWAY, KASOA, fakeGoogle } = require('../fake-google');

function encode(points) {
  let out = '';
  let prev = [0, 0];
  for (const p of points) {
    const cur = [Math.round(p.latitude * 1e5), Math.round(p.longitude * 1e5)];
    for (let i = 0; i < 2; i++) {
      let v = cur[i] - prev[i];
      v = v < 0 ? ~(v << 1) : v << 1;
      while (v >= 0x20) {
        out += String.fromCharCode((0x20 | (v & 0x1f)) + 63);
        v >>= 5;
      }
      out += String.fromCharCode(v + 63);
    }
    prev = cur;
  }
  return out;
}

module.exports = {
  name: 'traffic',
  app: 'passenger',
  async run({ base, step, browser }) {
    const ctx = await browser.newContext({ viewport: { width: 360, height: 800 }, permissions: ['geolocation'], geolocation: CIRCLE });
    await fakeGoogle(ctx);
    const calls = [];
    let answer = { durationS: 2880, usualS: 1800 };
    await ctx.route('**/api/traffic?*', (route) => {
      calls.push(new URL(route.request().url()).search);
      route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({ encodedPolyline: encode([CIRCLE, MIDWAY, KASOA]), distanceM: 23000, ...answer }),
      });
    });
    const page = await ctx.newPage();
    await page.clock.install();

    await step('from the home screen, choose home: the station nearest home', async () => {
      await page.goto(`${base}/`);
      await page.getByRole('button', { name: 'Check traffic home' }).click();
      await page.getByText('Where is home?').waitFor();
      await page.getByText('Home is saved on this phone only.').waitFor();
      await page.getByRole('button', { name: /^Or choose the station nearest home/ }).click();
      await page.getByText('Kasoa', { exact: true }).first().click();
    });

    await step('shows the minutes home in today\'s traffic, compared with usual, on a traffic map', async () => {
      await page.getByText('48 min to get home').waitFor();
      await page.getByText('Heavy traffic: 18 min longer than usual.').waitFor();
      await page.getByText(/^2\d km · usually 30 min$/).waitFor();
      if (calls[0] !== '?from=5.572,-0.217&to=5.534,-0.417') throw new Error(calls.join(' '));
      const map = await page.evaluate(() => ({
        traffic: window.__fakeMaps.traffic,
        you: !!window.__fakeMaps.markers.find((m) => m.o.title === 'You are here'),
        home: !!window.__fakeMaps.markers.find((m) => m.o.title === 'Kasoa'),
        lines: window.__fakeMaps.polylines.filter(Boolean).length,
      }));
      if (!map.traffic || !map.you || !map.home || map.lines !== 1) throw new Error(JSON.stringify(map));
    });

    await step('refreshes by itself every 2 minutes as traffic changes', async () => {
      answer = { durationS: 1920, usualS: 1800 };
      await ctx.setGeolocation(MIDWAY);
      await page.clock.fastForward(121_000);
      await page.getByText('32 min to get home').waitFor();
      await page.getByText('Traffic is light.').waitFor();
      if (calls.length !== 2 || !calls[1].startsWith('?from=5.553,-0.317')) throw new Error(calls.join(' '));
    });

    await step('home is remembered; at home it says so without asking Google', async () => {
      await ctx.setGeolocation({ latitude: KASOA.latitude + 0.0005, longitude: KASOA.longitude });
      await page.reload();
      await page.getByText('You are at home.').waitFor();
      if (calls.length !== 2) throw new Error(`asked again at home: ${calls.length}`);
    });

    await step('change home to "where I am now"', async () => {
      await ctx.setGeolocation(CIRCLE);
      await page.getByRole('button', { name: 'Change home' }).click();
      await page.getByRole('button', { name: 'I am at home now: use this place' }).click();
      await page.getByText('You are at home.').waitFor();
      await page.getByText('Home', { exact: true }).waitFor();
    });

    await step('when the traffic cannot be loaded, it says so', async () => {
      await ctx.unroute('**/api/traffic?*');
      await ctx.route('**/api/traffic?*', (route) => route.fulfill({ status: 502, body: '{"error":"routes unavailable"}' }));
      await ctx.setGeolocation(MIDWAY);
      await page.getByRole('button', { name: 'Refresh' }).click();
      await page.getByText('Could not get the traffic right now. Check your internet and try again.').waitFor();
    });

    await ctx.close();
  },
};
