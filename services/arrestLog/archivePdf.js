// Stores a copy of an arrest-log PDF on Cloudinary, since HPD only lists about two weeks
// of logs. Resolves with the copy's URL.

const cloudinary = require('../../config/cloudinary');

const archivePdf = (pdf, fileName) =>
  new Promise((resolve, reject) => {
    const uploadStream = cloudinary.uploader.upload_stream(
      {
        resource_type: 'raw', // Stored byte-for-byte, not processed as an image
        public_id: `checkDaKine/arrestLogs/${fileName}`,
        overwrite: true, // A retry after a failed parse replaces the same file
      },
      (error, result) => {
        if (error) reject(new Error(`Cloudinary upload failed: ${error.message}`));
        else resolve(result.secure_url);
      }
    );

    uploadStream.end(pdf);
  });

module.exports = { archivePdf };
