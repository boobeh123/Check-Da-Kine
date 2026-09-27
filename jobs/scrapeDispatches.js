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
const { geocodeNewPlaces } = require('../services/dispatches/geocodePlaces');
const { formatDateTime } = require('../services/dashboard/hawaiiDays');

// Map lookups are a bonus: if the geocoder is down, the calls are still saved and the job
// still succeeds, and the places are looked up on a later run
const placeCallsOnMap = async (calls) => {
  try {
    const { block, street, notFound, waiting, lookups } = await geocodeNewPlaces(calls);
    if (lookups === 0) return;
    const later = waiting > 0 ? `, ${waiting} left for the next run` : '';
    console.log(`Map: placed ${block} at the block and ${street} at street level, ${notFound} not found${later}`);
  } catch (err) {
    console.error(`Map lookups stopped for this run: ${err.message}`);
  }
};

const main = async () => {
  const page = await fetchDispatches(); // Before connecting, so an HPD outage never touches the database
  await connectDB();

  try {
    const latest = await Dispatch.findOne().sort({ lastSeenAt: -1 }).select('lastSeenAt').lean();
    if (latest?.lastSeenAt.getTime() === page.updatedAt.getTime()) {
      console.log(`HPD hasn't updated since the last check (${formatDateTime(page.updatedAt)})`);
    } else {
      const { created, stillOpen } = await saveDispatches(page);
      const skipped = page.skippedRows > 0 ? `, ${page.skippedRows} unreadable rows skipped` : '';
      console.log(
        `HPD update of ${formatDateTime(page.updatedAt)}: ${page.calls.length} active calls ` +
          `(${created} new, ${stillOpen} still open)${skipped}`
      );
    }

    // Runs even when HPD hasn't updated, so calls saved before they could be placed (by an
    // earlier run that ran out of lookups, or before the map existed) still get their dots.
    // Places already looked up are skipped, so this costs nothing when there's nothing new.
    await placeCallsOnMap(page.calls);
  } finally {
    await mongoose.disconnect();
  }
};

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
