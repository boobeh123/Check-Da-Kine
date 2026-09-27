const mongoose = require('mongoose');

// One charge on an arrest; an arrest can have several
const offenseSchema = new mongoose.Schema(
  {
    reportNumber: String, // "26340443-001"
    offenseName: String, // "ASSAULT 3"
    statute: String, // "HRS 707-0712"
    location: String,
    officer: String,
    courtInfo: String, // "HON DIST - ALAKEA / 7D 10/22/2026 09:30"
    releasedAt: Date,
    releaseInfo: String, // "RBL / 250", "500", "OTH"
  },
  { _id: false }
);

// One arrest, merged across every log that listed it
const arrestRecordSchema = new mongoose.Schema(
  {
    dedupeKey: { type: String, required: true, unique: true },
    arrestedAt: { type: Date, required: true, index: true },
    name: { type: String, select: false }, // Left out of queries unless asked for; shown only to logged-in users
    ethnicities: [String],
    sex: { type: String, enum: ['M', 'F'] },
    age: { type: Number, min: 18, max: 122 },
    offenses: [offenseSchema],
    firstSeenIn: { type: mongoose.Schema.Types.ObjectId, ref: 'ArrestLog', required: true },
    lastSeenIn: { type: mongoose.Schema.Types.ObjectId, ref: 'ArrestLog', required: true },
    // When lastSeenIn was published, so an older log never overwrites a newer one's version
    lastSeenAt: { type: Date, required: true },
    warnings: [String], // OCR problems and data oddities worth a look
  },
  { timestamps: true }
);

// The Arrests feed lists newest first and pages by (arrestedAt, _id)
arrestRecordSchema.index({ arrestedAt: -1, _id: -1 });

// The Arrests search box: whole words in each charge's name, statute, location, and report
// number. Names are deliberately left out. 'none' turns off English stemming and stop words,
// since HPD's text is codes and street names.
arrestRecordSchema.index(
  {
    'offenses.offenseName': 'text',
    'offenses.statute': 'text',
    'offenses.location': 'text',
    'offenses.reportNumber': 'text',
  },
  { name: 'arrestSearch', default_language: 'none' }
);

module.exports = mongoose.model('ArrestRecord', arrestRecordSchema);
