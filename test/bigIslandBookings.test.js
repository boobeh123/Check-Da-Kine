// Big Island booking logs (Hawaiʻi Police Department's daily "Media Booking Log"): reading the
// PDF's text pieces into bookings, and turning a booking into an arrest record's fields. The
// fixture has the real layout's positions but made-up people, officers and towns.
const fs = require('node:fs');
const path = require('node:path');
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { parseBookingLog } = require('../services/bigIsland/parseBookingLog');
const { toBookingFields } = require('../services/bigIsland/toBookingFields');
const { parseLogList } = require('../services/bigIsland/fetchBookingLogs');

const items = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'bigIslandBookingItems.json'), 'utf8'));

describe('parseBookingLog', () => {
  const { bookings, warnings, errors } = parseBookingLog(items);
  const [doe, roe, kane] = bookings;

  it('finds every booking and charge, matching the totals the log prints', () => {
    assert.equal(bookings.length, 3);
    assert.deepEqual(bookings.map((booking) => booking.charges.length), [2, 1, 1]);
    assert.deepEqual(warnings, []);
    assert.deepEqual(errors, []);
  });

  it("reads a booking's row and its OTN", () => {
    assert.deepEqual(
      { ...doe, charges: undefined },
      {
        arrestedOn: '10/22/26 01:56',
        releasedOn: '10/22/26 11:00',
        name: 'DOE, JANE A',
        gender: 'F',
        age: '36',
        race: 'Other Pacific Islander',
        hometown: 'HILO',
        officer: 'OFFICER, TEST A',
        otn: '68099T3',
        charges: undefined,
        problems: [],
      }
    );
  });

  it("reads each charge, joining a description that wraps onto the next line", () => {
    assert.deepEqual(doe.charges, [
      {
        reportNumber: '26-089132',
        charge: '291E-0061 OVUII',
        bailSet: '$1,000',
        bailPosted: '$0',
        release: 'Released to District CT',
        courtCode: 'HD1',
        courtDate: '10/22/2026',
      },
      {
        reportNumber: '26-089132',
        charge: "286-0102 DWOL - WITHOUT A VALID DRIVER'S LICENSE",
        bailSet: '$100',
        bailPosted: '$0',
        release: 'Released to District CT',
        courtCode: 'HD1',
        courtDate: '10/22/2026',
      },
    ]);
  });

  it('splits a race that ran into the hometown column', () => {
    assert.equal(roe.race, 'Puerto Rican');
    assert.equal(roe.hometown, 'MOUNTAIN VIEW');
    assert.equal(roe.releasedOn, undefined); // Still held when the log was printed
  });

  it('carries on across a page break', () => {
    assert.equal(kane.otn, '68112T1');
    assert.equal(kane.charges[0].charge, '431:10C-104 NO MOTOR VEHICLE INSURANCE POLICY');
  });

  it('never keeps who released someone, since that names a person nothing uses', () => {
    assert.equal(JSON.stringify(bookings).includes('CLERK'), false);
  });

  // The Oct 19 2026 log printed a stray charge above its first booking, and its own totals
  // left it out
  it('leaves out a charge printed above the first booking, with a warning', () => {
    const stray = [
      { page: 1, x: 18, y: 464, s: '26-087780' },
      { page: 1, x: 89, y: 464, s: '707-0712D ASSAULT 3 : MUTUAL' },
      { page: 1, x: 270, y: 464, s: 'AO' },
      { page: 1, x: 315, y: 464, s: '$100' },
      { page: 1, x: 374, y: 464, s: '$0' },
    ];
    const result = parseBookingLog([...items, ...stray]);
    assert.equal(result.bookings.length, 3);
    assert.deepEqual(result.warnings, ['charge 26-087780 came before any booking, so it was left out']);
    assert.deepEqual(result.errors, []);
  });

  it("calls it an error when the bookings it found don't match the log's own totals", () => {
    const lastBooking = items.filter((item) => item.page === 2 && item.y >= 488 && item.y <= 532);
    const { errors: missing } = parseBookingLog(items.filter((item) => !lastBooking.includes(item)));
    assert.deepEqual(missing, ['found 2 bookings, but the log lists 3', 'found 3 charges, but the log lists 4']);
  });

  it("still calls it an error when a booking it prints goes unread, though the charges add up", () => {
    // An arrest time the pattern can't read: the booking's charge lands on the booking above
    const unreadable = items.map((item) => (item.s === '10/23/26 11:00' && item.x === 36 ? { ...item, s: '10/23/26 11:0O' } : item));
    const { bookings: found, errors: unread } = parseBookingLog(unreadable);
    assert.equal(found.length, 2);
    assert.deepEqual(unread, ['found 2 bookings, but the log lists 3']);
  });

  it("saves every booking, with a warning, when only the log's own booking count is off", () => {
    // The Oct 25 2026 log listed one more booking than it printed. Here the log lists 4.
    const miscounted = items.map((item) => (item.s === '3' && item.y === 460 ? { ...item, s: '4' } : item));
    const result = parseBookingLog(miscounted);
    assert.equal(result.bookings.length, 3);
    assert.deepEqual(result.errors, []);
    assert.deepEqual(result.warnings, ['the log lists 4 bookings but prints 3, each with its OTN line and charges, so all 3 were read']);
  });

  it('calls it an error when there are no totals at all, which means the layout changed', () => {
    const { errors: noTotals } = parseBookingLog(items.filter((item) => !/^Total/.test(item.s)));
    assert.deepEqual(noTotals, ["the log's booking count wasn't found; its layout may have changed"]);
  });
});

