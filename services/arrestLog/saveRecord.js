// Saves one arrest from one log, merging it with the same arrest read from other logs.

const ArrestRecord = require('../../model/ArrestRecord');

// Returns what happened: 'created', 'updated', or 'kept' (a newer log already updated it,
// which only happens when an older log is retried after a failure)
const saveRecord = async ({ dedupeKey, fields }, log) => {
  const existing = await ArrestRecord.findOne({ dedupeKey }).select('lastSeenAt');

  if (!existing) {
    await ArrestRecord.create({
      dedupeKey,
      ...fields,
      firstSeenIn: log._id,
      lastSeenIn: log._id,
      lastSeenAt: log.publishedAt,
    });
    return 'created';
  }

  if (existing.lastSeenAt > log.publishedAt) return 'kept';

  // The newest log wins: HPD corrects records between logs (a location, a release time)
  await ArrestRecord.updateOne(
    { _id: existing._id },
    { $set: { ...fields, lastSeenIn: log._id, lastSeenAt: log.publishedAt } },
    { runValidators: true }
  );
  return 'updated';
};

module.exports = { saveRecord };
