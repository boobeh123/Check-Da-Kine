// The private archive of arrest-log PDFs on Cloudinary: new copies upload as private, links to
// them are signed, and copies uploaded while the archive was public are moved, checked, and
// moved back if a signed link can't download them. Cloudinary itself is never called.
const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const cloudinary = require('../config/cloudinary');
const { archivePdf, archiveLink } = require('../services/arrestLog/archivePdf');
const { moveToPrivate } = require('../services/arrestLog/makeArchivePrivate');

// Made-up credentials. Links are signed locally, so nothing is sent anywhere.
cloudinary.config({ cloud_name: 'example', api_key: '000', api_secret: 'test-secret' });

const fileName = '2026-09-26-17-00-32_Arrest_Log.pdf';
const publicUrl = `https://res.cloudinary.com/example/raw/upload/v1790000000/checkDaKine/arrestLogs/${fileName}`;
const privateUrl = `https://res.cloudinary.com/example/raw/authenticated/v1790000000/checkDaKine/arrestLogs/${fileName}`;
const signedLinkPattern = /^https:\/\/res\.cloudinary\.com\/example\/raw\/authenticated\/s--[\w-]{8}--\//;

describe('archivePdf', () => {
  it('uploads each copy as private', async () => {
    const realUploadStream = cloudinary.uploader.upload_stream;
    let options;
    cloudinary.uploader.upload_stream = (uploadOptions, done) => {
      options = uploadOptions;
      return { end: () => done(null, { secure_url: privateUrl }) };
    };
    try {
      assert.equal(await archivePdf(Buffer.from('%PDF-'), fileName), privateUrl);
    } finally {
      cloudinary.uploader.upload_stream = realUploadStream;
    }

    assert.equal(options.type, 'authenticated');
    assert.equal(options.resource_type, 'raw');
    assert.equal(options.public_id, `checkDaKine/arrestLogs/${fileName}`);
  });
});

describe('archiveLink', () => {
  it('signs a link to a private copy', () => {
    const link = archiveLink({ fileName, pdfUrl: privateUrl });
    assert.match(link, signedLinkPattern);
    assert.ok(link.includes(`/checkDaKine/arrestLogs/${fileName}`));
  });

  it('keeps the plain URL of a copy that is still public', () => {
    assert.equal(archiveLink({ fileName, pdfUrl: publicUrl }), publicUrl);
  });

  it('gives no link without a copy, or without the API secret to sign one', () => {
    assert.equal(archiveLink({ fileName, pdfUrl: undefined }), null);
    cloudinary.config({ api_secret: undefined });
    try {
      assert.equal(archiveLink({ fileName, pdfUrl: privateUrl }), null);
    } finally {
      cloudinary.config({ api_secret: 'test-secret' });
    }
  });
});

describe('moveToPrivate', () => {
  let log;
  let renames;
  let downloads;

  // Stand-ins for the ArrestLog document, Cloudinary's uploader, and downloadPdf
  beforeEach(() => {
    renames = [];
    downloads = [];
    log = {
      fileName,
      pdfUrl: publicUrl,
      saved: false,
      save: async () => {
        log.saved = true;
      },
    };
  });

  const uploader = ({ firstMoveFails } = {}) => ({
    rename: async (from, to, options) => {
      renames.push(`${options.type} -> ${options.to_type}`);
      if (firstMoveFails && renames.length === 1) throw firstMoveFails;
      return { secure_url: privateUrl };
    },
  });

  const download = ({ fails = false } = {}) => async (url) => {
    downloads.push(url);
    if (fails) throw new Error('HTTP 401');
    return Buffer.from('%PDF-');
  };

  it('moves a public copy, downloads it through a signed link, then saves its new URL', async () => {
    await moveToPrivate(log, { uploader: uploader(), download: download() });

    assert.deepEqual(renames, ['upload -> authenticated']);
    assert.match(downloads[0], signedLinkPattern);
    assert.equal(log.pdfUrl, privateUrl);
    assert.equal(log.saved, true);
  });

  it("moves it back and saves nothing when the signed link doesn't download", async () => {
    await assert.rejects(
      moveToPrivate(log, { uploader: uploader(), download: download({ fails: true }) }),
      /moved back to public/
    );

    assert.deepEqual(renames, ['upload -> authenticated', 'authenticated -> upload']);
    assert.equal(log.pdfUrl, publicUrl);
    assert.equal(log.saved, false);
  });

  it('saves a copy an earlier run already moved, once its signed link downloads', async () => {
    const notFound = Object.assign(new Error('Resource not found'), { http_code: 404 });
    await moveToPrivate(log, { uploader: uploader({ firstMoveFails: notFound }), download: download() });

    assert.equal(downloads.length, 1);
    assert.equal(log.pdfUrl, privateUrl);
    assert.equal(log.saved, true);
  });

  it('stops without downloading or saving when Cloudinary refuses the move', async () => {
    const refused = Object.assign(new Error('Server error'), { http_code: 500 });
    await assert.rejects(
      moveToPrivate(log, { uploader: uploader({ firstMoveFails: refused }), download: download() }),
      /Couldn't make .* private: Server error/
    );

    assert.equal(downloads.length, 0);
    assert.equal(log.saved, false);
  });
});
