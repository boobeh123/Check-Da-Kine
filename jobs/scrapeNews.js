// Checks HPD's latest news releases and saves them for the home page. Railway runs this every
// hour, and it exits when it's done.
//
// Usage: npm run scrape-news

require('dotenv').config();

const mongoose = require('mongoose');
const connectDB = require('../config/database');
const { fetchNewsReleases } = require('../services/news/fetchNewsReleases');
const { saveNewsReleases } = require('../services/news/saveNewsReleases');

const main = async () => {
  const releases = await fetchNewsReleases(); // Before connecting, so an HPD outage never touches the database
  await connectDB();

  try {
    const { created, removed } = await saveNewsReleases(releases);
    const dropped = removed > 0 ? `, ${removed} older or taken down removed` : '';
    console.log(`HPD news: ${releases.length} releases (${created} new${dropped})`);
  } finally {
    await mongoose.disconnect();
  }
};

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
