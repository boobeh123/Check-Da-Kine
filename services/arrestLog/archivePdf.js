// Our copies of the police logs' PDFs on Cloudinary, kept since the departments only list a
// week or two of logs. The PDFs print every arrestee's and officer's name, so the copies are
// private, and only logged-in users get a link to one (listArrests.js). Copies of Oʻahu logs
// uploaded before the archive went private are moved by makeArchivePrivate.js.

const cloudinary = require('../../config/cloudinary');

// Each island's logs have their own folder; Oʻahu's is the default
const arrestLogFolder = 'checkDaKine/arrestLogs';

const toPublicId = (fileName, folder = arrestLogFolder) => `${folder}/${fileName}`;

// A copy's stored URL says how Cloudinary delivers it: /raw/upload/ is public, and
// /raw/authenticated/ is private, downloadable only through a link signed with our API secret
const publicCopyPattern = /\/raw\/upload\//;
const isPublicCopy = (pdfUrl) => publicCopyPattern.test(pdfUrl);

// Stores a private copy of a PDF. Resolves with the copy's URL, which only says where it is:
// downloading it takes a signed link (archiveLink).
const archivePdf = (pdf, fileName, { folder } = {}) =>
  new Promise((resolve, reject) => {
    const uploadStream = cloudinary.uploader.upload_stream(
      {
        resource_type: 'raw', // Stored byte-for-byte, not processed as an image
        type: 'authenticated', // Private
        public_id: toPublicId(fileName, folder),
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
// once it's private. null when there's no copy, or no API secret here to sign with. folder is
// the island's, as given to archivePdf.
const archiveLink = ({ fileName, pdfUrl }, { folder } = {}) => {
  if (!pdfUrl) return null;
  if (isPublicCopy(pdfUrl)) return pdfUrl;
  if (!cloudinary.config().api_secret) return null;

  return cloudinary.url(toPublicId(fileName, folder), {
    resource_type: 'raw',
    type: 'authenticated',
    sign_url: true,
    secure: true,
  });
};

module.exports = { archivePdf, archiveLink, isPublicCopy, publicCopyPattern, toPublicId };
