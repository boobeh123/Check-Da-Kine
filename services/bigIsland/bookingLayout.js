// Where things are on the Big Island's "Media Booking Log" (Hawaiʻi Police Department), a
// landscape PDF (792 × 612 points) with a real text layer, so the text is read rather than
// recognized. Positions are PDF points from the page's left edge, measured across the 8 logs
// listed on Oct 24, 2026 (223 bookings): values start within a few points of these, and each
// column runs until the next one starts.

// The first row of a booking
const bookingColumns = [
  { field: 'arrestedOn', from: 0 }, // "10/22/26 01:56"
  { field: 'releasedOn', from: 80 }, // blank while the person is still held
  { field: 'name', from: 180 },
  { field: 'gender', from: 345 },
  { field: 'age', from: 395 },
  { field: 'race', from: 430 },
  { field: 'hometown', from: 480 }, // "Address of Arrestee": a town
  { field: 'officer', from: 590 },
];

// Each charge's row. Its bail and release fields sit 1 point below the rest, close enough to
// count as the same row.
const chargeColumns = [
  { field: 'reportNumber', from: 0 }, // "26-089132"
  { field: 'charge', from: 60 }, // "291E-0061 OVUII"; long ones wrap onto the lines below
  { field: 'chargeType', from: 255 }, // "A/C", not used
  { field: 'bailSet', from: 300 }, // "$1,000", right-aligned
  { field: 'bailPosted', from: 355 },
  { field: 'release', from: 400 }, // "Released to District CT"
  { field: 'releasedBy', from: 540 }, // a name, never kept
  { field: 'courtCode', from: 670 }, // "HD1"
  { field: 'courtDate', from: 705 }, // "10/22/2026"
];

// Pieces of one row sit within this many points of each other
const sameRowPoints = 2;

const dateTimePattern = /^(\d{2})\/(\d{2})\/(\d{2}) (\d{2}):(\d{2})$/; // MM/DD/YY HH:MM
const reportNumberPattern = /^\d{2}-\d{6}$/;
const otnPattern = /^Charges for OTN:\s*(\S+)$/;
const dayTotalPattern = /^Total OTNs on this date:/;
const grandTotalPatterns = {
  bookings: /^Total OTNs Records Found:\s*(\d+)?$/,
  charges: /^Total Charge Records Found:\s*(\d+)?$/,
};

module.exports = {
  bookingColumns,
  chargeColumns,
  sameRowPoints,
  dateTimePattern,
  reportNumberPattern,
  otnPattern,
  dayTotalPattern,
  grandTotalPatterns,
};
