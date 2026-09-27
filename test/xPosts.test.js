// HPD's X posts: turning X API responses (made-up ones in fixtures/) into post cards. The text
// is kept whole, as X's display requirements ask; only its links become real links.
const fs = require('node:fs');
const path = require('node:path');
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { toPostCards } = require('../services/news/fetchXPosts');

const { user, timeline } = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'xTimeline.json'), 'utf8'));
const [roadClosure, thankYou, keikiId, video] = toPostCards(user, timeline);

// The text as a reader sees it, with each link as [text](href)
const asRead = (card) => card.segments.map((segment) => (segment.href ? `[${segment.text}](${segment.href})` : segment.text)).join('');

describe('toPostCards', () => {
  it('keeps the author, time, and a link to the post on X', () => {
    assert.equal(roadClosure.postId, '1971000000000000004');
    assert.equal(roadClosure.postedAt.toISOString(), '2026-09-27T20:15:00.000Z');
    assert.equal(roadClosure.name, 'Honolulu Police');
    assert.equal(roadClosure.username, 'honolulupolice');
    assert.equal(roadClosure.url, 'https://x.com/honolulupolice/status/1971000000000000004');
  });

  it('uses the sharper avatar size', () => {
    assert.equal(roadClosure.avatarUrl, 'https://pbs.twimg.com/profile_images/1234567890/example_bigger.jpg');
  });

  it('shows t.co links as the address they lead to, and decodes &amp;', () => {
    assert.equal(
      asRead(roadClosure),
      'Road closure: Kalanianaʻole Hwy is closed both ways near Makapuʻu Point for a crash. Use alternate routes & ' +
        'expect delays. More: [honolulupd.org/traffic-adviso…](https://www.honolulupd.org/traffic-advisories/)'
    );
  });

  it('links @mentions and #hashtags (Hawaiian letters included), and drops the link to attached photos', () => {
    assert.equal(
      asRead(thankYou),
      'Thank you [@ExampleFireDept](https://x.com/ExampleFireDept) for the assist today! 🚒🚓 ' +
        '[#HPD](https://x.com/hashtag/HPD) [#Oʻahu](https://x.com/hashtag/O%CA%BBahu)'
    );
  });

  it('shows the full text of a long post, line breaks and all, and leaves an email address alone', () => {
    assert.equal(
      asRead(keikiId),
      'Reminder: our Keiki ID event is this Saturday at Kapiʻolani Park, 9 a.m. to 1 p.m. Bring your child for a free ID ' +
        'card & safety tips from officers.\n\nParents <3 this event, and so do we. Questions? Email info@example.org\n\n' +
        'Details: [honolulupd.org/keiki-id/](https://www.honolulupd.org/keiki-id/) [#KeikiID](https://x.com/hashtag/KeikiID)'
    );
  });

  it('shows the first photo, at the small size, and counts the rest', () => {
    assert.deepEqual(thankYou.media, {
      url: 'https://pbs.twimg.com/media/example1.jpg?name=small',
      alt: 'Officers and firefighters beside a patrol car',
      isVideo: false,
    });
    assert.equal(thankYou.moreMediaCount, 1);
    assert.equal(roadClosure.media, null);
  });

  it("shows a video's preview image, marked as a video", () => {
    assert.deepEqual(video.media, {
      url: 'https://pbs.twimg.com/ext_tw_video_thumb/1971000000000000011/pu/img/example3.jpg',
      alt: '',
      isVideo: true,
    });
    assert.equal(asRead(video), 'Watch: officers demonstrate how to spot a scam call.');
  });

  it('never links anything but a web address, and never shows images from other hosts', () => {
    const post = structuredClone(timeline.data[0]);
    post.entities.urls[0].expanded_url = 'javascript:alert(1)';
    const [unsafe] = toPostCards(user, { data: [post] });
    assert.ok(unsafe.segments.every((segment) => !segment.href));

    const elsewhere = structuredClone(timeline);
    elsewhere.includes.media[0].url = 'https://example.com/photo.jpg';
    assert.equal(toPostCards(user, elsewhere)[1].media, null);
  });

  it('returns no cards when the account has no posts, and fails if the account is missing', () => {
    assert.deepEqual(toPostCards(user, { meta: { result_count: 0 } }), []);
    assert.throws(() => toPostCards({ errors: [{ title: 'Not Found Error' }] }, timeline), /couldn't find @honolulupolice/);
  });
});
