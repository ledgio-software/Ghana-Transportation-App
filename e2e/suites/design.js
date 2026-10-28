// The redesign: bottom tabs, swap start and destination, and swipeable fare cards when there is a choice.
const { openResults } = require('../lib');

module.exports = {
  name: 'design',
  app: 'passenger',
  session: 'passenger',
  async run({ page, base, step }) {
    await step('home: greeting, tabs, and swapping start and destination', async () => {
      await page.goto(`${base}/`);
      await page.getByText('Akwaaba!').waitFor();
      for (const tab of ['Home', 'My trips', 'Safety', 'Settings']) await page.getByRole('tab', { name: tab }).waitFor();
      await page.getByRole('button', { name: /^From/ }).click();
      await page.getByText('Kwame Nkrumah Circle').click();
      await page.getByRole('button', { name: /^To/ }).click();
      await page.getByText('Kasoa', { exact: true }).first().click();
      await page.getByRole('button', { name: 'Swap start and destination' }).click();
      await page.getByRole('button', { name: 'From: Kasoa' }).waitFor();
      await page.getByRole('button', { name: 'To: Kwame Nkrumah Circle' }).waitFor();
    });

    await step('tabs open My trips, Safety and Settings', async () => {
      await page.getByRole('tab', { name: 'My trips' }).click();
      await page.getByText('No saved trips yet.', { exact: false }).waitFor();
      await page.getByRole('tab', { name: 'Safety' }).click();
      await page.getByRole('button', { name: 'Call All emergencies, 112' }).filter({ visible: true }).waitFor();
      await page.getByRole('tab', { name: 'Settings' }).click();
      await page.getByRole('radio', { name: 'Twi' }).filter({ visible: true }).waitFor();
    });

    await step('a route with several ways to travel shows cards to choose from', async () => {
      await openResults(page, base, 'Asafo (Kumasi)');
      await page.getByText('Ways to travel').waitFor();
      const executive = page.getByRole('radio', { name: /executive, GH¢150$/ });
      const standard = page.getByRole('radio', { name: /Intercity bus, GH¢120$/ });
      const checked = async () => [await executive.getAttribute('aria-checked'), await standard.getAttribute('aria-checked')].join(',');
      // One option is chosen from the start; tapping a card chooses it and the details below follow.
      if (!['true,false', 'false,true'].includes(await checked())) throw new Error(await checked());
      await executive.click();
      if ((await checked()) !== 'true,false') throw new Error(await checked());
      await page.getByText('VIP Jeoun · Intercity bus · executive', { exact: true }).last().waitFor();
      await standard.click();
      if ((await checked()) !== 'false,true') throw new Error(await checked());
      await page.getByText('VIP Jeoun · Intercity bus', { exact: true }).last().waitFor();
      // The details show the chosen option's fare, not the other one.
      // GH¢150 only on its own card; GH¢120 on its card and in the details.
      const counts = [await page.getByText('GH¢150', { exact: true }).count(), await page.getByText('GH¢120', { exact: true }).count()];
      if (counts.join(',') !== '1,2') throw new Error(`fare counts ${counts}`);
      await page.getByLabel('Fare you were asked to pay (GH¢)').fill('140');
      await page.getByText('Above normal fare').waitFor();
    });

    await step('a route with one way to travel shows it directly', async () => {
      await openResults(page, base, 'Kasoa');
      if (await page.getByText('Ways to travel').count()) throw new Error('cards shown for a single option');
    });
  },
};
