// Arrest cards: what a guest sees and what a logged-in user sees. Names, officers, and the link
// to the arrest log (whose PDF prints every name) are for logged-in users only.
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { toCard } = require('../services/arrests/listArrests');

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

  it("links HPD's own copy when the log wasn't archived", () => {
    const card = toCard({ ...record, lastSeenIn: { ...record.lastSeenIn, pdfUrl: undefined } }, true);
    assert.equal(card.source.url, record.lastSeenIn.sourceUrl);
  });
});
