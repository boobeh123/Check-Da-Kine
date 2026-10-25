// One page of an island's Arrests feed, newest first, shaped for the cards. Arrestee and
// officer names, and Big Island hometowns, are only read from the database when showNames is
// true.

const mongoose = require('mongoose');
const { agencies } = require('../agencies');
const { formatDateTime } = require('../dashboard/hawaiiDays');
const { archiveLink } = require('../arrestLog/archivePdf');
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

const toDollars = (amount) => `$${amount.toLocaleString('en-US')}`;

// "$1,000 set, $1,000 posted", from the Big Island's logs; Oʻahu's print no bail
const toBail = ({ bailSet, bailPosted }) => {
  if (bailSet === undefined || bailSet === null) return undefined;
  if (bailSet === 0) return 'None set';
  return bailPosted > 0 ? `${toDollars(bailSet)} set, ${toDollars(bailPosted)} posted` : `${toDollars(bailSet)} set`;
};

// [label, value] pairs for an offense, leaving out anything the log didn't print
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
    ['Bail', toBail(offense)],
  ].filter(([, value]) => value);
};

// agency: the island, for its archive folder (services/agencies.js); Oʻahu by default
const toCard = (record, showNames, agency = agencies.oahu) => ({
  arrestedAt: formatDateTime(record.arrestedAt),
  name: showNames ? record.name || 'Name not readable' : 'Name withheld',
  nameShown: showNames && Boolean(record.name),
  // The Big Island's logs print each arrestee's town, which can point to one person in a
  // small town, so it's withheld from guests like the name
  hometown: showNames ? record.residence : undefined,
  // Shown as chips: "Age 32", "Male", then one per ethnicity
  chips: [record.age && `Age ${record.age}`, sexLabels[record.sex], ...record.ethnicities].filter(Boolean),
  offenses: record.offenses.map((offense) => ({
    name: offense.offenseName || 'Offense not readable',
    statute: offense.statute,
    // Only a printed release date counts as released; a blank one proves nothing about custody
    released: Boolean(offense.releasedAt),
    fields: toOffenseFields(offense, showNames),
  })),
  // The log's PDF prints every name, so only logged-in users get a link to it: our copy, or
  // the department's while it still lists the log, if we have none or can't sign a link to ours
  source: showNames && record.lastSeenIn && {
    label: formatDateTime(record.lastSeenIn.publishedAt),
    url: archiveLink(record.lastSeenIn, { folder: agency.archiveFolder }) ?? record.lastSeenIn.sourceUrl,
  },
  warnings: record.warnings ?? [],
});

// Links keep the search and filters, so "Load more" and "Back to the newest" stay within
// the results. path is the island's Arrests page.
const toHref = ({ search, charge, sex, officer }, record, path = agencies.oahu.paths.arrests) => {
  const chosen = Object.entries({ q: search, charge, sex, officer }).filter(([, value]) => value);
  const params = new URLSearchParams(chosen);
  if (record) {
    params.set('beforeTime', record.arrestedAt.toISOString());
    params.set('beforeId', String(record._id));
  }
  const query = params.toString();
  return query ? `${path}?${query}` : path;
};

// The arrests matching the search and filters. Every operator here is written by us, not
// taken from the request, so each is marked trusted for sanitizeFilter. The chosen charge and
// officer must be on the same charge: "THEFT 4" by officer X means X made that THEFT 4 arrest.
// Variants come from the database (filterOptions.js), never from the request.
const buildFilter = ({ search = '', sex = '', chargeVariants = null, officerVariants = null }) => {
  const words = toSearchWords(search);
  const sameCharge = {
    ...(chargeVariants && { offenseName: mongoose.trusted({ $in: chargeVariants }) }),
    ...(officerVariants && { officer: mongoose.trusted({ $in: officerVariants }) }),
  };

  return {
    ...(words.length > 0 && { $text: mongoose.trusted({ $search: toTextSearch(words) }) }),
    ...(sex && { sex }),
    ...(Object.keys(sameCharge).length > 0 && { offenses: mongoose.trusted({ $elemMatch: sameCharge }) }),
  };
};

// cursor: { beforeTime, beforeId } from the validated query, or null for the newest page.
// filters: { search, charge, sex, officer, chargeVariants, officerVariants } from
// resolveFilters (filterOptions.js); empty for every arrest. agency: the island
// (services/agencies.js), Oʻahu by default.
const listArrests = async ({ cursor, showNames, filters = {}, agency = agencies.oahu }) => {
  const matching = buildFilter(filters);
  const filter = { ...matching, ...olderThan(cursor) };
  const { Record, Log } = agency;

  const [records, total, olderCount] = await Promise.all([
    Record.find(filter)
      .sort({ arrestedAt: -1, _id: -1 })
      .limit(pageSize + 1) // One extra shows whether another page exists
      .select(showNames ? '+name +residence' : '-offenses.officer')
      // The schema's ref names Oʻahu's logs, so each island's log model is given here
      .populate({ path: 'lastSeenIn', model: Log, select: 'publishedAt fileName pdfUrl sourceUrl' })
      .lean(),
    Record.countDocuments(matching),
    Record.countDocuments(filter),
  ]);

  const pageRecords = records.slice(0, pageSize);
  const start = total - olderCount + 1; // This page's first card, counting from the newest
  const path = agency.paths.arrests;

  return {
    cards: pageRecords.map((record) => toCard(record, showNames, agency)),
    total,
    start,
    end: start + pageRecords.length - 1,
    isFirstPage: !cursor,
    firstPageHref: toHref(filters, undefined, path),
    nextHref: records.length > pageSize ? toHref(filters, pageRecords[pageRecords.length - 1], path) : null,
  };
};

module.exports = { listArrests, buildFilter, toHref, toCard };
