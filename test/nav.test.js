// The site nav (views/partials/nav.ejs): Home and Arrests lead to the pages of the island on
// screen, and the page you're on is marked for screen readers.
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const ejs = require('ejs');
const { agencies } = require('../services/agencies');

const navFile = path.join(__dirname, '../views/partials/nav.ejs');

// Each link as [href, label, whether it's marked as the current page]
const renderLinks = async (data) => {
  const html = await ejs.renderFile(navFile, data);
  return [...html.matchAll(/<a class="navLink" href="([^"]*)"( aria-current="page")?>([^<]*)<\/a>/g)].map(
    ([, href, current, label]) => [href, label, Boolean(current)]
  );
};

describe('nav', () => {
  it("leads to Oʻahu's pages everywhere but another island's", async () => {
    // Dispatches is Oʻahu's, and gets the default island from app.locals (server.js)
    assert.deepEqual(await renderLinks({ agency: agencies.oahu, currentPath: '/dispatches' }), [
      ['/', 'Home', false],
      ['/arrests', 'Arrests', false],
      ['/dispatches', 'Dispatches', true],
      ['/login', 'Log in', false],
    ]);
  });

  it("follows the Big Island on the Big Island's pages", async () => {
    assert.deepEqual(await renderLinks({ agency: agencies.bigIsland, currentPath: '/big-island/arrests' }), [
      ['/big-island', 'Home', false],
      ['/big-island/arrests', 'Arrests', true],
      ['/dispatches', 'Dispatches', false],
      ['/login', 'Log in', false],
    ]);
    const [home] = await renderLinks({ agency: agencies.bigIsland, currentPath: '/big-island' });
    assert.deepEqual(home, ['/big-island', 'Home', true]);
  });
});
