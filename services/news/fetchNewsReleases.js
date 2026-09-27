// Reads HPD's latest news releases from its website's WordPress API (the "News Releases"
// category), with each release's featured image when it has one.

const cheerio = require('cheerio');
const { fetchFromHpd } = require('../hpdRequest');

const hpdSite = 'https://www.honolulupd.org/';
const newsReleasesCategory = 82;
const latestCount = 10;
const releasesUrl =
  `${hpdSite}wp-json/wp/v2/posts?categories=${newsReleasesCategory}&per_page=${latestCount}&_embed=wp:featuredmedia`;

// WordPress sends titles and excerpts as HTML ("Kahalu&#8217;u", "<p>…</p>"); keep the text
const toPlainText = (html) => cheerio.load(html ?? '', null, false).text().replace(/\s+/g, ' ').trim();

// Excerpts end with "[&hellip;]" where WordPress cut the release short; show a single "…"
const toExcerpt = (html) => {
  const text = toPlainText(html);
  const cut = /\s*\[?…\]?$/.exec(text);
  return cut ? `${text.slice(0, cut.index)}…` : text;
};

// Links and images must stay on HPD's own site (the only image host the page allows)
const onHpdSite = (url) => (typeof url === 'string' && url.startsWith(hpdSite) ? url : null);

// The 768px size fits the featured card; older uploads may only have the original
const toImage = (post) => {
  const media = post._embedded?.['wp:featuredmedia']?.[0];
  const url = onHpdSite(media?.media_details?.sizes?.medium_large?.source_url ?? media?.source_url);
  return url ? { url, alt: toPlainText(media.alt_text) } : null;
};

// One WordPress post -> the fields saved on a NewsRelease, or null if it isn't usable
const toRelease = (post) => {
  const url = onHpdSite(post.link);
  const title = toPlainText(post.title?.rendered);
  const publishedAt = new Date(`${post.date_gmt}Z`); // date_gmt is UTC without the "Z"
  if (!url || !title || Number.isNaN(publishedAt.getTime())) return null;

  return { wpId: post.id, publishedAt, title, excerpt: toExcerpt(post.excerpt?.rendered), url, image: toImage(post) };
};

const fetchNewsReleases = async () => {
  const posts = await (await fetchFromHpd(releasesUrl)).json();
  if (!Array.isArray(posts)) throw new Error("HPD's news API didn't return a list of posts");
  return posts.map(toRelease).filter((release) => release !== null);
};

module.exports = { fetchNewsReleases, toRelease, hpdNewsPageUrl: `${hpdSite}news/` };
