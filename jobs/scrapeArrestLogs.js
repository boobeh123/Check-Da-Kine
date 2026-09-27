// Imports new arrest logs from HPD: download, archive to Cloudinary, parse, and save.
// Railway runs this on a schedule, and it exits when it's done.
//
// Usage: node jobs/scrapeArrestLogs.js [--limit N] [--skip-upload]
//   --limit N       only consider HPD's N newest logs (for a quick test)
//   --skip-upload   don't archive PDFs to Cloudinary (for testing without Cloudinary keys)

require('dotenv').config();

const { parseArgs } = require('node:util');
const mongoose = require('mongoose');
const connectDB = require('../config/database');
const ArrestLog = require('../model/ArrestLog');
const ArrestRecord = require('../model/ArrestRecord');
const { importArrestLogs } = require('../services/arrestLog/importArrestLogs');

const cloudinaryVariables = ['CLOUDINARY_CLOUD_NAME', 'CLOUDINARY_API_KEY', 'CLOUDINARY_API_SECRET'];

const getOptions = () => {
  const { values } = parseArgs({
    options: {
      limit: { type: 'string' },
      'skip-upload': { type: 'boolean', default: false },
    },
  });

  const limit = values.limit === undefined ? undefined : Number(values.limit);
  if (limit !== undefined && (!Number.isInteger(limit) || limit < 1)) {
    throw new Error('--limit must be a whole number above 0');
  }

  const upload = !values['skip-upload'];
  const missing = cloudinaryVariables.filter((name) => !process.env[name]);
  if (upload && missing.length > 0) {
    throw new Error(`Missing ${missing.join(', ')}. Set them, or pass --skip-upload to test without archiving.`);
  }

  return { limit, upload };
};

const printDatabaseTotals = async () => {
  const [parsedLogs, failedLogs, records] = await Promise.all([
    ArrestLog.countDocuments({ status: 'parsed' }),
    ArrestLog.countDocuments({ status: 'failed' }),
    ArrestRecord.countDocuments(),
  ]);
  console.log(`Database now holds ${parsedLogs} parsed logs (${failedLogs} failed) and ${records} arrests`);
};

const main = async () => {
  const options = getOptions();
  await connectDB();

  try {
    const totals = await importArrestLogs(options);
    console.log(
      `Done: ${totals.imported} logs imported, ${totals.failed} failed. Arrests: ${totals.created} new, ` +
        `${totals.updated} updated, ${totals.kept} kept newer, ${totals.skipped} skipped`
    );
    await printDatabaseTotals();

    // A non-zero exit marks the run as failed in Railway's dashboard
    if (totals.failed > 0) process.exitCode = 1;
  } finally {
    await mongoose.disconnect();
  }
};

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
