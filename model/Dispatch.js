const mongoose = require('mongoose');

// One police dispatch call. HPD lists a call only while it's open, and every check that
// lists it updates lastSeenAt, so each call is stored once.
const dispatchSchema = new mongoose.Schema(
  {
    dedupeKey: { type: String, required: true, unique: true }, // received time + type + address
    receivedAt: { type: Date, required: true, index: true },
    type: { type: String, required: true, maxLength: 100 }, // "MVC", "SIMPLE ASSAULT"
    address: { type: String, maxLength: 200 }, // Masked by HPD: "51XX LIKINI ST"
    city: { type: String, maxLength: 100 },
    district: { type: String, maxLength: 50 }, // "District 1" to "District 8"
    // HPD's "last updated" time of the first and latest checks that listed the call. A call
    // is active if the latest check listed it; after that, lastSeenAt is roughly when it closed.
    firstSeenAt: { type: Date, required: true },
    lastSeenAt: { type: Date, required: true, index: true },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Dispatch', dispatchSchema);
