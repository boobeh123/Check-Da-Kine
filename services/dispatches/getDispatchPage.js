// Everything the Dispatches page shows: the calls HPD listed in its latest update (with map
// coordinates where known), and counts for the last 7 days.

const Dispatch = require('../../model/Dispatch');
const { withShares, toRankedRows, toTopBars } = require('../chartRows');
const { findStaleness } = require('../staleness');
const { findPlaced, placeKey } = require('./geocodePlaces');
const { formatDateTime, formatShortDateTime } = require('../dashboard/hawaiiDays');

const historyDays = 7;
const msPerDay = 24 * 60 * 60 * 1000;

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

const getDispatchPage = async () => {
  const latest = await Dispatch.findOne().sort({ lastSeenAt: -1 }).select('lastSeenAt').lean();
  if (!latest) return { lastUpdated: null, stale: null };

  const since = new Date(Date.now() - historyDays * msPerDay);
  const [activeCalls, [facets]] = await Promise.all([
    // Every call in HPD's latest update shares that update's time as its lastSeenAt
    Dispatch.find({ lastSeenAt: latest.lastSeenAt }).sort({ receivedAt: -1 }).lean(),
    Dispatch.aggregate([
      { $match: { receivedAt: { $gte: since } } },
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
    historyDays,
    history: {
      since: formatDateTime(since), // The window moves with every page load
      total: facets.total[0]?.count ?? 0,
      topType: byType.rows[0] ?? null,
      topDistrict: byDistrict[0] ?? null,
      byType,
      byDistrict,
    },
  };
};

module.exports = { getDispatchPage };
