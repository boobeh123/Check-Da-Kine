// Imports every Big Island booking log the Hawaiʻi Police Department lists that isn't in the
// database yet: download, archive a private copy, read, and save each booking. Logs go oldest
// first, so the newest printing of each booking wins. Mirrors arrestLog/importArrestLogs.js.

const BigIslandBookingLog = require('../../model/BigIslandBookingLog');
const BigIslandArrest = require('../../model/BigIslandArrest');
const { archivePdf } = require('../arrestLog/archivePdf');
const { saveRecord } = require('../arrestLog/saveRecord');
const { agencies } = require('../agencies');
const { readPdfText } = require('../pdfText');
const { fetchLogList, downloadPdf } = require('./fetchBookingLogs');
const { parseBookingLog } = require('./parseBookingLog');
const { toBookingFields } = require('./toBookingFields');

const { archiveFolder } = agencies.bigIsland;
const errorMessageLength = 2000; // The log's errorMessage maxLength
const warningLength = 500; // The log's warnings maxLength

const countCharges = (bookings) => bookings.reduce((total, booking) => total + booking.charges.length, 0);

const saveBookings = async (bookings, log) => {
  const outcomes = { created: 0, updated: 0, kept: 0, skipped: 0 };
  const warnings = [];

  for (const [index, booking] of bookings.entries()) {
    const result = toBookingFields(booking);
    if (result.skipReason) {
      outcomes.skipped += 1;
      warnings.push(`booking ${index + 1} skipped: ${result.skipReason}`);
    } else {
      outcomes[await saveRecord(result, log, BigIslandArrest)] += 1;
    }
  }

  return { outcomes, warnings };
};

// A log that doesn't add up (a booking it prints went unread, or its charges don't match its
// totals) is marked 'failed', with nothing saved, and retried on the next run while the
// department still lists it (about 8 days)
const importOneLog = async (listedLog, { upload }) => {
  const log = (await BigIslandBookingLog.findOne({ fileName: listedLog.fileName })) ?? new BigIslandBookingLog(listedLog);
  if (log.isNew) await log.save(); // Records point at the log, so it needs an _id first

  try {
    const pdf = await downloadPdf(log.sourceUrl);
    if (upload && !log.pdfUrl) log.pdfUrl = await archivePdf(pdf, log.fileName, { folder: archiveFolder });

    const { bookings, warnings: readWarnings, errors } = parseBookingLog(await readPdfText(pdf));
    if (errors.length > 0) throw new Error(errors.join('; '));

    const { outcomes, warnings: saveWarnings } = await saveBookings(bookings, log);
    const warnings = [...readWarnings, ...saveWarnings];

    log.set({
      status: 'parsed',
      recordCount: bookings.length,
      offenseCount: countCharges(bookings),
      warnings: warnings.map((warning) => warning.slice(0, warningLength)),
      errorMessage: undefined,
    });
    await log.save();
    return { outcomes, warningCount: warnings.length };
  } catch (err) {
    log.set({ status: 'failed', errorMessage: err.message.slice(0, errorMessageLength) });
    await log.save();
    throw err;
  }
};

// limit: only consider the department's newest N logs. upload: archive PDFs to Cloudinary.
const importBookingLogs = async ({ limit, upload }) => {
  const listedLogs = await fetchLogList();
  const consideredLogs = limit ? listedLogs.slice(-limit) : listedLogs;

  const parsedLogs = await BigIslandBookingLog.find({ status: 'parsed' }).select('fileName');
  const parsedFileNames = new Set(parsedLogs.map((log) => log.fileName));
  const logsToImport = consideredLogs.filter((log) => !parsedFileNames.has(log.fileName));

  console.log(`Big Island: the department lists ${listedLogs.length} booking logs; ${logsToImport.length} to import`);

  const totals = { imported: 0, failed: 0, created: 0, updated: 0, kept: 0, skipped: 0 };

  for (const listedLog of logsToImport) {
    try {
      const { outcomes, warningCount } = await importOneLog(listedLog, { upload });
      const warned = warningCount > 0 ? `, ${warningCount} ${warningCount === 1 ? 'warning' : 'warnings'} saved on the log` : '';
      console.log(
        `Big Island ${listedLog.fileName}: ${outcomes.created} new, ${outcomes.updated} updated, ` +
          `${outcomes.kept} kept newer, ${outcomes.skipped} skipped${warned}`
      );
      totals.imported += 1;
      Object.entries(outcomes).forEach(([outcome, count]) => {
        totals[outcome] += count;
      });
    } catch (err) {
      totals.failed += 1;
      console.error(`Big Island ${listedLog.fileName}: failed - ${err.message}`);
    }
  }

  return totals;
};

module.exports = { importBookingLogs };
