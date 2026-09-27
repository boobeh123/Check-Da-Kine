// Chart data: bar lengths, folding small rows into "All others", and grouping days into the
// Arrests tile's bars.
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { withShares, toTopRows } = require('../services/chartRows');
const { toArrestTrend } = require('../services/dashboard/arrestTrend');
const { addDays } = require('../services/dashboard/hawaiiDays');

describe('withShares', () => {
  it('sizes each bar against the largest, to one decimal place', () => {
    const rows = withShares([
      { label: 'A', count: 3 },
      { label: 'B', count: 1 },
      { label: 'C', count: 2 },
    ]);
    assert.deepEqual(rows.map((row) => row.share), [100, 33.3, 66.7]);
  });

  it('gives every bar 0 when every count is 0', () => {
    assert.deepEqual(withShares([{ label: 'A', count: 0 }]).map((row) => row.share), [0]);
  });
});

describe('toTopRows', () => {
  const counts = [
    { _id: 'Samoan', count: 2 },
    { _id: 'White', count: 9 },
    { _id: 'Hawaiian', count: 9 },
    { _id: 'Tongan', count: 1 },
    { _id: 'Filipino', count: 4 },
  ];

  it('sorts largest first, and ties by name', () => {
    assert.deepEqual(toTopRows(counts, 10).map((row) => row.label), ['Hawaiian', 'White', 'Filipino', 'Samoan', 'Tongan']);
  });

  it('folds everything past the top rows into "All others"', () => {
    const rows = toTopRows(counts, 2);
    assert.deepEqual(rows.map((row) => [row.label, row.count]), [
      ['Hawaiian', 9],
      ['White', 9],
      ['All others (3)', 7],
    ]);
  });

  it("doesn't fold a single leftover row, which would only rename it", () => {
    assert.equal(toTopRows(counts, 4).length, 5);
  });

  it('labels a missing value', () => {
    assert.equal(toTopRows([{ _id: null, count: 3 }], 10)[0].label, 'Not listed');
  });
});

describe('toArrestTrend', () => {
  // A made-up count for every day from start, cycling 1 to 5
  const countsFrom = (start, days) => Array.from({ length: days }, (_, index) => ({ _id: addDays(start, index), count: (index % 5) + 1 }));

  it('shows a bar per day for up to 31 days, the one with today still filling up', () => {
    const trend = toArrestTrend(countsFrom('2026-08-28', 31), '2026-08-28', '2026-09-27', '2026-09-27');
    assert.equal(trend.unit, 'day');
    assert.equal(trend.bars.length, 31);
    assert.deepEqual(trend.bars[0], { label: 'Aug 28', count: 1, partial: false, share: 20 });
    assert.equal(trend.bars[30].partial, true);
    assert.deepEqual([trend.busiest.label, trend.busiest.count], ['Sep 1', 5]);
  });

  it('switches to weeks past 31 days, with labels across a month end', () => {
    const trend = toArrestTrend(countsFrom('2026-09-01', 32), '2026-09-01', '2026-10-02', '2026-10-02');
    assert.equal(trend.unit, 'week');
    assert.deepEqual(trend.bars.map((bar) => bar.label), ['Sep 1–7', 'Sep 8–14', 'Sep 15–21', 'Sep 22–28', 'Sep 29 – Oct 2']);
    assert.equal(trend.bars.reduce((sum, bar) => sum + bar.count, 0), 93); // Nothing lost in grouping
  });

  it('switches to months past 31 weeks', () => {
    assert.equal(toArrestTrend(countsFrom('2026-01-01', 217), '2026-01-01', addDays('2026-01-01', 216), '2027-01-01').unit, 'week');
    const trend = toArrestTrend(countsFrom('2026-01-01', 218), '2026-01-01', addDays('2026-01-01', 217), '2027-01-01');
    assert.equal(trend.unit, 'month');
    assert.deepEqual(trend.bars.map((bar) => bar.label), ['Jan 2026', 'Feb 2026', 'Mar 2026', 'Apr 2026', 'May 2026', 'Jun 2026', 'Jul 2026', 'Aug 2026']);
  });

  it('counts days with no arrests as 0', () => {
    const trend = toArrestTrend([{ _id: '2026-09-20', count: 4 }], '2026-09-20', '2026-09-22', '2026-09-30');
    assert.deepEqual(trend.bars.map((bar) => bar.count), [4, 0, 0]);
    assert.equal(trend.bars.some((bar) => bar.partial), false);
  });
});
