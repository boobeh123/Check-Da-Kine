// Builds everything the dashboard shows for one date range. Only counts leave this
// module; arrestee and officer names never do.

const ArrestLog = require('../../model/ArrestLog');
const ArrestRecord = require('../../model/ArrestRecord');
const { ethnicityGroups, toEthnicityGroup } = require('./ethnicityGroups');
const {
  toHawaiiDay,
  todayInHawaii,
  startOfHawaiiDay,
  addDays,
  countDays,
  formatDay,
  formatDateTime,
} = require('./hawaiiDays');

const ageBands = [
  { label: '18–24', min: 18, max: 24 },
  { label: '25–34', min: 25, max: 34 },
  { label: '35–44', min: 35, max: 44 },
  { label: '45–54', min: 45, max: 54 },
  { label: '55–64', min: 55, max: 64 },
  { label: '65+', min: 65, max: Infinity },
];

const shownEthnicities = 10; // The rest fold into one "All others" bar

// Adds each row's share of the largest count (0–100), which sets its bar length
const withShares = (rows) => {
  const largest = Math.max(0, ...rows.map((row) => row.count));
  return rows.map((row) => ({
    ...row,
    share: largest > 0 ? Number(((row.count / largest) * 100).toFixed(1)) : 0,
  }));
};

const percentOf = (count, total) => (total > 0 ? Math.round((count / total) * 100) : 0);

// ageCounts: [{ _id: age, count }]
const summarizeAges = (ageCounts) => {
  const sorted = [...ageCounts].sort((first, second) => first._id - second._id);
  const total = sorted.reduce((sum, row) => sum + row.count, 0);
  if (total === 0) return { known: 0, median: null, average: null };

  // The age at a position in the full, sorted list of ages
  const ageAtPosition = (position) => {
    let seen = 0;
    for (const row of sorted) {
      seen += row.count;
      if (seen > position) return row._id;
    }
    return sorted[sorted.length - 1]._id;
  };

  const middle = Math.floor(total / 2);
  const median = total % 2 === 1 ? ageAtPosition(middle) : (ageAtPosition(middle - 1) + ageAtPosition(middle)) / 2;
  const average = sorted.reduce((sum, row) => sum + row._id * row.count, 0) / total;

  return { known: total, median, average: Math.round(average) };
};

const toAgeBands = (ageCounts) =>
  withShares(
    ageBands.map((band) => ({
      label: band.label,
      count: ageCounts
        .filter((row) => row._id >= band.min && row._id <= band.max)
        .reduce((sum, row) => sum + row.count, 0),
    }))
  );

// ethnicityCounts: [{ _id: ethnicity, count }], largest first, with the tail folded together
const toEthnicityRows = (ethnicityCounts) => {
  const sorted = ethnicityCounts
    .map((row) => ({ label: row._id, count: row.count }))
    .sort((first, second) => second.count - first.count || first.label.localeCompare(second.label));

  if (sorted.length <= shownEthnicities + 1) return withShares(sorted);

  const rest = sorted.slice(shownEthnicities);
  const restCount = rest.reduce((sum, row) => sum + row.count, 0);
  return withShares([
    ...sorted.slice(0, shownEthnicities),
    { label: `All others (${rest.length})`, count: restCount },
  ]);
};

// OCR leaves stray characters where a long name was cut off ("HOOPILIKEAN!"), so drop
// trailing non-letters to let those variants count as one officer
const normalizeOfficer = (name) =>
  (name ?? '')
    .toUpperCase()
    .replace(/[^A-Z]+$/, '') // trailing characters that aren't letters
    .replace(/\s+/g, ' ') // runs of spaces
    .trim();

// rows: [{ _id: { officer, ethnicity }, count }] -> officers per group, by the group each
// officer arrested most. Ties go to the group listed first in ethnicityGroups.
const toOfficerGroups = (rows) => {
  const groupCountsByOfficer = new Map();

  rows.forEach(({ _id, count }) => {
    const officer = normalizeOfficer(_id.officer);
    if (!officer) return;

    const groupKey = toEthnicityGroup(_id.ethnicity).key;
    const groupCounts = groupCountsByOfficer.get(officer) ?? new Map();
    groupCounts.set(groupKey, (groupCounts.get(groupKey) ?? 0) + count);
    groupCountsByOfficer.set(officer, groupCounts);
  });

  const officersByGroup = new Map(ethnicityGroups.map((group) => [group.key, 0]));
  groupCountsByOfficer.forEach((groupCounts) => {
    const topGroup = ethnicityGroups.reduce((best, group) =>
      (groupCounts.get(group.key) ?? 0) > (groupCounts.get(best.key) ?? 0) ? group : best
    );
    officersByGroup.set(topGroup.key, officersByGroup.get(topGroup.key) + 1);
  });

  return ethnicityGroups.map(({ key, label, colorClass }) => ({
    key,
    label,
    colorClass,
    count: officersByGroup.get(key),
  }));
};

