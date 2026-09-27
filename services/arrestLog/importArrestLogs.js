// Imports every arrest log HPD lists that isn't in the database yet: download, archive,
// parse, and save each arrest. Logs go oldest first, so the newest printing of each arrest wins.

const ArrestLog = require('../../model/ArrestLog');
const { fetchLogList, downloadPdf } = require('./fetchArrestLogs');
const { archivePdf } = require('./archivePdf');
const { parseArrestLog } = require('./parseArrestLog');
const { toRecordFields } = require('./toRecordFields');
const { saveRecord } = require('./saveRecord');

const errorMessageLength = 2000; // ArrestLog.errorMessage's maxLength

const countOffenses = (records) => records.reduce((total, record) => total + record.offenses.length, 0);

const saveRecords = async (parsedRecords, log) => {
  const outcomes = { created: 0, updated: 0, kept: 0, skipped: 0 };
  const warnings = [];

  for (const [index, parsed] of parsedRecords.entries()) {
    const result = toRecordFields(parsed);

    if (result.skipReason) {
      outcomes.skipped += 1;
      warnings.push(`record ${index + 1} skipped: ${result.skipReason}`);
    } else {
      outcomes[await saveRecord(result, log)] += 1;
    }
  }

  return { outcomes, warnings };
};

// A failed log is marked 'failed' and retried on the next run, while HPD still lists it
const importOneLog = async (listedLog, { upload }) => {
  const log = (await ArrestLog.findOne({ fileName: listedLog.fileName })) ?? new ArrestLog(listedLog);
  if (log.isNew) await log.save(); // Records point at the log, so it needs an _id first

  try {
    const pdf = await downloadPdf(log.sourceUrl);
    if (upload && !log.pdfUrl) log.pdfUrl = await archivePdf(pdf, log.fileName);

    const parsedRecords = await parseArrestLog(pdf);
    const { outcomes, warnings } = await saveRecords(parsedRecords, log);

    log.set({
      status: 'parsed',
      recordCount: parsedRecords.length,
      offenseCount: countOffenses(parsedRecords),
      warnings,
      errorMessage: undefined,
    });
    await log.save();
    return outcomes;
  } catch (err) {
    log.set({ status: 'failed', errorMessage: err.message.slice(0, errorMessageLength) });
    await log.save();
    throw err;
  }
};

// limit: only consider HPD's newest N logs. upload: archive PDFs to Cloudinary.
const importArrestLogs = async ({ limit, upload }) => {
  const listedLogs = await fetchLogList();
  const consideredLogs = limit ? listedLogs.slice(-limit) : listedLogs;

  const parsedLogs = await ArrestLog.find({ status: 'parsed' }).select('fileName');
  const parsedFileNames = new Set(parsedLogs.map((log) => log.fileName));
  const logsToImport = consideredLogs.filter((log) => !parsedFileNames.has(log.fileName));

  console.log(`HPD lists ${listedLogs.length} arrest logs; ${logsToImport.length} to import`);

  const totals = { imported: 0, failed: 0, created: 0, updated: 0, kept: 0, skipped: 0 };

  for (const listedLog of logsToImport) {
    const startedAt = Date.now();

    try {
      const outcomes = await importOneLog(listedLog, { upload });
      const seconds = ((Date.now() - startedAt) / 1000).toFixed(1);

      console.log(
        `${listedLog.fileName}: ${outcomes.created} new, ${outcomes.updated} updated, ` +
          `${outcomes.kept} kept newer, ${outcomes.skipped} skipped (${seconds}s)`
      );
      totals.imported += 1;
      Object.entries(outcomes).forEach(([outcome, count]) => {
        totals[outcome] += count;
      });
    } catch (err) {
      totals.failed += 1;
      console.error(`${listedLog.fileName}: failed - ${err.message}`);
    }
  }

  return totals;
};

module.exports = { importArrestLogs };
