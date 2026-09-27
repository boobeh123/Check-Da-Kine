// Dates and times: HPD's printed formats, Hawaii calendar days (UTC-10 all year, no daylight
// saving time), and when the out-of-date notice appears.
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { isRealDate, splitDateTime, toHawaiiDate } = require('../services/arrestLog/printedFormats');
const {
  toHawaiiDay,
  startOfHawaiiDay,
  addDays,
  countDays,
  formatDay,
  formatShortDay,
  formatMonth,
  formatDateTime,
  formatShortDateTime,
} = require('../services/dashboard/hawaiiDays');
const { findStaleness } = require('../services/staleness');

// Newer versions of Node put a narrow no-break space before AM/PM; compare as plain spaces
const plain = (text) => text.replace(/\s/g, ' ');

describe('printed formats', () => {
  it('accepts real MM/DD/YYYY dates and rejects impossible ones', () => {
    assert.equal(isRealDate('09/26/2026'), true);
    assert.equal(isRealDate('02/29/2028'), true); // A leap year
    assert.equal(isRealDate('02/29/2026'), false);
    assert.equal(isRealDate('13/01/2026'), false);
    assert.equal(isRealDate('9/26/2026'), false);
    assert.equal(isRealDate('09/26/26'), false);
  });

  it('splits "MM/DD/YYYY HH:MM" and rejects anything else', () => {
    assert.deepEqual(splitDateTime('09/26/2026 16:30'), { date: '09/26/2026', time: '16:30' });
    assert.deepEqual(splitDateTime('09/26/2026  16:30'), { date: '09/26/2026', time: '16:30' });
    assert.equal(splitDateTime('09/26/2026 24:00'), null);
    assert.equal(splitDateTime('09/26/2026 16:30 PM'), null);
    assert.equal(splitDateTime('09/26/2026'), null);
    assert.equal(splitDateTime(''), null);
  });

  it('reads printed times as Hawaii time, UTC-10 in every season', () => {
    assert.equal(toHawaiiDate('09/26/2026', '16:30').toISOString(), '2026-09-27T02:30:00.000Z');
    assert.equal(toHawaiiDate('01/15/2026', '08:00').toISOString(), '2026-01-15T18:00:00.000Z');
    assert.equal(toHawaiiDate('02/30/2026', '08:00'), null);
    assert.equal(toHawaiiDate('09/26/2026', '8:00'), null);
  });
});

describe('Hawaii days', () => {
  it('starts each Hawaii day at 10:00 UTC', () => {
    assert.equal(toHawaiiDay(new Date('2026-09-27T09:59:00Z')), '2026-09-26');
    assert.equal(toHawaiiDay(new Date('2026-09-27T10:00:00Z')), '2026-09-27');
    assert.equal(startOfHawaiiDay('2026-09-27').toISOString(), '2026-09-27T10:00:00.000Z');
  });

  it('adds and counts days across months and years', () => {
    assert.equal(addDays('2026-09-30', 1), '2026-10-01');
    assert.equal(addDays('2026-12-31', 1), '2027-01-01');
    assert.equal(addDays('2026-03-01', -1), '2026-02-28');
    assert.equal(countDays('2026-09-26', '2026-09-26'), 1);
    assert.equal(countDays('2026-09-01', '2026-09-30'), 30);
    assert.equal(countDays('2026-12-25', '2027-01-07'), 14);
  });

  it('formats days and times the way the pages show them', () => {
    assert.equal(formatDay('2026-09-26'), 'Sep 26, 2026');
    assert.equal(formatShortDay('2026-09-26'), 'Sep 26');
    assert.equal(formatMonth('2026-09-26'), 'Sep 2026');
    assert.equal(plain(formatDateTime(new Date('2026-09-27T03:00:00Z'))), 'Sep 26, 2026, 5:00 PM HST');
    assert.equal(plain(formatShortDateTime(new Date('2026-09-27T07:07:00Z'))), 'Sep 26, 9:07 PM');
  });
});

describe('out-of-date notice', () => {
  const now = new Date('2026-09-27T12:00:00Z');
  const hoursAgo = (hours) => new Date(now.getTime() - hours * 60 * 60 * 1000);

  it('stays hidden up to the limit', () => {
    assert.equal(findStaleness(hoursAgo(7.9), 8, now), null);
    assert.equal(findStaleness(hoursAgo(8), 8, now), null);
  });

  it('says how long ago the last update was once past the limit', () => {
    assert.deepEqual(findStaleness(hoursAgo(8.1), 8, now), { ago: '8 hours ago' });
    assert.deepEqual(findStaleness(hoursAgo(1.1), 1, now), { ago: '1 hour ago' });
    assert.deepEqual(findStaleness(hoursAgo(47.9), 1, now), { ago: '47 hours ago' });
    assert.deepEqual(findStaleness(hoursAgo(72.5), 1, now), { ago: '3 days ago' });
  });
});
