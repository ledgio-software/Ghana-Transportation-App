// P1-TRIP-04: live map with the route line, a moving "you are here" dot and the time left.
// Google Maps and the /api/route function are replaced by stand-ins, so the tests never call Google.

const CIRCLE = { latitude: 5.5717, longitude: -0.2166 };
const MIDWAY = { latitude: 5.553, longitude: -0.3168 };
const KASOA = { latitude: 5.534, longitude: -0.417 };
const URL_PATH = '/live-map?from=00000000-0000-4000-8000-000000000201&to=00000000-0000-4000-8000-000000000202';

/** Google's polyline encoding, to build the stand-in Routes API answer. */
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

// Records what the page draws instead of drawing it.
const FAKE_MAPS = `(() => {
  const state = (window.__fakeMaps = { polylines: [], markers: [], pans: 0, listeners: {} });
  class LatLngBounds { extend() {} }
  class Map {
    constructor(el) { el.setAttribute('data-map-ready', '1'); }
    fitBounds() {}
    panTo() { state.pans++; }
    addListener(name, fn) { state.listeners[name] = fn; }
  }
  class Polyline { constructor(o) { state.polylines.push(o.path); } }
  class Marker {
    constructor(o) { this.o = o; state.markers.push(this); }
    setPosition(p) { this.o.position = p; }
  }
  window.google = { maps: { Map, Polyline, Marker, LatLngBounds, SymbolPath: { CIRCLE: 0 } } };
  window[new URL(document.currentScript.src).searchParams.get('callback')]();
})();`;

async function fakeGoogle(context, counter) {
  await context.route('https://maps.googleapis.com/maps/api/js**', (route) =>
    route.fulfill({ contentType: 'text/javascript', body: FAKE_MAPS }),
  );
  // The web app's own /api/route function (it calls Google with the private key on Vercel).
  await context.route('**/api/route?*', (route) => {
    counter.routes++;
    counter.query = new URL(route.request().url()).search;
    route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({ encodedPolyline: encode([CIRCLE, MIDWAY, KASOA]), durationS: 1800, distanceM: 23000 }),
    });
  });
}

const dot = (page) =>
  page.evaluate(() => {
    const m = window.__fakeMaps.markers.find((x) => x.o.title === 'You are here');
    return m && m.o.position;
  });

module.exports = {
  name: 'live-map',
  app: 'passenger',
  session: 'passenger',
  async run({ page, base, step, browser }) {
    const counter = { routes: 0 };
    await fakeGoogle(page.context(), counter);

    await step('start the live map from the results; asks for location when it is off', async () => {
      await page.goto(`${base}/results?from=00000000-0000-4000-8000-000000000201&to=00000000-0000-4000-8000-000000000202`);
      await page.getByText('Official fare').first().waitFor();
      await page.getByRole('button', { name: 'Start live map' }).click();
      await page.waitForURL(/\/live-map/);
      await page.getByText('To Kasoa').waitFor();
      await page.getByText('Allow location for this app to see where you are on the route.').waitFor();
      if (counter.routes !== 1 || counter.query !== '?from=5.5717,-0.2166&to=5.5340,-0.4170') throw new Error(JSON.stringify(counter));
      const lines = await page.evaluate(() => window.__fakeMaps.polylines.length);
      if (lines !== 1) throw new Error(`route lines: ${lines}`);
    });

    const ctx = await browser.newContext({
      viewport: { width: 360, height: 800 },
      permissions: ['geolocation'],
      geolocation: CIRCLE,
    });
    await fakeGoogle(ctx, counter);
    const phone = await ctx.newPage();

    await step('the dot starts at Circle with the whole trip left', async () => {
      await phone.goto(`${base}${URL_PATH}`);
      await phone.getByText(/^30 min · 2\d km left$/).waitFor();
      const p = await dot(phone);
      if (!p || Math.abs(p.lat - CIRCLE.latitude) > 0.001) throw new Error(JSON.stringify(p));
    });

    await step('moving along the road moves the dot and counts down', async () => {
      await ctx.setGeolocation(MIDWAY);
      await phone.getByText(/^1[4-6] min · 1\d km left$/).waitFor();
      const p = await dot(phone);
      if (Math.abs(p.lng - MIDWAY.longitude) > 0.001) throw new Error(JSON.stringify(p));
      if ((await phone.evaluate(() => window.__fakeMaps.pans)) < 2) throw new Error('map did not follow');
    });

    await step('leaving the road says so', async () => {
      await ctx.setGeolocation({ latitude: MIDWAY.latitude + 0.01, longitude: MIDWAY.longitude });
      await phone.getByText(/^You are off the route \(1\.\d km away\)\.$/).waitFor();
    });

    await step('dragging the map stops following until "Follow me"', async () => {
      await ctx.setGeolocation(MIDWAY);
      await phone.getByText(/left$/).waitFor();
      await phone.evaluate(() => window.__fakeMaps.listeners.dragstart());
      const follow = phone.getByRole('button', { name: 'Follow me' });
      await follow.click();
      await follow.waitFor({ state: 'detached' });
    });

    await step('arriving says so', async () => {
      await ctx.setGeolocation({ latitude: KASOA.latitude + 0.0005, longitude: KASOA.longitude });
      await phone.getByText('You have arrived at Kasoa.').waitFor();
    });

    await step('the route is kept on the phone: reopening does not ask Google again', async () => {
      const before = counter.routes;
      await phone.reload();
      await phone.getByText('You have arrived at Kasoa.').waitFor();
      if (counter.routes !== before) throw new Error(`routes requested again (${counter.routes})`);
    });
    await ctx.close();

    await step('without the road route, the map, the dot and the straight-line distance still work', async () => {
      const offline = await browser.newContext({ viewport: { width: 360, height: 800 }, permissions: ['geolocation'], geolocation: MIDWAY });
      await offline.route('https://maps.googleapis.com/maps/api/js**', (route) => route.fulfill({ contentType: 'text/javascript', body: FAKE_MAPS }));
      await offline.route('**/api/route?*', (route) => route.fulfill({ status: 503, contentType: 'application/json', body: '{"error":"routes not configured"}' }));
      const tab = await offline.newPage();
      await tab.goto(`${base}${URL_PATH}`);
      await tab.getByText(/^1\d km to go in a straight line$/).waitFor();
      await tab.getByText('The road route could not be loaded, so the distance is a straight line.').waitFor();
      const state = await tab.evaluate(() => ({ lines: window.__fakeMaps.polylines.length, dot: !!window.__fakeMaps.markers.find((m) => m.o.title === 'You are here') }));
      if (state.lines !== 0 || !state.dot) throw new Error(JSON.stringify(state));
      await offline.close();
    });
  },
};
