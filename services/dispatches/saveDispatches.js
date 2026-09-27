// Saves one check of HPD's active calls. A call stays listed while it's open, so each check
// either adds it or moves its lastSeenAt forward.

const Dispatch = require('../../model/Dispatch');

const toDedupeKey = (call) => [call.receivedAt.toISOString(), call.type, call.address].join('|');

// Returns how many calls were new and how many were already stored and still open
const saveDispatches = async ({ updatedAt, calls }) => {
  if (calls.length === 0) return { created: 0, stillOpen: 0 };

  const result = await Dispatch.bulkWrite(
    calls.map((call) => {
      const dedupeKey = toDedupeKey(call);
      return {
        updateOne: {
          filter: { dedupeKey },
          update: {
            $setOnInsert: { ...call, dedupeKey, firstSeenAt: updatedAt },
            $max: { lastSeenAt: updatedAt }, // Never moves backwards
          },
          upsert: true,
        },
      };
    })
  );

  return { created: result.upsertedCount, stillOpen: result.modifiedCount };
};

module.exports = { saveDispatches };
