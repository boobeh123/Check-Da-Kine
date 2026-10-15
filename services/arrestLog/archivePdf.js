// Our copies of HPD's arrest-log PDFs on Cloudinary, kept since HPD only lists about two weeks
// of logs. The PDFs print every arrestee's and officer's name, so the copies are private, and
// only logged-in users get a link to one (listArrests.js). Copies uploaded before the archive
// went private are moved by makeArchivePrivate.js.

const cloudinary = require('../../config/cloudinary');

const toPublicId = (fileName) => `checkDaKine/arrestLogs/${fileName}`;

// A copy's stored URL says how Cloudinary delivers it: /raw/upload/ is public, and
// /raw/authenticated/ is private, downloadable only through a link signed with our API secret
const publicCopyPattern = /\/raw\/upload\//;
const isPublicCopy = (pdfUrl) => publicCopyPattern.test(pdfUrl);

// Stores a private copy of a PDF. Resolves with the copy's URL, which only says where it is:
// downloading it takes a signed link (archiveLink).
const archivePdf = (pdf, fileName) =>
  new Promise((resolve, reject) => {
    const uploadStream = cloudinary.uploader.upload_stream(
      {
        resource_type: 'raw', // Stored byte-for-byte, not processed as an image
        type: 'authenticated', // Private
        public_id: toPublicId(fileName),
        overwrite: true, // A retry after a failed parse replaces the same file
      },
      (error, result) => {
        if (error) reject(new Error(`Cloudinary upload failed: ${error.message}`));
        else resolve(result.secure_url);
      }
    );

    uploadStream.end(pdf);
  });

// A link that downloads our copy of a log: its own URL while it's public, or a signed link
// once it's private. null when there's no copy, or no API secret here to sign with.
const archiveLink = ({ fileName, pdfUrl }) => {
  if (!pdfUrl) return null;
  if (isPublicCopy(pdfUrl)) return pdfUrl;
  if (!cloudinary.config().api_secret) return null;

  return cloudinary.url(toPublicId(fileName), {
    resource_type: 'raw',
    type: 'authenticated',
    sign_url: true,
    secure: true,
  });
};

module.exports = { archivePdf, archiveLink, isPublicCopy, publicCopyPattern, toPublicId };
