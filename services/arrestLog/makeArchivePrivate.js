// Moves our copies of arrest logs that were uploaded while the archive was public into the
// private archive (archivePdf.js), and saves each one's new URL. The arrest scraper runs this
// every time; once every copy is private it finds nothing to do.
//
// Each moved copy must download through a signed link before its new URL is saved. If it
// doesn't, the copy is moved back, so a link to it never stops working.

const ArrestLog = require('../../model/ArrestLog');
const cloudinary = require('../../config/cloudinary');
const { archiveLink, publicCopyPattern, toPublicId } = require('./archivePdf');
const { downloadPdf } = require('./fetchArrestLogs');

const maxMovesPerRun = 200; // More than every copy archived so far, but keeps a run bounded

// Moves one log's copy and saves its new URL. uploader and download are Cloudinary's uploader
// and downloadPdf, except in the tests.
const moveToPrivate = async (log, { uploader = cloudinary.uploader, download = downloadPdf } = {}) => {
  const publicId = toPublicId(log.fileName);
  const move = (type, toType) =>
    uploader.rename(publicId, publicId, { resource_type: 'raw', type, to_type: toType, invalidate: true });

  // invalidate clears Cloudinary's cached public copy, so the old URL stops working too
  let privateUrl = log.pdfUrl.replace(publicCopyPattern, '/raw/authenticated/');
  try {
    privateUrl = (await move('upload', 'authenticated')).secure_url ?? privateUrl;
  } catch (err) {
    // Not found as a public copy: an earlier run moved it, then stopped before saving its new
    // URL. The download below checks that the private copy is there.
    if (err.http_code !== 404) throw new Error(`Couldn't make ${log.fileName} private: ${err.message}`);
  }

  try {
    await download(archiveLink({ fileName: log.fileName, pdfUrl: privateUrl }));
  } catch (err) {
    const movedBack = await move('authenticated', 'upload').then(
      () => true,
      () => false
    );
    throw new Error(
      `${log.fileName} wouldn't download through a signed link (${err.message}), so ` +
        (movedBack ? 'it was moved back to public' : 'it was left private, and moving it back failed too')
    );
  }

  log.pdfUrl = privateUrl;
  await log.save();
};

// Moves every public copy, oldest first, stopping at the first one that fails. Returns how
// many moved and how many are still public.
const makeArchivePrivate = async (deps) => {
  const logs = await ArrestLog.find({ pdfUrl: publicCopyPattern }).sort({ publishedAt: 1 }).limit(maxMovesPerRun);
  for (const log of logs) {
    await moveToPrivate(log, deps);
  }
  return { moved: logs.length, left: await ArrestLog.countDocuments({ pdfUrl: publicCopyPattern }) };
};

module.exports = { makeArchivePrivate, moveToPrivate };
