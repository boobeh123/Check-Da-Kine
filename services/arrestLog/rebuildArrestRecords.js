// Re-reads every stored arrest log with the current parser and rebuilds all arrest records.
// The records are built in a separate collection and swapped in only after every log has
// been read, so the site never shows a half-rebuilt set, and a failure changes nothing.

const mongoose = require('mongoose');
const ArrestLog = require('../../model/ArrestLog');
const ArrestRecord = require('../../model/ArrestRecord');
const { downloadPdf } = require('./fetchArrestLogs');
const { parseArrestLog } = require('./parseArrestLog');
const { saveRecords, countOffenses } = require('./importArrestLogs');

const stagingCollection = 'arrestrecords_rebuild';

// Same schema and indexes as ArrestRecord, stored in the staging collection
const StagingRecord =
  mongoose.models.StagingArrestRecord ??
  mongoose.model('StagingArrestRecord', ArrestRecord.schema, stagingCollection);

// Our Cloudinary copy first; HPD's link only works while HPD still lists the log
const downloadStoredPdf = async (log) => {
  const urls = [log.pdfUrl, log.sourceUrl].filter(Boolean);
  let lastError;
  for (const url of urls) {
    try {
      return await downloadPdf(url);
    } catch (err) {
      lastError = err;
    }
  }
  throw new Error(`Couldn't download ${log.fileName}: ${lastError?.message ?? 'no link stored'}`);
};

const dropStaging = () => StagingRecord.collection.drop().catch(() => {}); // Fine if it doesn't exist

const rebuildArrestRecords = async ({ onProgress = () => {} } = {}) => {
  const logs = await ArrestLog.find({ status: 'parsed' }).sort({ publishedAt: 1 });
  if (logs.length === 0) throw new Error('There are no parsed arrest logs to rebuild from.');

  await dropStaging(); // Left over from an earlier run that stopped partway
  await StagingRecord.createIndexes(); // Unique dedupeKey keeps each arrest to one record

  try {
    const logStats = [];
    for (const [index, log] of logs.entries()) {
      const parsedRecords = await parseArrestLog(await downloadStoredPdf(log));
      const { warnings } = await saveRecords(parsedRecords, log, StagingRecord);
      logStats.push({ log, recordCount: parsedRecords.length, offenseCount: countOffenses(parsedRecords), warnings });
      onProgress(`${index + 1}/${logs.length} ${log.fileName}: ${parsedRecords.length} arrests`);
    }

    // A scrape that ran meanwhile saved records the rebuild doesn't have; stop rather than lose them
    const parsedNow = await ArrestLog.countDocuments({ status: 'parsed' });
    if (parsedNow !== logs.length) {
      throw new Error('The scraper imported a new log during the rebuild. Nothing was changed; run reparse again.');
    }

    const before = await ArrestRecord.countDocuments();

    // $out replaces the live collection's documents in one step and keeps its indexes
    await StagingRecord.aggregate([{ $out: ArrestRecord.collection.collectionName }]);

    for (const { log, recordCount, offenseCount, warnings } of logStats) {
      await ArrestLog.updateOne({ _id: log._id }, { $set: { recordCount, offenseCount, warnings } });
    }

    return { logs: logs.length, before, after: await ArrestRecord.countDocuments() };
  } finally {
    await dropStaging();
  }
};

module.exports = { rebuildArrestRecords };
