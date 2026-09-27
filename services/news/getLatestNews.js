// The home page's "Latest news from HPD" section: the newest release as a featured card, and
// the next few as a list.

const NewsRelease = require('../../model/NewsRelease');
const { hpdNewsPageUrl } = require('./fetchNewsReleases');
const { toHawaiiDay, formatDay } = require('../dashboard/hawaiiDays');

const shownCount = 5; // One featured, four in the list

const toCard = (release) => ({
  title: release.title,
  excerpt: release.excerpt,
  url: release.url,
  image: release.image?.url ? release.image : null,
  publishedIso: release.publishedAt.toISOString(),
  publishedOn: formatDay(toHawaiiDay(release.publishedAt)),
});

// Returns null before the first check has saved anything, so the section is left out
const getLatestNews = async () => {
  const releases = await NewsRelease.find().sort({ publishedAt: -1 }).limit(shownCount).lean();
  if (releases.length === 0) return null;

  const [featured, ...more] = releases.map(toCard);
  return { featured, more, moreUrl: hpdNewsPageUrl };
};

module.exports = { getLatestNews };
