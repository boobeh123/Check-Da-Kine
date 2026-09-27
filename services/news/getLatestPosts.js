// The home page's "HPD on X" section: HPD's latest posts as cards.

const XPost = require('../../model/XPost');
const { xProfileUrl } = require('./fetchXPosts');
const { formatShortDateTime } = require('../dashboard/hawaiiDays');

const shownCount = 6; // Three rows of two on wide screens

const toCard = (post) => ({
  name: post.name,
  username: post.username,
  avatarUrl: post.avatarUrl,
  url: post.url,
  segments: post.segments,
  media: post.media?.url ? post.media : null,
  moreMediaCount: post.moreMediaCount,
  postedIso: post.postedAt.toISOString(),
  postedAt: formatShortDateTime(post.postedAt),
});

// Returns null before the first check has saved anything (or without an X token), so the
// section is left out
const getLatestPosts = async () => {
  const posts = await XPost.find().sort({ postedAt: -1 }).limit(shownCount).lean();
  if (posts.length === 0) return null;
  return { posts: posts.map(toCard), profileUrl: xProfileUrl };
};

module.exports = { getLatestPosts };
