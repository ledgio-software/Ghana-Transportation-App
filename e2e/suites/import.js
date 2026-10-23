// Field-team spreadsheet import (Phase 0 doc 4.2) for stations and fares.
const fs = require('fs');
const { sql } = require('../lib');

const today = new Date().toLocaleDateString('en-GB', { timeZone: 'Africa/Accra' });
const stationsCsv = [
  'name,short_id,type,city,region,latitude,longitude,ghanapost_gps',
  'Madina,,lorry station,Accra,Greater Accra,5.668,-0.165,GM-001-0001',
  '"Kaneshie",,lorry station,Accra,Greater Accra,5.566,-0.236,',
  'Swapped Stop,,stop,Accra,Greater Accra,-0.2,5.6,',
].join('\r\n');
const faresCsv = [
  'from_station,to_station,route_type,operator,vehicle_type,class,fare_ghs,official,date_observed,source,source_type,departure,first_departure,last_departure,collector,photo_link',
  `Madina,Kaneshie,intracity,GPRTU,trotro,,8.50,yes,${today},Madina board Oct 2026,station board,when full,5:30,21:00,Ama,`,
  `Kwame Nkrumah Circle,Kasoa,intracity,GPRTU,trotro,,11,yes,${today},,ridden,when full,,,Kofi,`,
  `Kwame Nkrumah Circle,Fadama,intracity,GPRTU,trotro,,6.00,yes,${today},,ridden,when full,,,Kofi,`,
  `Circle,Kasoa,intracity,GPRTU,trotro,,11,yes,${today},,ridden,when full,,,Kofi,`,
].join('\r\n');

module.exports = {
  name: 'import',
  app: 'admin',
  session: 'staff',
  async run({ page, base, step }) {
    const upload = (name, text) =>
      page.getByLabel('CSV file').setInputFiles({ name, mimeType: 'text/csv', buffer: Buffer.from(text) });
    await page.goto(`${base}/import`);

    await step('template has the agreed columns', async () => {
      const [dl] = await Promise.all([
        page.waitForEvent('download'),
        page.getByRole('button', { name: 'Download fares template' }).click(),
      ]);
      const text = fs.readFileSync(await dl.path(), 'utf8');
      if (!text.startsWith('from_station,to_station,route_type,operator,vehicle_type')) throw new Error(text.slice(0, 80));
    });
    await step('wrong file type explained', async () => {
      await page.getByLabel('CSV file').setInputFiles({ name: 'fares.xlsx', mimeType: 'application/octet-stream', buffer: Buffer.from('x') });
      await page.getByText(/Choose a \.csv file/).waitFor();
    });
    await step('stations: preview with line numbers, then import', async () => {
      await page.getByRole('button', { name: 'Stations' }).click();
      await upload('stations.csv', stationsCsv);
      await page.getByText('2 rows ready').waitFor();
      await page.getByText('1 row with problems').waitFor();
      await page.getByRole('row', { name: /^4 / }).getByText(/latitude "-0.2" is not in Ghana/).waitFor();
      await page.getByRole('button', { name: 'Import 2 rows' }).click();
      await page.getByText('Added: 2').waitFor();
      if (sql("select count(*) from stations where slug in ('madina','kaneshie')") !== '2') throw new Error('stations not saved');
    });
    await step('fares: created, confirmed and changed per line', async () => {
      await page.getByRole('button', { name: 'Fares' }).click();
      await upload('fares.csv', faresCsv);
      await page.getByText('3 rows ready').waitFor();
      await page.getByRole('row', { name: /^5 / }).getByText(/"Circle" is not a known station/).waitFor();
      await page.getByRole('button', { name: 'Import 3 rows' }).click();
      await page.getByText('Added: 1 · Confirmed (same price): 1 · Price changed: 1').waitFor();
      const madina = sql("select f.amount_pesewas||','||f.collected_by||','||f.first_departure from fares f join routes r on r.id = f.route_id join stations s on s.id = r.origin_station_id where s.slug = 'madina' and f.effective_to is null");
      if (madina !== '850,Ama,05:30:00') throw new Error(`madina ${madina}`);
      const fadama = sql("select string_agg(amount_pesewas::text, ',' order by created_at) from fares where route_id = '00000000-0000-4000-8000-000000000302'");
      if (fadama !== '500,600') throw new Error(`fadama history ${fadama}`);
    });
  },
};
