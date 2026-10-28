// Stand-ins for Google Maps and the web app's /api/route function, so tests never call Google.

const CIRCLE = { latitude: 5.5717, longitude: -0.2166 };
const MIDWAY = { latitude: 5.553, longitude: -0.3168 };
const KASOA = { latitude: 5.534, longitude: -0.417 };

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
  const state = (window.__fakeMaps = { polylines: [], markers: [], pans: 0, listeners: {}, traffic: false });
  class LatLngBounds { extend() {} }
  class Map {
    constructor(el) { el.setAttribute('data-map-ready', '1'); }
    fitBounds() {}
    panTo() { state.pans++; }
    getBounds() { return null; }
    addListener(name, fn) { state.listeners[name] = fn; }
  }
  class Polyline {
    constructor(o) { this.i = state.polylines.push(o.path) - 1; }
    setPath(p) { state.polylines[this.i] = p; }
    setMap(m) { if (!m) state.polylines[this.i] = null; }
  }
  class TrafficLayer { setMap(m) { state.traffic = !!m; } }
  class Marker {
    constructor(o) { this.o = o; state.markers.push(this); }
    setPosition(p) { this.o.position = p; }
    setTitle(t) { this.o.title = t; }
    setMap(m) { if (!m) state.markers.splice(state.markers.indexOf(this), 1); }
  }
  window.google = { maps: { Map, Polyline, Marker, LatLngBounds, TrafficLayer, SymbolPath: { CIRCLE: 0 } } };
  window[new URL(document.currentScript.src).searchParams.get('callback')]();
})();`;

async function fakeGoogle(context, counter = { routes: 0 }) {
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

module.exports = { CIRCLE, MIDWAY, KASOA, FAKE_MAPS, fakeGoogle };
