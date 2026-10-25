// The islands Check Da Kine covers (services/agencies.js), and how a route picks one
// (middleware/agency.js): every island has every path, model and word the pages use, Oʻahu
// keeps its addresses, and no two islands share data.
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { agencies, islandList } = require('../services/agencies');
const { useAgency } = require('../middleware/agency');

describe('agencies', () => {
  it('keeps Oʻahu at its old addresses', () => {
    assert.deepEqual(agencies.oahu.paths, { stats: '/', arrests: '/arrests' });
  });

  it('gives the Big Island its own pages, collections and archive folder', () => {
    const { oahu, bigIsland } = agencies;
    assert.deepEqual(bigIsland.paths, { stats: '/big-island', arrests: '/big-island/arrests' });
    assert.equal(bigIsland.Record.collection.collectionName, 'bigislandarrests');
    assert.equal(bigIsland.Log.collection.collectionName, 'bigislandbookinglogs');
    assert.notEqual(bigIsland.Record.collection.collectionName, oahu.Record.collection.collectionName);
    assert.notEqual(bigIsland.archiveFolder, oahu.archiveFolder);
  });

  it('gives every island every word the pages use, so a new one cannot leave a page blank', () => {
    const wordsOf = (island) => Object.keys(island.copy).sort();
    islandList.forEach((island) => {
      assert.deepEqual(wordsOf(island), wordsOf(agencies.oahu), island.key);
      Object.entries(island.copy).forEach(([word, value]) => assert.ok(value, `${island.key}.${word} is empty`));
    });
  });

  it("words each island's out-of-date notice", () => {
    assert.equal(
      agencies.bigIsland.copy.staleMessage('Oct 24, 2026, 5:58 AM HST', '31 hours ago'),
      "No new booking log since Oct 24, 2026, 5:58 AM HST (31 hours ago). Either the Hawaiʻi Police Department hasn't published one, or our scraper has stopped."
    );
  });
});

describe('useAgency', () => {
  it('tells the controller which island a route serves', () => {
    const req = {};
    let movedOn = false;
    useAgency('bigIsland')(req, {}, () => (movedOn = true));
    assert.equal(req.agency, agencies.bigIsland);
    assert.equal(movedOn, true);
  });

  it('refuses an island that does not exist as soon as the routes load', () => {
    assert.throws(() => useAgency('maui'), /No island called "maui"/);
  });
});
