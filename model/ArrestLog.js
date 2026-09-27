const mongoose = require('mongoose');

// One arrest-log PDF published by HPD
const arrestLogSchema = new mongoose.Schema(
  {
    fileName: { type: String, required: true, unique: true, maxLength: 100 },
    sourceUrl: { type: String, required: true, maxLength: 500 },
    publishedAt: { type: Date, required: true, index: true }, // From the file name, Hawaii time
    pdfUrl: { type: String, maxLength: 500 }, // Our Cloudinary copy; HPD only lists about two weeks
    status: { type: String, enum: ['pending', 'parsed', 'failed'], default: 'pending' },
    recordCount: { type: Number, min: 0 },
    offenseCount: { type: Number, min: 0 },
    warnings: [{ type: String, maxLength: 500 }], // Records that couldn't be saved, and why
    errorMessage: { type: String, maxLength: 2000 }, // Why the last attempt failed
  },
  { timestamps: true }
);

module.exports = mongoose.model('ArrestLog', arrestLogSchema);