describe('toBookingFields', () => {
  const [doe, roe] = parseBookingLog(items).bookings;

  it('keys a booking by its OTN, which is the same in every log that lists it', () => {
    assert.equal(toBookingFields(doe).dedupeKey, 'otn:68099T3');
  });

  it('turns printed text into typed fields', () => {
    const { fields } = toBookingFields(doe);
    assert.equal(fields.arrestedAt.toISOString(), '2026-10-22T11:56:00.000Z'); // 1:56 AM in Hawaii
    assert.equal(fields.sex, 'F');
    assert.equal(fields.age, 36);
    assert.deepEqual(fields.ethnicities, ['Other Pacific Islander']);
    assert.equal(fields.residence, 'HILO');
    assert.equal(fields.otn, '68099T3');
    assert.deepEqual(fields.warnings, []);
  });

  it("splits each charge's statute from its name, and gives it the booking's officer and release", () => {
    const [first, second] = toBookingFields(doe).fields.offenses;
    assert.deepEqual(first, {
      reportNumber: '26-089132',
      offenseName: 'OVUII',
      statute: 'HRS 291E-0061',
      officer: 'OFFICER, TEST A',
      courtInfo: 'HD1 10/22/2026',
      releasedAt: new Date('2026-10-22T21:00:00.000Z'),
      releaseInfo: 'Released to District CT',
      bailSet: 1000,
      bailPosted: 0,
    });
    assert.equal(second.statute, 'HRS 286-0102');
    assert.equal(second.offenseName, "DWOL - WITHOUT A VALID DRIVER'S LICENSE");
  });

  it('reads statutes with a colon, a decimal, or subsections', () => {
    const withCharge = (charge) => toBookingFields({ ...doe, charges: [{ ...doe.charges[0], charge }] }).fields.offenses[0];
    assert.equal(toBookingFields(roe).fields.offenses[0].statute, 'HRS 804-0007.2');
    assert.equal(withCharge('431:10C-104 NO MOTOR VEHICLE INSURANCE POLICY').statute, 'HRS 431:10C-104');
    assert.deepEqual(
      [withCharge('291C-0103(a)(d) EXHIBITION OF SPEED').statute, withCharge('291C-0103(a)(d) EXHIBITION OF SPEED').offenseName],
      ['HRS 291C-0103(a)(d)', 'EXHIBITION OF SPEED']
    );
  });

  it("keeps a charge printed without a statute whole, without flagging it, since that's how it was printed", () => {
    const { fields } = toBookingFields({ ...doe, charges: [{ ...doe.charges[0], charge: 'ACT 151 C POSSESSING A DANGEROUS DRUG 2' }] });
    assert.equal(fields.offenses[0].statute, undefined);
    assert.equal(fields.offenses[0].offenseName, 'ACT 151 C POSSESSING A DANGEROUS DRUG 2');
    assert.deepEqual(fields.warnings, []);
  });

  it('leaves out a release time for someone still held', () => {
    assert.equal(toBookingFields(roe).fields.offenses[0].releasedAt, undefined);
  });

  it("leaves out what doesn't read cleanly, and says why", () => {
    const { fields } = toBookingFields({ ...doe, gender: 'X', age: '9', charges: [{ ...doe.charges[0], bailSet: 'none' }] });
    assert.equal(fields.sex, undefined);
    assert.equal(fields.age, undefined);
    assert.equal(fields.offenses[0].bailSet, undefined);
    assert.deepEqual(fields.warnings, [
      'gender "X" is not M or F',
      'age "9" is not a whole number from 18 to 122',
      'bail "none" is not a dollar amount',
    ]);
  });

  it('keys a booking without an OTN by time, report number, sex and age, never by name', () => {
    assert.equal(toBookingFields({ ...doe, otn: undefined }).dedupeKey, '2026-10-22T11:56:00.000Z|26-089132|F|36');
  });

  it("skips a booking whose arrest time can't be read", () => {
    assert.deepEqual(toBookingFields({ ...doe, arrestedOn: '10/22/26' }), { skipReason: 'arrest time "10/22/26" could not be read' });
  });
});

