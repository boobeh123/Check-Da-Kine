const mongoose = require('mongoose');
const ArrestRecord = require('./ArrestRecord');

// One Big Island arrest, merged across every booking log that listed it. The same fields as an
// Oʻahu arrest, kept in its own collection so no Oʻahu page or count can include it. Its
// firstSeenIn and lastSeenIn point at BigIslandBookingLog documents, so populating them needs
// { model: BigIslandBookingLog }, since the schema's ref names ArrestLog.
module.exports = mongoose.model('BigIslandArrest', ArrestRecord.schema, 'bigislandarrests');
