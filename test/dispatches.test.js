// Dispatch calls: reading HPD's page (from a trimmed saved copy in fixtures/) and turning its
// masked addresses into searches the map geocoder can find.
const fs = require('node:fs');
const path = require('node:path');
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { parseDispatchPage } = require('../services/dispatches/fetchDispatches');
const { buildQueries, placeKey } = require('../services/dispatches/geocodePlaces');

const savedPage = fs.readFileSync(path.join(__dirname, 'fixtures', 'dispatchPage.html'), 'utf8');

describe('parseDispatchPage', () => {
  const { updatedAt, calls, skippedRows } = parseDispatchPage(savedPage);

  it("reads the \"last updated\" time as Hawaii time, ignoring HPD's stray PM", () => {
    // Printed "September 26, 2026 21:29:06 PM": a 24-hour time with a meaningless PM
    assert.equal(updatedAt.toISOString(), '2026-09-27T07:29:06.000Z');
  });

  it('reads every call and skips the spacer and header rows', () => {
    assert.equal(calls.length, 4);
    assert.deepEqual(calls[0], {
      receivedAt: new Date('2026-09-27T07:07:15.000Z'),
      type: 'PARKING VIOLATION',
      address: 'KAPIOLANI BLVD / DREIER ST',
      city: 'HONOLULU',
      district: 'District 1',
    });
  });

  it("collapses HPD's doubled spaces", () => {
    assert.equal(calls[1].address, '8909XX NANAKULI AVE');
  });

  it("skips and counts a call whose date doesn't exist", () => {
    assert.equal(skippedRows, 1);
  });

  it('fails loudly if the page layout changes', () => {
    assert.throws(() => parseDispatchPage('<html><body><p>Down for maintenance</p></body></html>'), /Data last updated on/);
  });
});

describe('buildQueries', () => {
  const texts = (place) => buildQueries(place).map((query) => `${query.precision}: ${query.text}`);

  it('rebuilds a masked house number as its block, then falls back to the street', () => {
    assert.deepEqual(texts({ address: '51XX LIKINI ST', city: 'HONOLULU' }), [
      'block: 5100 LIKINI ST, HONOLULU, Hawaii',
      'street: LIKINI ST, HONOLULU, Hawaii',
      'street: LIKINI ST, Hawaii',
    ]);
  });

  it("restores the hyphen in Oahu's zone-lot numbers", () => {
    const [nanakuli] = texts(parseDispatchPage(savedPage).calls[1]);
    assert.equal(nanakuli, 'block: 89-900 NANAKULI AVE, NANAKULI, Hawaii');
    assert.equal(texts({ address: '911200 FORT WEAVER RD', city: 'EWA BEACH' })[0], 'block: 91-1200 FORT WEAVER RD, EWA BEACH, Hawaii');
  });

  it('skips the block when the mask hides the whole number', () => {
    assert.equal(texts({ address: 'XX KAM HWY', city: 'KAAAWA' })[0], 'street: KAMEHAMEHA HWY, KAAAWA, Hawaii');
    assert.equal(texts({ address: '9900XX FARRINGTON HWY', city: 'WAIANAE' })[0], 'street: FARRINGTON HWY, WAIANAE, Hawaii');
  });

  it('sends intersections straight to street level, expanding HPD abbreviations', () => {
    assert.deepEqual(texts({ address: 'PUHAWAI RD / LUALUALEI HMSTD RD', city: 'WAIANAE' }), [
      'street: PUHAWAI RD, WAIANAE, Hawaii',
      'street: LUALUALEI HOMESTEAD RD, WAIANAE, Hawaii',
      'street: PUHAWAI RD, Hawaii',
      'street: LUALUALEI HOMESTEAD RD, Hawaii',
    ]);
  });

  it("uses Honolulu for HPD areas that aren't places on the map", () => {
    assert.equal(texts({ address: '35XX N NIMITZ HWY', city: 'AIRPORT' })[0], 'block: 3500 N NIMITZ HWY, HONOLULU, Hawaii');
  });

  it('caches each place under its address and city', () => {
    assert.equal(placeKey({ address: '51XX LIKINI ST', city: 'HONOLULU' }), '51XX LIKINI ST|HONOLULU');
  });
});
