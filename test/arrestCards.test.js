// Arrest cards: what a guest sees and what a logged-in user sees. Names, officers, and the link
// to the arrest log (whose PDF prints every name) are for logged-in users only.
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const cloudinary = require('../config/cloudinary');
const { toCard } = require('../services/arrests/listArrests');
const { agencies } = require('../services/agencies');

// Made-up credentials. Links are signed locally, so nothing is sent anywhere.
cloudinary.config({ cloud_name: 'example', api_key: '000', api_secret: 'test-secret' });

// A record as the Arrests query returns it, with every field filled in. Every value is made up.
const record = {
  arrestedAt: new Date('2026-09-27T01:48:00.000Z'),
  name: 'DOE, JANE',
  ethnicities: ['Hawaiian'],
  sex: 'F',
  age: 32,
  offenses: [
    {
      reportNumber: '26000000-001',
      offenseName: 'THEFT 4',
      statute: 'HRS 708-0833',
      location: '1XX EXAMPLE ST',
      officer: 'OFFICER, TEST',
    },
  ],
  lastSeenIn: {
    fileName: '2026-09-26-17-00-32_Arrest_Log.pdf',
    publishedAt: new Date('2026-09-27T03:00:32.000Z'),
    pdfUrl: 'https://res.cloudinary.com/example/raw/upload/checkDaKine/arrestLogs/2026-09-26-17-00-32_Arrest_Log.pdf',
    sourceUrl: 'https://www.honolulupd.org/wp-content/uploads/2026/09/2026-09-26-17-00-32_Arrest_Log.pdf',
  },
  warnings: [],
};

describe('toCard', () => {
  it('gives a guest no names and no link to the arrest log', () => {
    const card = toCard(record, false);
    assert.equal(card.name, 'Name withheld');
    assert.ok(!card.source);

    // Nothing anywhere on the card names anyone or leads to the PDF
    const everything = JSON.stringify(card);
    ['DOE', 'OFFICER, TEST', 'Arrest_Log.pdf'].forEach((hidden) => {
      assert.ok(!everything.includes(hidden), `a guest's card includes "${hidden}"`);
    });
  });

  it('gives a logged-in user the names and a link to our copy of the log', () => {
    const card = toCard(record, true);
    assert.equal(card.name, 'DOE, JANE');
    assert.ok(card.offenses[0].fields.some(([label, value]) => label === 'Arresting officer' && value === 'OFFICER, TEST'));
    assert.equal(card.source.url, record.lastSeenIn.pdfUrl);
    assert.match(card.source.label, /^Sep 26, 2026/);
  });

  it('gives a logged-in user a signed link to a private copy', () => {
    const pdfUrl = record.lastSeenIn.pdfUrl.replace('/raw/upload/', '/raw/authenticated/');
    const card = toCard({ ...record, lastSeenIn: { ...record.lastSeenIn, pdfUrl } }, true);
    assert.match(card.source.url, /\/raw\/authenticated\/s--[\w-]{8}--\/.*2026-09-26-17-00-32_Arrest_Log\.pdf/);
  });

  it("links HPD's own copy when the log wasn't archived", () => {
    const card = toCard({ ...record, lastSeenIn: { ...record.lastSeenIn, pdfUrl: undefined } }, true);
    assert.equal(card.source.url, record.lastSeenIn.sourceUrl);
  });
});

describe('toCard for a Big Island arrest', () => {
  // The same made-up arrest, as the Big Island's booking logs print it: a hometown instead of a
  // location, bail on each charge, and the log archived in the Big Island's own folder
  const bookingLog = 'Media-Booking-Report_2026-10-24-05-58-36.pdf';
  const bigIslandRecord = {
    ...record,
    residence: 'HILO',
    offenses: [{ ...record.offenses[0], location: undefined, releaseInfo: 'Released to District CT', bailSet: 1000, bailPosted: 0 }],
    lastSeenIn: {
      fileName: bookingLog,
      publishedAt: new Date('2026-10-24T15:58:36.000Z'),
      pdfUrl: `https://res.cloudinary.com/example/raw/authenticated/v1790000000/checkDaKine/bigIslandBookings/${bookingLog}`,
      sourceUrl: `https://www.hawaiipolice.gov/wp-content/uploads/bookingLogs/Media%20Booking%20Report_2026-10-24-05-58-36.pdf`,
    },
  };

  it('gives a guest no names, no hometown and no link to the booking log', () => {
    const card = toCard(bigIslandRecord, false, agencies.bigIsland);
    assert.equal(card.hometown, undefined);
    assert.ok(!card.source);

    const everything = JSON.stringify(card);
    ['DOE', 'OFFICER, TEST', 'HILO', 'Booking'].forEach((hidden) => {
      assert.ok(!everything.includes(hidden), `a guest's card includes "${hidden}"`);
    });
  });

  it("gives a logged-in user the hometown, the bail, and a signed link into the Big Island's folder", () => {
    const card = toCard(bigIslandRecord, true, agencies.bigIsland);
    assert.equal(card.hometown, 'HILO');
    assert.ok(card.offenses[0].fields.some(([label, value]) => label === 'Bail' && value === '$1,000 set'));
    assert.match(card.source.url, /\/raw\/authenticated\/s--[\w-]{8}--\/.*checkDaKine\/bigIslandBookings\/Media-Booking-Report/);
  });

  it('words bail that was posted, and bail that was never set', () => {
    const bailOf = (bailSet, bailPosted) => {
      const card = toCard({ ...bigIslandRecord, offenses: [{ ...bigIslandRecord.offenses[0], bailSet, bailPosted }] }, false, agencies.bigIsland);
      return card.offenses[0].fields.find(([label]) => label === 'Bail')?.[1];
    };
    assert.equal(bailOf(2000, 2000), '$2,000 set, $2,000 posted');
    assert.equal(bailOf(0, 0), 'None set');
  });

  it("shows no bail on an Oʻahu card, whose logs don't print it", () => {
    assert.ok(!toCard(record, true).offenses[0].fields.some(([label]) => label === 'Bail'));
  });
});
