// P1-WX-01 and P1-WX-02: weather along the trip, umbrella advice, heavy rain and flood warnings.
// The forecast proxy (/api/weather) is answered here, so the tests never call MET Norway.
const { openResults } = require('../lib');

const HOUR = 3_600_000;

/** Hourly forecast from an hour ago for 36 hours; `wet(start)` decides each hour's rain. */
function forecast(wet) {
  const first = Math.floor(Date.now() / HOUR) * HOUR - HOUR;
  return Array.from({ length: 37 }, (_, i) => {
    const start = first + i * HOUR;
    const mm = wet(start);
    return {
      time: new Date(start).toISOString(),
      hours: 1,
      symbol: mm >= 7.6 ? 'heavyrainandthunder' : mm > 0 ? 'rain' : 'partlycloudy_day',
      precipMm: mm,
      precipProbability: null,
      tempC: 29,
    };
  });
}

/** Answers /api/weather by place: `byLat` maps the rounded latitude to a forecast. */
async function answerWeather(page, byLat) {
  await page.unroute('**/api/weather*').catch(() => {});
  await page.route('**/api/weather*', (route) => {
    const lat = new URL(route.request().url()).searchParams.get('lat');
    const periods = byLat[lat];
    if (!periods) return route.fulfill({ status: 502, body: '{"error":"forecast unavailable"}' });
    return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ source: 'MET Norway', periods }) });
  });
}

const CIRCLE = '5.57';
const KASOA = '5.53';
const dry = () => forecast(() => 0);

module.exports = {
  name: 'weather',
  app: 'passenger',
  session: 'passenger',
  async run({ page, base, step }) {
    await step('heavy rain at a flood-prone start: flood warning and umbrella', async () => {
      // Heavy rain at Circle in the coming hour; Kasoa stays dry.
      const nextHour = Math.floor(Date.now() / HOUR) * HOUR + HOUR;
      await answerWeather(page, { [CIRCLE]: forecast((t) => (t === nextHour ? 15 : 0)), [KASOA]: dry() });
      await openResults(page, base, 'Kasoa');
      await page.getByText('Weather for your trip').waitFor();
      await page.getByText(/Heavy rain expected at Kwame Nkrumah Circle around \d/).waitFor();
      await page.getByText('Kwame Nkrumah Circle often floods in heavy rain. Allow extra time and avoid flooded roads.', { exact: false }).waitFor();
      await page.getByText('Take an umbrella. Rain is expected on this trip.').waitFor();
      await page.getByText(/^Kwame Nkrumah Circle, now: 29°C, partly cloudy/).waitFor();
      await page.getByText(/^Kasoa, arriving around \d.*: 29°C, partly cloudy$/).waitFor();
      await page.getByText('Forecast from MET Norway. Arrival times are estimates.').waitFor();
    });

    await step('light rain at the destination: umbrella, no warning', async () => {
      await answerWeather(page, { [CIRCLE]: dry(), [KASOA]: forecast(() => 1.2) });
      await openResults(page, base, 'Kasoa');
      await page.getByText('Take an umbrella. Rain is expected on this trip.').waitFor();
      await page.getByText(/^Kasoa, arriving around .*: 29°C, rain · rain around \d/).waitFor();
      if (await page.getByText(/Heavy rain expected/).count()) throw new Error('unexpected heavy rain warning');
    });

    await step('dry trip says so', async () => {
      await answerWeather(page, { [CIRCLE]: dry(), [KASOA]: dry() });
      await openResults(page, base, 'Kasoa');
      await page.getByText('No rain expected on this trip.').waitFor();
      if (await page.getByText('Take an umbrella', { exact: false }).count()) throw new Error('umbrella on a dry day');
    });

    await step('the forecast at the destination: every 3 hours, then the next day', async () => {
      await answerWeather(page, { [CIRCLE]: dry(), [KASOA]: dry() });
      await openResults(page, base, 'Kasoa');
      await page.getByText('Forecast for Kasoa').waitFor();
      // 4 slots, 3 hours apart, from the 36-hour stand-in forecast.
      const slots = page.getByText(/^\d{1,2}:\d{2}\s?[ap]m$/);
      await slots.nth(3).waitFor();
      await page.getByText(/^[A-Z][a-z]{2},? \d{1,2} [A-Z][a-z]{2}: 29–29°C, partly cloudy$/).first().waitFor();
    });

    await step('no forecast: the weather is hidden and fares still show', async () => {
      await answerWeather(page, {});
      await openResults(page, base, 'Kasoa');
      await page.getByText('GH¢11', { exact: true }).waitFor();
      await page.waitForTimeout(500);
      if (await page.getByText('Weather for your trip').count()) throw new Error('weather shown without a forecast');
    });
  },
};
