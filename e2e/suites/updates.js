// Web app updates: a page left open across a deploy asks for screen files that no longer exist.
// It should reload once and carry on, not show a broken screen.
module.exports = {
  name: 'updates',
  app: 'passenger',
  session: 'passenger',
  async run({ page, base, step, browser }) {
    await step('a missing screen file after a deploy reloads the app once', async () => {
      await page.goto(`${base}/`);
      await page.getByRole('button', { name: /^From/ }).waitFor();
      // The results screen file is gone the first time (as after a new deploy), then available.
      let failed = 0;
      await page.route('**/_expo/static/js/web/results-*.js', (route) =>
        failed++ === 0 ? route.fulfill({ status: 404, body: 'Not found' }) : route.continue(),
      );
      const reloaded = page.waitForEvent('load');
      await page.getByRole('button', { name: /^From/ }).click();
      await page.getByText('Kwame Nkrumah Circle').click();
      await page.getByRole('button', { name: /^To/ }).click();
      await page.getByText('Kasoa', { exact: true }).first().click();
      await page.getByRole('button', { name: 'Find fares' }).click();
      await reloaded;
      await page.getByText('Official fare').first().waitFor();
      if (failed !== 2) throw new Error(`results file requested ${failed} times`);
    });

    await step('a lasting outage does not reload in a loop', async () => {
      // Its own tab: the error it shows on purpose is not a failure of the other steps.
      const tab = await (await browser.newContext({ viewport: { width: 360, height: 800 } })).newPage();
      let loads = 0;
      tab.on('load', () => loads++);
      await tab.route('**/_expo/static/js/web/alerts-*.js', (route) => route.fulfill({ status: 404, body: 'Not found' }));
      await tab.goto(`${base}/alerts`);
      await tab.waitForTimeout(3000);
      await tab.context().close();
      // The first load, then at most one reload.
      if (loads > 2) throw new Error(`reloaded ${loads} times`);
    });
  },
};
