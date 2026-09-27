// One page of the Arrests feed, newest first, shaped for the cards. Arrestee and officer
// names are only read from the database when showNames is true.

const mongoose = require('mongoose');
const ArrestRecord = require('../../model/ArrestRecord');
const { formatDateTime } = require('../dashboard/hawaiiDays');
const { toSearchWords, toTextSearch } = require('./searchWords');

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
  // Shown as chips: "Age 32", "Male", then one per ethnicity
  chips: [record.age && `Age ${record.age}`, sexLabels[record.sex], ...record.ethnicities].filter(Boolean),
  offenses: record.offenses.map((offense) => ({
    name: offense.offenseName || 'Offense not readable',
    statute: offense.statute,
    // Only a printed release date counts as released; a blank one proves nothing about custody
    released: Boolean(offense.releasedAt),
    fields: toOffenseFields(offense, showNames),
  })),
  source: record.lastSeenIn && {
    label: formatDateTime(record.lastSeenIn.publishedAt),
    url: record.lastSeenIn.pdfUrl || record.lastSeenIn.sourceUrl,
  },
  warnings: record.warnings ?? [],
});

// Links keep the search, so "Load more" and "Back to the newest" stay within the results
const toHref = (search, record) => {
  const params = new URLSearchParams(search ? { q: search } : {});
  if (record) {
    params.set('beforeTime', record.arrestedAt.toISOString());
    params.set('beforeId', String(record._id));
  }
  const query = params.toString();
  return query ? `/arrests?${query}` : '/arrests';
};

// Only arrests whose charges contain every search word. $text is an operator we write here,
// not one taken from the request, so it's marked trusted for sanitizeFilter.
const matchingSearch = (words) =>
  words.length > 0 ? { $text: mongoose.trusted({ $search: toTextSearch(words) }) } : {};

// cursor: { beforeTime, beforeId } from the validated query, or null for the newest page.
// search: what was typed in the search box, or '' for every arrest.
const listArrests = async ({ cursor, showNames, search = '' }) => {
  const searchFilter = matchingSearch(toSearchWords(search));
  const filter = { ...searchFilter, ...olderThan(cursor) };

  const [records, total, olderCount] = await Promise.all([
    ArrestRecord.find(filter)
      .sort({ arrestedAt: -1, _id: -1 })
      .limit(pageSize + 1) // One extra shows whether another page exists
      .select(showNames ? '+name' : '-offenses.officer')
      .populate('lastSeenIn', 'publishedAt pdfUrl sourceUrl')
      .lean(),
    ArrestRecord.countDocuments(searchFilter),
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
    firstPageHref: toHref(search),
    nextHref: records.length > pageSize ? toHref(search, pageRecords[pageRecords.length - 1]) : null,
  };
};

module.exports = { listArrests };
