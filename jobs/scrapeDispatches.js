// Checks HPD's active dispatch calls and saves them. Railway runs this every 10 minutes,
// and it exits when it's done.
//
// Usage: npm run scrape-dispatches

require('dotenv').config();

const mongoose = require('mongoose');
const connectDB = require('../config/database');
const Dispatch = require('../model/Dispatch');
const { fetchDispatches } = require('../services/dispatches/fetchDispatches');
const { saveDispatches } = require('../services/dispatches/saveDispatches');
const { formatDateTime } = require('../services/dashboard/hawaiiDays');

const main = async () => {
  const page = await fetchDispatches(); // Before connecting, so an HPD outage never touches the database
  await connectDB();

  try {
    const latest = await Dispatch.findOne().sort({ lastSeenAt: -1 }).select('lastSeenAt').lean();
    if (latest?.lastSeenAt.getTime() === page.updatedAt.getTime()) {
      console.log(`HPD hasn't updated since the last check (${formatDateTime(page.updatedAt)})`);
      return;
    }

    const { created, stillOpen } = await saveDispatches(page);
    const skipped = page.skippedRows > 0 ? `, ${page.skippedRows} unreadable rows skipped` : '';
    console.log(
      `HPD update of ${formatDateTime(page.updatedAt)}: ${page.calls.length} active calls ` +
        `(${created} new, ${stillOpen} still open)${skipped}`
    );
  } finally {
    await mongoose.disconnect();
  }
};

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
