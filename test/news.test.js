// HPD's news releases: turning posts from its WordPress API (a trimmed saved copy in fixtures/)
// into the releases shown on the home page.
const fs = require('node:fs');
const path = require('node:path');
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { toRelease } = require('../services/news/fetchNewsReleases');

const posts = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'hpdNewsPosts.json'), 'utf8'));
const [waikiki, gambling, kahaluu, thirtyByThirty] = posts.map(toRelease);

describe('toRelease', () => {
  it('keeps the id, link, and publish time (WordPress sends UTC without the "Z")', () => {
    assert.equal(waikiki.wpId, 68600);
    assert.equal(waikiki.url, 'https://www.honolulupd.org/three-juveniles-arrested-following-shots-fired-in-waikiki/');
    assert.equal(waikiki.publishedAt.toISOString(), '2026-09-27T13:12:47.000Z');
  });

  it('decodes HTML entities in titles and trims stray spaces', () => {
    assert.equal(waikiki.title, 'Three Juveniles Arrested Following Shots Fired in Waikīkī');
    assert.equal(kahaluu.title, 'Suspect Arrested for Kahalu’u Attempted Murder');
    assert.equal(thirtyByThirty.title, 'HPD Joins 30×30 Initiative to Support Women in Law Enforcement');
  });

  it('turns the excerpt into plain text ending in a single "…"', () => {
    assert.equal(
      waikiki.excerpt,
      'On September 26, 2026, at approximately 11:45 p.m., officers responded to the Waikīkī area after witnesses ' +
        'reported hearing gunshots. Responding officers found evidence of a shooting, including damage to nearby…'
    );
    assert.ok(posts.map(toRelease).every((release) => !release.excerpt.includes('[') && !release.excerpt.includes('<')));
  });

  it("handles an excerpt cut off without its closing bracket, or one that wasn't cut", () => {
    const withExcerpt = (rendered) => toRelease({ ...posts[0], excerpt: { rendered } }).excerpt;
    assert.equal(withExcerpt('<p>Officers responded to the area [&hellip;</p>'), 'Officers responded to the area…');
    assert.equal(withExcerpt('<p>The event is on Saturday.</p>'), 'The event is on Saturday.');
    assert.equal(withExcerpt(''), '');
  });

  it("takes the featured photo's 768px size, and null when there's no photo", () => {
    assert.deepEqual(gambling.image, {
      url: 'https://www.honolulupd.org/wp-content/uploads/2026/09/HPD-Photo_2-768x576.jpg',
      alt: '',
    });
    assert.equal(waikiki.image, null);
  });

  it("drops links and photos that aren't on HPD's site", () => {
    const elsewhere = { ...posts[1], link: 'https://example.com/fake-release/' };
    assert.equal(toRelease(elsewhere), null);

    const photoElsewhere = structuredClone(posts[1]);
    photoElsewhere._embedded['wp:featuredmedia'][0].media_details.sizes.medium_large.source_url = 'https://example.com/photo.jpg';
    assert.equal(toRelease(photoElsewhere).image, null);
  });

  it('drops a post with no title or an unreadable date', () => {
    assert.equal(toRelease({ ...posts[0], title: { rendered: '  ' } }), null);
    assert.equal(toRelease({ ...posts[0], date_gmt: 'not a date' }), null);
  });
});
