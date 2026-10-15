// Everything the Dispatches page shows: the calls HPD listed in its latest update (with map
// coordinates where known), and counts for a date range, the last 7 days unless another is
// chosen with the date filter.

const Dispatch = require('../../model/Dispatch');
const { withShares, toRankedRows, toTopBars } = require('../chartRows');
const { describeRange, buildPresets } = require('../dateRanges');
const { findStaleness } = require('../staleness');
const { findPlaced, placeKey } = require('./geocodePlaces');
const {
  todayInHawaii,
  toHawaiiDay,
  startOfHawaiiDay,
  addDays,
  formatDay,
  formatDateTime,
  formatShortDateTime,
} = require('../dashboard/hawaiiDays');

const defaultDays = 7;

// A week holds dozens of call types, most with only a few calls, so the chart gives bars to
// the most common and sums up the rest underneath. Its table lists every type.
const shownTypes = 15;

// HPD's list normally changes every 15 minutes or so
const staleAfterHours = 1;

// index: the call's place in the list, which links its row to its dot on the map
const toCallRow = (call, index) => ({
  id: String(index),
  receivedAt: formatShortDateTime(call.receivedAt),
  receivedIso: call.receivedAt.toISOString(),
  type: call.type,
  place: [call.address, call.city].filter(Boolean).join(', '),
  district: call.district,
});

// start and end: YYYY-MM-DD strings, already validated, or undefined for the defaults
const getDispatchPage = async ({ start, end } = {}) => {
  const [latest, first] = await Promise.all([
    Dispatch.findOne().sort({ lastSeenAt: -1 }).select('lastSeenAt').lean(),
    Dispatch.findOne().sort({ receivedAt: 1 }).select('receivedAt').lean(),
  ]);
  if (!latest) return { lastUpdated: null, stale: null };

  // Without a start, the range is the 7 days that end on the end day (today by default)
  const today = todayInHawaii();
  const rangeEnd = end ?? today;
  const range = describeRange(start ?? addDays(rangeEnd, -(defaultDays - 1)), rangeEnd);
  const firstDay = toHawaiiDay(first.receivedAt);

  const [activeCalls, [facets]] = await Promise.all([
    // Every call in HPD's latest update shares that update's time as its lastSeenAt
    Dispatch.find({ lastSeenAt: latest.lastSeenAt }).sort({ receivedAt: -1 }).lean(),
    Dispatch.aggregate([
      // The end day counts in full, so the range runs until the start of the next day
      { $match: { receivedAt: { $gte: startOfHawaiiDay(range.start), $lt: startOfHawaiiDay(addDays(range.end, 1)) } } },
      {
        $facet: {
          total: [{ $count: 'count' }],
          byType: [{ $group: { _id: '$type', count: { $sum: 1 } } }],
          byDistrict: [{ $group: { _id: '$district', count: { $sum: 1 } } }],
        },
      },
    ]),
  ]);

  const byType = toTopBars(facets.byType, shownTypes);
  const byDistrict = withShares(toRankedRows(facets.byDistrict)); // All eight districts, and any not listed

  // Dots for the map: only what the popup shows, for calls whose place was found
  const placed = await findPlaced(activeCalls);
  const mapPoints = activeCalls.flatMap((call, index) => {
    const place = placed.get(placeKey(call));
    if (!place) return [];
    return [{ ...toCallRow(call, index), lat: place.lat, lng: place.lng, streetLevel: place.precision === 'street' }];
  });

  return {
    lastUpdated: formatDateTime(latest.lastSeenAt),
    stale: findStaleness(latest.lastSeenAt, staleAfterHours),
    activeCalls: activeCalls.map(toCallRow),
    mapPoints,
    unplacedCount: activeCalls.length - mapPoints.length,
    // The date filter. The last 7 days are the default here; the home page's is all time.
    range,
    presets: buildPresets({ path: '/dispatches', range, firstDay, today, defaultLabel: 'Last 7 days' }),
    today,
    // Set when the range starts before the first call on record, so the page can say so
    recordsStart: range.start < firstDay ? formatDay(firstDay) : null,
    history: {
      total: facets.total[0]?.count ?? 0,
      topType: byType.rows[0] ?? null,
      topDistrict: byDistrict[0] ?? null,
      byType,
      byDistrict,
    },
  };
};

module.exports = { getDispatchPage };
