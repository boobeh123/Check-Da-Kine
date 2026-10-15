// The date filter's ranges (views/partials/dateFilter.ejs), shared by the home page and the
// Dispatches history. Days are YYYY-MM-DD strings in Hawaii time.

const { addDays, countDays, formatDay } = require('./dashboard/hawaiiDays');

// { start, end, label: "Oct 8, 2026 – Oct 14, 2026", days }, counting both end days
const describeRange = (start, end) => ({
  start,
  end,
  label: `${formatDay(start)} – ${formatDay(end)}`,
  days: countDays(start, end),
});

// The one-click ranges, as links to the page at `path`, with the chosen one marked. The page's
// default range links to `path` alone, so its address stays clean. firstDay is the first day
// with data, or undefined before there's any.
const buildPresets = ({ path, range, firstDay, today, defaultLabel }) => {
  const presets = [
    { label: 'Last 7 days', start: addDays(today, -6), end: today },
    { label: 'Last 30 days', start: addDays(today, -29), end: today },
    { label: 'All time', start: firstDay ?? today, end: today },
  ];

  return presets.map((preset) => ({
    label: preset.label,
    href: preset.label === defaultLabel ? path : `${path}?start=${preset.start}&end=${preset.end}`,
    selected: preset.start === range.start && preset.end === range.end,
  }));
};

module.exports = { describeRange, buildPresets };