describe('parseLogList', () => {
  // A trimmed copy of the listing page's links: the department links each log with spaces in
  // the address, and the page has plenty of other links
  const html = `
    <a href="https://www.hawaiipolice.gov/wp-content/uploads/bookingLogs/Media Booking Report_2026-10-24-05-58-36.pdf">Media Booking Report_2026-10-24-05-58-36.pdf</a>
    <a href="https://www.hawaiipolice.gov/wp-content/uploads/bookingLogs/Media%20Booking%20Report_2026-10-23-05-58-37.pdf">Media Booking Report_2026-10-23-05-58-37.pdf</a>
    <a href="https://www.hawaiipolice.gov/wp-content/uploads/bookingLogs/Media Booking Report_2026-10-24-05-58-36.pdf">the same log again</a>
    <a href="https://www.hawaiipolice.gov/news-and-media/">News</a>
    <a href="https://example.com/wp-content/uploads/bookingLogs/Media Booking Report_2026-10-22-05-58-00.pdf">another site</a>
    <a href="http://www.hawaiipolice.gov/wp-content/uploads/bookingLogs/Media Booking Report_2026-10-21-05-58-06.pdf">not https</a>`;

  it("lists each of the department's own logs once, oldest first, named with dashes", () => {
    assert.deepEqual(parseLogList(html), [
      {
        fileName: 'Media-Booking-Report_2026-10-23-05-58-37.pdf',
        sourceUrl: 'https://www.hawaiipolice.gov/wp-content/uploads/bookingLogs/Media%20Booking%20Report_2026-10-23-05-58-37.pdf',
        publishedAt: new Date('2026-10-23T15:58:37.000Z'), // 5:58 AM in Hawaii
      },
      {
        fileName: 'Media-Booking-Report_2026-10-24-05-58-36.pdf',
        sourceUrl: 'https://www.hawaiipolice.gov/wp-content/uploads/bookingLogs/Media%20Booking%20Report_2026-10-24-05-58-36.pdf',
        publishedAt: new Date('2026-10-24T15:58:36.000Z'),
      },
    ]);
  });
});
