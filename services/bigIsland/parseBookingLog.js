// Turns the text of a Big Island "Media Booking Log" (readPdfText's pieces) into bookings.
// Pure, so the tests can feed it made-up pieces. Positions and patterns: bookingLayout.js.

const {
  bookingColumns,
  chargeColumns,
  sameRowPoints,
  dateTimePattern,
  reportNumberPattern,
  otnPattern,
  dayTotalPattern,
  grandTotalPatterns,
} = require('./bookingLayout');

// The field a piece belongs to, from where it starts
const toField = (columns, x) => columns.reduce((field, column) => (x >= column.from ? column.field : field), columns[0].field);

// Pieces in reading order (page by page, top to bottom, since PDF y grows upward), grouped
// into rows of pieces within sameRowPoints of the row's first piece
const toRows = (items) => {
  const rows = [];
  [...items]
    .sort((a, b) => a.page - b.page || b.y - a.y || a.x - b.x)
    .forEach((item) => {
      const row = rows[rows.length - 1];
      if (row && row.page === item.page && row.y - item.y <= sameRowPoints) row.items.push(item);
      else rows.push({ page: item.page, y: item.y, items: [item] });
    });
  rows.forEach((row) => row.items.sort((a, b) => a.x - b.x));
  return rows;
};

// { field: text } for a row, joining pieces that land in the same column
const toFields = (row, columns) =>
  row.items.reduce((fields, item) => {
    const field = toField(columns, item.x);
    return { ...fields, [field]: fields[field] ? `${fields[field]} ${item.s}` : item.s };
  }, {});

// A long race runs into the hometown column and comes out as one piece with it:
// "Puerto RicanMOUNTAIN VIEW", "Asian Other KAILUA KONA". Races are written in mixed case and
// towns in capitals, so the town is the capitals at the end.
const mergedHometownPattern = /^(.*[a-z])\s*([A-Z][A-Z .'-]*[A-Z])$/;

// The number a totals row gives, whether it's in the label's piece or the next one
const totalIn = (row, pattern) => {
  const index = row.items.findIndex((item) => pattern.test(item.s));
  if (index === -1) return undefined;
  const inLabel = pattern.exec(row.items[index].s)[1];
  const next = row.items.slice(index + 1).find((item) => /^\d+$/.test(item.s));
  return Number(inLabel ?? next?.s ?? NaN);
};

const isOnly = (fields, allowed) => Object.keys(fields).every((field) => allowed.includes(field));

// Returns { bookings, warnings, errors }. Each booking is { arrestedOn, releasedOn, name, gender,
// age, race, hometown, officer, otn, charges: [{ reportNumber, charge, bailSet, bailPosted,
// release, courtCode, courtDate }], problems }, with the printed text. "Released By" is dropped
// here: it names someone, and nothing uses it.
//   warnings: odd rows the log itself prints, like a charge above the first booking (the Oct 19
//     2026 log had one, and its own totals left it out). The bookings are still good.
//   errors: the bookings found don't match the totals the log prints, or there are no totals,
//     which means the layout changed and rows may be missing.
const parseBookingLog = (items) => {
  const bookings = [];
  const warnings = [];
  const errors = [];
  const totals = { bookings: undefined, charges: undefined, byDay: [] };
  let booking = null;
  let charge = null; // The charge whose text may wrap onto the next rows

  toRows(items).forEach((row) => {
    const otnItem = row.items.find((item) => otnPattern.test(item.s));
    const startsBooking = row.items.some((item) => toField(bookingColumns, item.x) === 'arrestedOn' && dateTimePattern.test(item.s));
    const startsCharge = row.items.some((item) => toField(chargeColumns, item.x) === 'reportNumber' && reportNumberPattern.test(item.s));

    if (startsBooking) {
      const { arrestedOn, releasedOn, name, gender, age, race, hometown, officer } = toFields(row, bookingColumns);
      const merged = !hometown && mergedHometownPattern.exec(race ?? '');
      booking = {
        arrestedOn,
        releasedOn,
        name,
        gender,
        age,
        race: merged ? merged[1] : race,
        hometown: merged ? merged[2] : hometown,
        officer,
        otn: undefined,
        charges: [],
        problems: [],
      };
      bookings.push(booking);
      charge = null;
    } else if (otnItem) {
      if (booking) booking.otn = otnPattern.exec(otnItem.s)[1];
      else warnings.push(`an OTN line (${otnItem.s}) came before any booking`);
      charge = null;
    } else if (startsCharge) {
      const { reportNumber, charge: text, bailSet, bailPosted, release, courtCode, courtDate } = toFields(row, chargeColumns);
      charge = { reportNumber, charge: text, bailSet, bailPosted, release, courtCode, courtDate };
      if (booking) booking.charges.push(charge);
      else warnings.push(`charge ${reportNumber} came before any booking, so it was left out`);
    } else if (row.items.some((item) => dayTotalPattern.test(item.s))) {
      totals.byDay.push(totalIn(row, dayTotalPattern));
      charge = null;
    } else if (row.items.some((item) => grandTotalPatterns.bookings.test(item.s) || grandTotalPatterns.charges.test(item.s))) {
      totals.bookings = totalIn(row, grandTotalPatterns.bookings) ?? totals.bookings;
      totals.charges = totalIn(row, grandTotalPatterns.charges) ?? totals.charges;
      charge = null;
    } else if (charge && isOnly(toFields(row, chargeColumns), ['charge', 'release'])) {
      // A line of wrapped text under the charge: more of its description, its release, or both
      const { charge: more, release } = toFields(row, chargeColumns);
      if (more) charge.charge = [charge.charge, more].filter(Boolean).join(' ');
      if (release) charge.release = [charge.release, release].filter(Boolean).join(' ');
    } else {
      // Titles, notes, column headings, labels, date headings and page footers
      charge = null;
    }
  });

  bookings.forEach((found, index) => {
    if (!found.otn) found.problems.push('no OTN was found for this booking');
    if (found.charges.length === 0) found.problems.push('no charges were found for this booking');
    if (found.problems.length > 0) warnings.push(`booking ${index + 1}: ${found.problems.join('; ')}`);
  });

  // The log prints its own counts, which catches a layout change that would drop rows
  const expectedBookings = totals.bookings ?? (totals.byDay.length > 0 ? totals.byDay.reduce((sum, n) => sum + n, 0) : undefined);
  const chargeCount = bookings.reduce((sum, found) => sum + found.charges.length, 0);
  if (expectedBookings === undefined) errors.push("the log's booking count wasn't found; its layout may have changed");
  else if (expectedBookings !== bookings.length) errors.push(`found ${bookings.length} bookings, but the log lists ${expectedBookings}`);
  if (totals.charges !== undefined && totals.charges !== chargeCount) {
    errors.push(`found ${chargeCount} charges, but the log lists ${totals.charges}`);
  }

  return { bookings, warnings, errors };
};

module.exports = { parseBookingLog, toRows };