const getArrestStats = async (from, until) => {
  const [facets] = await ArrestRecord.aggregate([
    { $match: { arrestedAt: { $gte: from, $lt: until } } },
    {
      $facet: {
        bySex: [{ $group: { _id: '$sex', count: { $sum: 1 } } }],
        byAge: [{ $match: { age: { $type: 'number' } } }, { $group: { _id: '$age', count: { $sum: 1 } } }],
        byEthnicity: [{ $unwind: '$ethnicities' }, { $group: { _id: '$ethnicities', count: { $sum: 1 } } }],
        // The first offense's officer is the arresting officer, as HPD Stats counted it
        officerEthnicities: [
          { $project: { officer: { $arrayElemAt: ['$offenses.officer', 0] }, ethnicities: 1 } },
          { $unwind: '$ethnicities' },
          { $group: { _id: { officer: '$officer', ethnicity: '$ethnicities' }, count: { $sum: 1 } } },
        ],
        flagged: [{ $match: { 'warnings.0': { $exists: true } } }, { $count: 'count' }],
      },
    },
  ]);

  const arrests = facets.bySex.reduce((sum, row) => sum + row.count, 0);
  const sexCount = (sex) => facets.bySex.find((row) => row._id === sex)?.count ?? 0;
  const men = sexCount('M');
  const women = sexCount('F');
  const ages = summarizeAges(facets.byAge);
  const officerGroups = toOfficerGroups(facets.officerEthnicities);

  return {
    totals: {
      arrests,
      men,
      women,
      menShare: percentOf(men, arrests),
      womenShare: percentOf(women, arrests),
      unknownSex: arrests - men - women,
      medianAge: ages.median,
      averageAge: ages.average,
      unknownAge: arrests - ages.known,
      flagged: facets.flagged[0]?.count ?? 0,
    },
    ageBands: toAgeBands(facets.byAge),
    ethnicities: toEthnicityRows(facets.byEthnicity),
    officerGroups,
    officerCount: officerGroups.reduce((sum, group) => sum + group.count, 0),
  };
};

// First and last days with arrests, or null before the first import
const getDataSpan = async () => {
  const [first, last] = await Promise.all([
    ArrestRecord.findOne().sort({ arrestedAt: 1 }).select('arrestedAt').lean(),
    ArrestRecord.findOne().sort({ arrestedAt: -1 }).select('arrestedAt').lean(),
  ]);
  if (!first) return null;

  const firstDay = toHawaiiDay(first.arrestedAt);
  const lastDay = toHawaiiDay(last.arrestedAt);
  return { firstDay, lastDay, label: `${formatDay(firstDay)} to ${formatDay(lastDay)}` };
};

const buildPresets = (range, span) => {
  const today = todayInHawaii();
  const presets = [
    { label: 'Last 7 days', start: addDays(today, -6), end: today },
    { label: 'Last 30 days', start: addDays(today, -29), end: today },
    { label: 'All time', start: span?.firstDay ?? today, end: today, href: '/' },
  ];

  return presets.map((preset) => ({
    label: preset.label,
    href: preset.href ?? `/?start=${preset.start}&end=${preset.end}`,
    selected: preset.start === range.start && preset.end === range.end,
  }));
};

// start and end: YYYY-MM-DD strings, already validated, or undefined for the defaults
const getDashboard = async ({ start, end }) => {
  const [span, lastLog] = await Promise.all([
    getDataSpan(),
    ArrestLog.findOne({ status: 'parsed' }).sort({ publishedAt: -1 }).select('publishedAt').lean(),
  ]);

  const today = todayInHawaii();
  const rangeStart = start ?? span?.firstDay ?? today;
  const rangeEnd = end ?? today;

  // The end day counts in full, so the range runs until the start of the next day
  const stats = await getArrestStats(startOfHawaiiDay(rangeStart), startOfHawaiiDay(addDays(rangeEnd, 1)));

  return {
    range: {
      start: rangeStart,
      end: rangeEnd,
      label: `${formatDay(rangeStart)} – ${formatDay(rangeEnd)}`,
      days: countDays(rangeStart, rangeEnd),
    },
    presets: buildPresets({ start: rangeStart, end: rangeEnd }, span),
    span,
    today,
    lastUpdated: lastLog ? formatDateTime(lastLog.publishedAt) : null,
    ...stats,
  };
};

module.exports = { getDashboard };
