// P1-TRIP-01 and P1-TRIP-03: route map (loaded on request) and Google Maps directions.
const { sql, openResults } = require('../lib');

const coords = (slug) => sql(`select latitude||','||longitude from stations where slug = '${slug}'`);

module.exports = {
  name: 'maps',
  app: 'passenger',
  session: 'passenger',
  async run({ page, base, step }) {
    // Never reach Google from the tests: answer with an empty page instead.
    await page.context().route('https://www.google.com/**', (route) => route.fulfill({ body: '<html></html>' }));
    const circle = coords('kwame-nkrumah-circle');
    const kasoa = coords('kasoa');

    await step('the map only loads when asked for, then shows the route', async () => {
      await openResults(page, base, 'Kasoa');
      await page.getByText('The map uses mobile data.').waitFor();
      if ((await page.locator('iframe').count()) !== 0) throw new Error('map loaded before it was asked for');
      await page.getByRole('button', { name: 'Show route on map' }).click();
      const src = await page.getByTitle('Map of the route from Kwame Nkrumah Circle to Kasoa').getAttribute('src');
      const url = new URL(src);
      if (url.origin + url.pathname !== 'https://www.google.com/maps/embed/v1/directions') throw new Error(src);
      const got = [url.searchParams.get('key'), url.searchParams.get('origin'), url.searchParams.get('destination')];
      if (got.join('|') !== ['e2e-maps-key', circle, kasoa].join('|')) throw new Error(got.join('|'));
      await page.getByRole('button', { name: 'Hide map' }).click();
      await page.getByRole('button', { name: 'Show route on map' }).waitFor();
    });

    await step('directions open in Google Maps: the trip, and walking to the station', async () => {
      const opened = async (name) => {
        const [popup] = await Promise.all([page.context().waitForEvent('page'), page.getByRole('link', { name }).click()]);
        const url = new URL(popup.url());
        await popup.close();
        return [url.searchParams.get('origin') ?? 'here', url.searchParams.get('destination'), url.searchParams.get('travelmode')].join('|');
      };
      const trip = await opened('Open directions in Google Maps');
      if (trip !== `${circle}|${kasoa}|driving`) throw new Error(trip);
      const walk = await opened('Walking directions to Kwame Nkrumah Circle');
      if (walk !== `here|${circle}|walking`) throw new Error(walk);
    });
  },
};
