// P1-OFF: after one visit, the web app (iPhone home-screen app) opens with no network and
// shows the stations and fares saved on the phone, including screens not opened before.
const { openResults } = require('../lib');

const RESULTS = '/results?from=00000000-0000-4000-8000-000000000201&to=00000000-0000-4000-8000-000000000202';

module.exports = {
  name: 'offline',
  app: 'passenger',
  async run({ base, step, browser }) {
    const ctx = await browser.newContext({ viewport: { width: 360, height: 800 }, serviceWorkers: 'allow' });
    const page = await ctx.newPage();

    await step('the first visit saves the app and the fares on the phone', async () => {
      await page.goto(`${base}/`);
      await page.getByRole('button', { name: /^From/ }).waitFor();
      await page.evaluate(() => navigator.serviceWorker.ready);
      await page.waitForFunction(async () => {
        const keys = await (await caches.open('gta-files-v1')).keys();
        return keys.some((r) => /\/emergency-[0-9a-f]+\.js$/.test(r.url));
      });
      await openResults(page, base, 'Kasoa');
    });

    await step('with no network the app opens and shows the saved stations and fares', async () => {
      await ctx.setOffline(true);
      // Requests the offline worker makes are cut too.
      await ctx.route('**/*', (route) => route.abort('internetdisconnected'));
      await page.goto(`${base}/`);
      await page.getByText(/^Offline\. Showing fares saved on/).waitFor();
      await page.goto(`${base}${RESULTS}`);
      await page.getByText('Official fare').first().waitFor();
      await page.getByText(/^Offline\. Showing fares saved on/).waitFor();
    });

    await step('a screen never opened before still opens offline', async () => {
      await page.goto(`${base}/emergency`);
      await page.getByText('If anyone is in danger or hurt, call 112 now.').waitFor();
    });

    await ctx.close();
  },
};
