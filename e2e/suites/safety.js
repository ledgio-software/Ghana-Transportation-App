// P1-SAFE: emergency numbers (offline too), report a driver with a vehicle photo, rate the driver.
const { sql, PASSENGER } = require('../lib');

// A 1x1 PNG, enough for the photo picker.
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');

module.exports = {
  name: 'safety',
  app: 'passenger',
  session: 'passenger',
  setup: `insert into consents (user_id, consent_type, document_version, granted) values
    ('${PASSENGER}', 'terms', '2026-10-draft-3', true), ('${PASSENGER}', 'privacy', '2026-10-draft-3', true);
  insert into emergency_contacts (name, phone, kind, sort_order) values ('MTTD Accra (test)', '0302000000', 'road_safety', 60);`,
  async run({ page, base, step, browser }) {
    await step('one tap on the home screen dials 112; every number is one tap away, signed out', async () => {
      const ctx = await browser.newContext({ viewport: { width: 360, height: 800 } });
      const anon = await ctx.newPage();
      // The website opens the phone's dialer by going to tel:112; record that instead of following it.
      const cdp = await ctx.newCDPSession(anon);
      const dialled = [];
      await cdp.send('Page.enable');
      cdp.on('Page.frameRequestedNavigation', (e) => dialled.push(e.url));
      await anon.goto(`${base}/`);
      await anon.getByRole('button', { name: 'Call 112: police, fire, ambulance' }).click();
      for (let i = 0; i < 20 && !dialled.includes('tel:112'); i++) await anon.waitForTimeout(100);
      if (!dialled.includes('tel:112')) throw new Error(`dialled: ${dialled.join(' ')}`);
      await anon.goto(`${base}/`);
      await anon.getByRole('link', { name: 'All emergency numbers' }).click();
      await anon.getByText('If anyone is in danger or hurt, call 112 now.').waitFor();
      await anon.getByRole('button', { name: 'Call All emergencies, 112' }).waitFor();
      await anon.getByRole('button', { name: 'Call Fire service, 192' }).waitFor();
      // Staff-added numbers come from the database.
      await anon.getByRole('button', { name: 'Call MTTD Accra (test), 0302000000' }).waitFor();
      await anon.context().close();
    });

    await step('emergency numbers still show with no signal', async () => {
      await page.goto(`${base}/emergency`);
      await page.getByRole('button', { name: 'Call MTTD Accra (test), 0302000000' }).waitFor();
      await page.route('**/rest/v1/**', (route) => route.abort('internetdisconnected'));
      await page.reload();
      await page.getByRole('button', { name: 'Call MTTD Accra (test), 0302000000' }).waitFor();
      await page.getByRole('button', { name: 'Call All emergencies, 112' }).waitFor();
      await page.unroute('**/rest/v1/**');
    });

    await step('report a driver with a photo of the vehicle', async () => {
      const uploads = [];
      await page.route('**/storage/v1/object/report-photos/**', async (route) => {
        const req = route.request();
        uploads.push({ path: decodeURIComponent(new URL(req.url()).pathname.split('/object/report-photos/')[1]), size: req.postDataBuffer()?.length ?? 0 });
        await route.fulfill({ contentType: 'application/json', body: JSON.stringify({ Key: 'report-photos/x', Id: 'x' }) });
      });
      // From the Safety tab.
      await page.goto(`${base}/safety`);
      await page.getByRole('button', { name: 'Report a driver' }).click();
      await page.getByRole('radio', { name: 'Reckless driving' }).click();
      await page.getByLabel('Number plate (if you saw it)').fill('gr  1234-24');
      await page.getByLabel('Tell us more (optional)').fill('Overtaking on a blind curve near Weija');
      const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.getByRole('button', { name: 'Choose photo' }).click()]);
      await chooser.setFiles({ name: 'bus.png', mimeType: 'image/png', buffer: PNG });
      await page.getByRole('button', { name: 'Remove photo 1' }).waitFor();
      await page.getByRole('button', { name: 'Send report' }).click();
      await page.getByText('Thank you. Our team will review your report and pass it on.').waitFor();
      if (uploads.length !== 1 || !uploads[0].path.startsWith(`${PASSENGER}/`) || uploads[0].size !== PNG.length) {
        throw new Error(JSON.stringify(uploads));
      }
      const row = sql("select kind||'|'||vehicle_plate||'|'||note||'|'||array_to_string(photo_paths, ',')||'|'||status from driver_reports");
      if (row !== `reckless_driving|GR 1234-24|Overtaking on a blind curve near Weija|${uploads[0].path}|pending`) throw new Error(row);
      await page.unroute('**/storage/v1/object/report-photos/**');
    });

    await step('a failed photo upload keeps the form and says why', async () => {
      await page.route('**/storage/v1/object/report-photos/**', (route) => route.abort('internetdisconnected'));
      await page.goto(`${base}/report-driver`);
      await page.getByRole('radio', { name: 'Abused passengers' }).click();
      const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.getByRole('button', { name: 'Choose photo' }).click()]);
      await chooser.setFiles({ name: 'bus.png', mimeType: 'image/png', buffer: PNG });
      await page.getByRole('button', { name: 'Send report' }).click();
      await page.getByText('Could not send the photos. Check your internet and try again.').waitFor();
      if (sql('select count(*) from driver_reports') !== '1') throw new Error('report saved without its photo');
      await page.unroute('**/storage/v1/object/report-photos/**');
    });

    await step('rate the driver from the results screen', async () => {
      // Opened directly, so the hidden home screen is not stacked underneath.
      await page.goto(`${base}/results?from=00000000-0000-4000-8000-000000000201&to=00000000-0000-4000-8000-000000000202`);
      await page.getByText('Official fare').first().waitFor();
      await page.getByRole('button', { name: 'Rate the driver' }).click();
      await page.getByRole('radio', { name: '5 stars' }).click();
      await page.getByText('Excellent').waitFor();
      await page.getByRole('checkbox', { name: 'Safe driving' }).click();
      await page.getByRole('checkbox', { name: 'Polite' }).click();
      await page.getByRole('button', { name: 'Send rating' }).click();
      await page.getByText('Thank you for rating your driver.').waitFor();
      const row = sql("select rating||'|'||array_to_string(tags, ',')||'|'||(route_id is not null) from driver_ratings");
      if (row !== '5|safe_driving,polite|true') throw new Error(row);
    });

    await step('a bad rating offers to report the driver', async () => {
      await page.goto(`${base}/rate-driver`);
      await page.getByRole('radio', { name: '2 stars' }).click();
      await page.getByRole('checkbox', { name: 'Reckless' }).click();
      if (await page.getByRole('checkbox', { name: 'Polite' }).count()) throw new Error('praise offered for 2 stars');
      await page.getByRole('button', { name: 'Send rating' }).click();
      await page.getByText('Was it serious? You can also report the driver.').waitFor();
      await page.getByRole('button', { name: 'Report a driver' }).click();
      await page.getByRole('radio', { name: 'Reckless driving' }).waitFor();
    });

    await step('signed out: reporting and rating ask to sign in', async () => {
      const anon = await (await browser.newContext({ viewport: { width: 360, height: 800 } })).newPage();
      await anon.goto(`${base}/`);
      await anon.goto(`${base}/report-driver`);
      await anon.getByRole('heading', { name: 'Sign in to report a driver' }).waitFor();
      await anon.getByText('Other passengers never see your name or number.').waitFor();
      await anon.getByRole('button', { name: 'Not now' }).click();
      await anon.getByRole('button', { name: 'Call 112: police, fire, ambulance' }).waitFor();
      await anon.goto(`${base}/rate-driver`);
      await anon.getByRole('heading', { name: 'Sign in to rate the driver' }).waitFor();
      await anon.getByRole('button', { name: 'Sign in with your phone number' }).click();
      await anon.getByRole('button', { name: 'Send code' }).waitFor();
      await anon.context().close();
    });
  },
};
