const mongoose = require('mongoose');

// Where a dispatch address is on the map. Each address is looked up once and reused, so
// the free geocoder (one request per second) is never asked about the same place twice.
const geocodedPlaceSchema = new mongoose.Schema(
  {
    key: { type: String, required: true, unique: true }, // "16XX HAUIKI ST|KALIHI"
    address: { type: String, maxLength: 200 },
    city: { type: String, maxLength: 100 },
    found: { type: Boolean, required: true },
    lat: Number,
    lng: Number,
    // "block": the masked house number was found; "street": only the street was
    precision: { type: String, enum: ['block', 'street'] },
    query: { type: String, maxLength: 300 }, // The search that found it
    lookedUpAt: { type: Date, required: true },
  },
  { timestamps: true }
);

module.exports = mongoose.model('GeocodedPlace', geocodedPlaceSchema);
