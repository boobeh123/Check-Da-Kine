const mongoose = require('mongoose');
const ArrestLog = require('./ArrestLog');

// One Big Island booking log: the Hawaiʻi Police Department's daily "Media Booking Log" PDF.
// The same fields as an Oʻahu arrest log, kept in its own collection so no Oʻahu page or count
// can include it.
module.exports = mongoose.model('BigIslandBookingLog', ArrestLog.schema, 'bigislandbookinglogs');
