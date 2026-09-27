// Turns one parsed record into the fields saved on an ArrestRecord, or a reason it can't be saved.

const { reportNumberPattern, splitDateTime, toHawaiiDate } = require('./printedFormats');

// Values that failed OCR are left out rather than saved wrong; the record's warnings explain why
const toSex = (text) => (['M', 'F'].includes(text) ? text : undefined);

const toAge = (text) => {
  const age = Number(text);
  return /^\d+$/.test(text) && age >= 18 && age <= 122 ? age : undefined;
};

const toReleasedAt = (text) => {
  const parts = splitDateTime(text);
  return parts ? toHawaiiDate(parts.date, parts.time) : undefined;
};

// Consecutive logs overlap, so the same arrest is read several times and needs a key that
// stays the same between reads. Names are left out: OCR noise at the end of cut-off names
// ("KEOLA?" in one log, "KEOLAT" in the next) would make one person look like two.
const buildDedupeKey = (arrestedAt, reportNumbers, sex, age) => {
  const incident = [...reportNumbers].sort()[0].split('-')[0]; // "26340443-001" -> "26340443"
  return [arrestedAt.toISOString(), incident, sex ?? '?', age ?? '?'].join('|');
};

const toRecordFields = (parsed) => {
  const arrestedAt = toHawaiiDate(parsed.date, parsed.time);
  if (!arrestedAt) {
    return { skipReason: `arrest date and time "${parsed.date} ${parsed.time}" could not be read` };
  }

  const reportNumbers = parsed.offenses
    .map((offense) => offense.reportNumber)
    .filter((reportNumber) => reportNumberPattern.test(reportNumber));
  if (reportNumbers.length === 0) {
    return { skipReason: 'no report number could be read' };
  }

  const sex = toSex(parsed.sex);
  const age = toAge(parsed.age);

  const offenses = parsed.offenses.map((offense) => ({
    reportNumber: offense.reportNumber,
    offenseName: offense.offenseName,
    statute: offense.statute,
    location: offense.location,
    officer: offense.officer,
    courtInfo: offense.courtInfo || undefined,
    releasedAt: toReleasedAt(offense.releaseDateTime),
    releaseInfo: offense.releaseInfo || undefined,
  }));

  // HPD occasionally prints a release time before the arrest time. Keep it as printed, but flag it.
  const releaseWarnings = offenses
    .filter((offense) => offense.releasedAt && offense.releasedAt < arrestedAt)
    .map((offense) => `offense ${offense.reportNumber} shows a release time before the arrest time`);

  return {
    dedupeKey: buildDedupeKey(arrestedAt, reportNumbers, sex, age),
    fields: {
      arrestedAt,
      name: parsed.name,
      ethnicities: parsed.ethnicities,
      sex,
      age,
      offenses,
      warnings: [...parsed.warnings, ...releaseWarnings],
    },
  };
};

module.exports = { toRecordFields };
