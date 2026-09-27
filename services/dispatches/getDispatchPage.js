// Everything the Dispatches page shows: the calls HPD listed in its latest update (with map
// coordinates where known), and counts for the last 7 days.

const Dispatch = require('../../model/Dispatch');
const { toTopRows } = require('../chartRows');
const { findStaleness } = require('../staleness');
const { findPlaced, placeKey } = require('./geocodePlaces');
const { formatDateTime, formatShortDateTime } = require('../dashboard/hawaiiDays');

const historyDays = 7;
const shownTypes = 10; // The rest fold into one "All others" bar
const msPerDay = 24 * 60 * 60 * 1000;

// HPD's list normally changes every 15 minutes or so
const staleAfterHours = 1;

const toCallRow = (call) => ({
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

  const byType = toTopRows(facets.byType, shownTypes);
  const byDistrict = toTopRows(facets.byDistrict, facets.byDistrict.length); // All eight districts

  // Dots for the map: only what the popup shows, for calls whose place was found
  const placed = await findPlaced(activeCalls);
  const mapPoints = activeCalls
    .filter((call) => placed.has(placeKey(call)))
    .map((call) => {
      const place = placed.get(placeKey(call));
      return { ...toCallRow(call), lat: place.lat, lng: place.lng, streetLevel: place.precision === 'street' };
    });

  return {
    lastUpdated: formatDateTime(latest.lastSeenAt),
    stale: findStaleness(latest.lastSeenAt, staleAfterHours),
    activeCalls: activeCalls.map(toCallRow),
    mapPoints,
    unplacedCount: activeCalls.length - mapPoints.length,
    historyDays,
    history: {
      total: facets.total[0]?.count ?? 0,
      topType: byType[0] ?? null,
      topDistrict: byDistrict[0] ?? null,
      byType,
      byDistrict,
    },
  };
};

module.exports = { getDispatchPage };
