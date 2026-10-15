// The date filter's ranges, shared by the home page and the Dispatches history: a range's label
// and length, and the one-click ranges as links.
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { describeRange, buildPresets } = require('../services/dateRanges');

describe('describeRange', () => {
  it('labels a range and counts its days, both ends included', () => {
    assert.deepEqual(describeRange('2026-10-08', '2026-10-14'), {
      start: '2026-10-08',
      end: '2026-10-14',
      label: 'Oct 8, 2026 – Oct 14, 2026',
      days: 7,
    });
  });
});

describe('buildPresets', () => {
  const today = '2026-10-14';

  it('links the Dispatches ranges, with its default (the last 7 days) at the plain address', () => {
    const range = describeRange('2026-10-08', today);
    const presets = buildPresets({ path: '/dispatches', range, firstDay: '2026-09-26', today, defaultLabel: 'Last 7 days' });

    assert.deepEqual(presets, [
      { label: 'Last 7 days', href: '/dispatches', selected: true },
      { label: 'Last 30 days', href: '/dispatches?start=2026-09-15&end=2026-10-14', selected: false },
      { label: 'All time', href: '/dispatches?start=2026-09-26&end=2026-10-14', selected: false },
    ]);
  });

  it("keeps the home page's links, where all time is the default", () => {
    const range = describeRange('2026-09-12', today);
    const presets = buildPresets({ path: '/', range, firstDay: '2026-09-12', today, defaultLabel: 'All time' });

    assert.deepEqual(
      presets.map((preset) => [preset.href, preset.selected]),
      [
        ['/?start=2026-10-08&end=2026-10-14', false],
        ['/?start=2026-09-15&end=2026-10-14', false],
        ['/', true],
      ]
    );
  });

  it('marks no range chosen for dates the presets do not cover', () => {
    const range = describeRange('2026-10-01', '2026-10-03');
    const presets = buildPresets({ path: '/', range, firstDay: '2026-09-12', today, defaultLabel: 'All time' });
    assert.equal(presets.some((preset) => preset.selected), false);
  });

  it('starts all time on today before there is any data', () => {
    const presets = buildPresets({ path: '/', range: describeRange(today, today), firstDay: undefined, today, defaultLabel: 'All time' });
    assert.deepEqual(presets[2], { label: 'All time', href: '/', selected: true });
  });
});
