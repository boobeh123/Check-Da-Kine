// Imports new arrest logs from HPD (Oʻahu) and new booking logs from the Hawaiʻi Police
// Department (the Big Island): download, archive a private copy to Cloudinary, read, and save.
// Then it moves any Oʻahu copy uploaded while the archive was public into the private archive.
// Railway runs this on a schedule, and it exits when it's done.
//
// Usage: node jobs/scrapeArrestLogs.js [--island oahu|big-island] [--limit N] [--skip-upload]
//   --island        import only one island's logs (both by default)
//   --limit N       only consider each department's N newest logs (for a quick test)
//   --skip-upload   don't archive PDFs to Cloudinary (for testing without Cloudinary keys)

require('dotenv').config();

const { parseArgs } = require('node:util');
const mongoose = require('mongoose');
const connectDB = require('../config/database');
const ArrestLog = require('../model/ArrestLog');
const ArrestRecord = require('../model/ArrestRecord');
const BigIslandBookingLog = require('../model/BigIslandBookingLog');
const BigIslandArrest = require('../model/BigIslandArrest');
const { importArrestLogs } = require('../services/arrestLog/importArrestLogs');
const { makeArchivePrivate } = require('../services/arrestLog/makeArchivePrivate');
const { importBookingLogs } = require('../services/bigIsland/importBookingLogs');

const cloudinaryVariables = ['CLOUDINARY_CLOUD_NAME', 'CLOUDINARY_API_KEY', 'CLOUDINARY_API_SECRET'];
const islands = ['oahu', 'big-island'];

const getOptions = () => {
  const { values } = parseArgs({
    options: {
      island: { type: 'string' },
      limit: { type: 'string' },
      'skip-upload': { type: 'boolean', default: false },
    },
  });

  if (values.island !== undefined && !islands.includes(values.island)) {
    throw new Error(`--island must be ${islands.join(' or ')}`);
  }

  const limit = values.limit === undefined ? undefined : Number(values.limit);
  if (limit !== undefined && (!Number.isInteger(limit) || limit < 1)) {
    throw new Error('--limit must be a whole number above 0');
  }

  const upload = !values['skip-upload'];
  const missing = cloudinaryVariables.filter((name) => !process.env[name]);
  if (upload && missing.length > 0) {
    throw new Error(`Missing ${missing.join(', ')}. Set them, or pass --skip-upload to test without archiving.`);
  }

  return { limit, upload, islands: values.island ? [values.island] : islands };
};

const printDatabaseTotals = async (Log, Record, prefix) => {
  const [parsedLogs, failedLogs, records] = await Promise.all([
    Log.countDocuments({ status: 'parsed' }),
    Log.countDocuments({ status: 'failed' }),
    Record.countDocuments(),
  ]);
  console.log(`${prefix}Database now holds ${parsedLogs} parsed logs (${failedLogs} failed) and ${records} arrests`);
};

// Each returns whether every log imported
const importers = {
  oahu: async (options) => {
    const totals = await importArrestLogs(options);
    console.log(
      `Done: ${totals.imported} logs imported, ${totals.failed} failed. Arrests: ${totals.created} new, ` +
        `${totals.updated} updated, ${totals.kept} kept newer, ${totals.skipped} skipped`
    );
    await printDatabaseTotals(ArrestLog, ArrestRecord, '');

    // After the import, so a problem here never holds up new logs. Once every copy is private,
    // this finds nothing and prints nothing.
    if (options.upload) {
      const { moved, left } = await makeArchivePrivate();
      if (moved > 0 || left > 0) console.log(`Archive: moved ${moved} public copies to private, ${left} still public`);
    }
    return totals.failed === 0;
  },

  'big-island': async (options) => {
    const totals = await importBookingLogs(options);
    console.log(
      `Big Island: ${totals.imported} logs imported, ${totals.failed} failed. Arrests: ${totals.created} new, ` +
        `${totals.updated} updated, ${totals.kept} kept newer, ${totals.skipped} skipped`
    );
    await printDatabaseTotals(BigIslandBookingLog, BigIslandArrest, 'Big Island: ');
    return totals.failed === 0;
  },
};

const main = async () => {
  const options = getOptions();
  await connectDB();

  try {
    // Each island on its own, so a problem with one never stops the other. A non-zero exit
    // marks the run as failed in Railway's dashboard.
    for (const island of options.islands) {
      try {
        if (!(await importers[island](options))) process.exitCode = 1;
      } catch (err) {
        console.error(`${island}: import stopped -`, err);
        process.exitCode = 1;
      }
    }
  } finally {
    await mongoose.disconnect();
  }
};

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
