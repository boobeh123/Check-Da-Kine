// Checks HPD's latest news releases and its latest posts on X, and saves both for the home
// page. Railway runs this every hour, and it exits when it's done. Each source is handled on
// its own, so a problem with one never stops the other.
//
// Usage: npm run scrape-news

require('dotenv').config();

const mongoose = require('mongoose');
const connectDB = require('../config/database');
const { fetchNewsReleases } = require('../services/news/fetchNewsReleases');
const { saveNewsReleases } = require('../services/news/saveNewsReleases');
const { fetchXPosts } = require('../services/news/fetchXPosts');
const { saveXPosts } = require('../services/news/saveXPosts');

const describeRemoved = (removed, what) => (removed > 0 ? `, ${removed} ${what} removed` : '');

// X is paid per read, so without a token the X step doesn't run at all
const xToken = process.env.X_BEARER_TOKEN;

const main = async () => {
  // Both are fetched before connecting, so an outage never touches the database
  const [releases, posts] = await Promise.allSettled([
    fetchNewsReleases(),
    xToken ? fetchXPosts(xToken) : Promise.resolve(null),
  ]);
  if (releases.status === 'rejected') console.error(`HPD news: skipped this run: ${releases.reason.message}`);
  if (posts.status === 'rejected') console.error(`X: skipped this run: ${posts.reason.message}`);
  if (!xToken) console.log('X: skipped (no X_BEARER_TOKEN)');

  const saving = [releases, posts].some((result) => result.status === 'fulfilled' && result.value);
  if (saving) {
    await connectDB();
    try {
      if (releases.status === 'fulfilled') {
        const { created, removed } = await saveNewsReleases(releases.value);
        console.log(`HPD news: ${releases.value.length} releases (${created} new${describeRemoved(removed, 'older or taken down')})`);
      }
      if (posts.status === 'fulfilled' && posts.value) {
        const { created, removed } = await saveXPosts(posts.value);
        console.log(`X: ${posts.value.length} posts (${created} new${describeRemoved(removed, 'older or deleted')})`);
      }
    } finally {
      await mongoose.disconnect();
    }
  }

  // A failed source fails the run, so it shows in Railway's cron history
  if (releases.status === 'rejected' || posts.status === 'rejected') process.exitCode = 1;
};

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
