// One page of the Arrests feed, newest first, shaped for the cards. Arrestee and officer
// names are only read from the database when showNames is true.

const mongoose = require('mongoose');
const ArrestRecord = require('../../model/ArrestRecord');
const { formatDateTime } = require('../dashboard/hawaiiDays');

const pageSize = 20;
const sexLabels = { M: 'Male', F: 'Female' };

// Records older than the cursor: an earlier arrest time, or the same time and a smaller id.
// These operators are written here, not taken from the request, so they're marked trusted
// for sanitizeFilter.
const olderThan = (cursor) => {
  if (!cursor) return {};

  const arrestedAt = new Date(cursor.beforeTime);
  const id = new mongoose.Types.ObjectId(cursor.beforeId);
  return {
    $or: [
      { arrestedAt: mongoose.trusted({ $lt: arrestedAt }) },
      { arrestedAt, _id: mongoose.trusted({ $lt: id }) },
    ],
  };
};

// [label, value] pairs for an offense, leaving out anything HPD didn't print
const toOffenseFields = (offense, showNames) => {
  const release = [offense.releasedAt && formatDateTime(offense.releasedAt), offense.releaseInfo]
    .filter(Boolean)
    .join(' · ');

  return [
    ['Report number', offense.reportNumber],
    ['Location', offense.location],
    ['Arresting officer', showNames ? offense.officer || 'Not readable' : 'Name withheld'],
    ['Court', offense.courtInfo],
    ['Release', release],
  ].filter(([, value]) => value);
};

const toCard = (record, showNames) => ({
  arrestedAt: formatDateTime(record.arrestedAt),
  name: showNames ? record.name || 'Name not readable' : 'Name withheld',
  nameShown: showNames && Boolean(record.name),
  details: [record.age, sexLabels[record.sex], record.ethnicities.join(', ')].filter(Boolean).join(' · '),
  offenses: record.offenses.map((offense) => ({
    title: [offense.offenseName, offense.statute].filter(Boolean).join(' · ') || 'Offense not readable',
    fields: toOffenseFields(offense, showNames),
  })),
  source: record.lastSeenIn && {
    label: formatDateTime(record.lastSeenIn.publishedAt),
    url: record.lastSeenIn.pdfUrl || record.lastSeenIn.sourceUrl,
  },
  warnings: record.warnings ?? [],
});

const toNextHref = (record) => {
  const params = new URLSearchParams({
    beforeTime: record.arrestedAt.toISOString(),
    beforeId: String(record._id),
  });
  return `/arrests?${params}`;
};

// cursor: { beforeTime, beforeId } from the validated query, or null for the newest page
const listArrests = async ({ cursor, showNames }) => {
  const filter = olderThan(cursor);

  const [records, total, olderCount] = await Promise.all([
    ArrestRecord.find(filter)
      .sort({ arrestedAt: -1, _id: -1 })
      .limit(pageSize + 1) // One extra shows whether another page exists
      .select(showNames ? '+name' : '-offenses.officer')
      .populate('lastSeenIn', 'publishedAt pdfUrl sourceUrl')
      .lean(),
    ArrestRecord.countDocuments(),
    ArrestRecord.countDocuments(filter),
  ]);

  const pageRecords = records.slice(0, pageSize);
  const start = total - olderCount + 1; // This page's first card, counting from the newest

  return {
    cards: pageRecords.map((record) => toCard(record, showNames)),
    total,
    start,
    end: start + pageRecords.length - 1,
    isFirstPage: !cursor,
    nextHref: records.length > pageSize ? toNextHref(pageRecords[pageRecords.length - 1]) : null,
  };
};

module.exports = { listArrests };
