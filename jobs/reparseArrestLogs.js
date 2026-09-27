// Re-reads every stored arrest log with the current parser and replaces all arrest records.
// Run it once after the parser improves. If any log can't be downloaded, or the scraper
// imports a new log meanwhile, it stops and the live records stay exactly as they were.
//
// Usage: npm run reparse

require('dotenv').config();

const mongoose = require('mongoose');
const connectDB = require('../config/database');
const { rebuildArrestRecords } = require('../services/arrestLog/rebuildArrestRecords');

const main = async () => {
  await connectDB();

  try {
    const startedAt = Date.now();
    const { logs, before, after } = await rebuildArrestRecords({ onProgress: (line) => console.log(line) });
    const minutes = ((Date.now() - startedAt) / 60000).toFixed(1);
    console.log(`Done in ${minutes} minutes: re-read ${logs} logs. Arrests before: ${before}, after: ${after}.`);
  } finally {
    await mongoose.disconnect();
  }
};

main().catch((err) => {
  console.error(err.message);
  process.exitCode = 1;
});
