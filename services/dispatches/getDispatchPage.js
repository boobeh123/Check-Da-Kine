// Everything the Dispatches page shows: the calls HPD listed in its latest update, and
// counts for the last 7 days.

const Dispatch = require('../../model/Dispatch');
const { toTopRows } = require('../chartRows');
const { formatDateTime, formatShortDateTime } = require('../dashboard/hawaiiDays');

const historyDays = 7;
const shownTypes = 10; // The rest fold into one "All others" bar
const msPerDay = 24 * 60 * 60 * 1000;

const toCallRow = (call) => ({
  receivedAt: formatShortDateTime(call.receivedAt),
  receivedIso: call.receivedAt.toISOString(),
  type: call.type,
  place: [call.address, call.city].filter(Boolean).join(', '),
  district: call.district,
});

const getDispatchPage = async () => {
  const latest = await Dispatch.findOne().sort({ lastSeenAt: -1 }).select('lastSeenAt').lean();
  if (!latest) return { lastUpdated: null };

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

  return {
    lastUpdated: formatDateTime(latest.lastSeenAt),
    activeCalls: activeCalls.map(toCallRow),
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
