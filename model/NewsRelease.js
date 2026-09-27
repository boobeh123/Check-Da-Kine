const mongoose = require('mongoose');

// One of HPD's latest news releases, from its website. Only the latest few are kept, so a
// release HPD takes down disappears here too.
const newsReleaseSchema = new mongoose.Schema(
  {
    wpId: { type: Number, required: true, unique: true }, // The post's id on HPD's WordPress site
    publishedAt: { type: Date, required: true, index: true },
    title: { type: String, required: true, maxLength: 300 },
    excerpt: { type: String, maxLength: 1000 },
    url: { type: String, required: true, maxLength: 500 },
    image: {
      url: { type: String, maxLength: 500 },
      alt: { type: String, maxLength: 300 },
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model('NewsRelease', newsReleaseSchema);
