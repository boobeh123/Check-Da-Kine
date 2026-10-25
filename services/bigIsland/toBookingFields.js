// Turns one parsed Big Island booking into the fields saved on an arrest record (the same
// shape as an Oʻahu one, see arrestLog/toRecordFields.js), or a reason it can't be saved.

const { toHawaiiDate } = require('../arrestLog/printedFormats');
const { dateTimePattern } = require('./bookingLayout');

// "10/22/26 01:56", printed in Hawaii time, -> a Date, or null if it isn't a real time
const toDate = (text) => {
  const match = dateTimePattern.exec(text ?? '');
  return match ? toHawaiiDate(`${match[1]}/${match[2]}/20${match[3]}`, `${match[4]}:${match[5]}`) : null;
};

// "291E-0061 OVUII" -> { statute: "HRS 291E-0061", offenseName: "OVUII" }. An HRS section is
// digits, sometimes a letter, then "-" or ":" and more ("431:10C-104", "804-0007.2",
// "291C-0103(a)(d)"). A charge printed without one ("ACT 151 C ...") keeps all its text as the
// name; that's how it was printed, not a misreading, so it isn't flagged.
const statutePattern = /^(\d{1,3}[A-Z]?[-:][\w.:()-]+)\s+(.+)$/;
const splitCharge = (text) => {
  const match = statutePattern.exec(text ?? '');
  return match ? { statute: `HRS ${match[1]}`, offenseName: match[2] } : { statute: undefined, offenseName: text || undefined };
};

// "$1,000" -> 1000
const toDollars = (text) => {
  const match = /^\$([\d,]+)$/.exec(text ?? '');
  return match ? Number(match[1].replace(/,/g, '')) : undefined;
};

const toSex = (text) => (['M', 'F'].includes(text) ? text : undefined);

const toAge = (text) => {
  const age = Number(text);
  return /^\d+$/.test(text ?? '') && age >= 18 && age <= 122 ? age : undefined;
};

const toBookingFields = (booking) => {
  const arrestedAt = toDate(booking.arrestedOn);
  if (!arrestedAt) return { skipReason: `arrest time "${booking.arrestedOn ?? ''}" could not be read` };

  // Values that don't read cleanly are left out rather than saved wrong, and said why
  const warnings = [...(booking.problems ?? [])];
  const sex = toSex(booking.gender);
  if (!sex) warnings.push(`gender "${booking.gender ?? ''}" is not M or F`);
  const age = toAge(booking.age);
  if (age === undefined) warnings.push(`age "${booking.age ?? ''}" is not a whole number from 18 to 122`);
  const releasedAt = booking.releasedOn ? toDate(booking.releasedOn) : null;
  if (booking.releasedOn && !releasedAt) warnings.push(`release time "${booking.releasedOn}" could not be read`);

  // The arresting officer and release time are the booking's; each charge carries them, the
  // way Oʻahu's log prints them per charge, so the dashboard, filters and cards work the same
  const offenses = booking.charges.map((charge) => {
    const { statute, offenseName } = splitCharge(charge.charge);
    ['bailSet', 'bailPosted']
      .filter((field) => charge[field] && toDollars(charge[field]) === undefined)
      .forEach((field) => warnings.push(`bail "${charge[field]}" is not a dollar amount`));
    return {
      reportNumber: charge.reportNumber,
      offenseName,
      statute,
      officer: booking.officer,
      courtInfo: [charge.courtCode, charge.courtDate].filter(Boolean).join(' ') || undefined,
      releasedAt: releasedAt ?? undefined,
      releaseInfo: charge.release,
      bailSet: toDollars(charge.bailSet),
      bailPosted: toDollars(charge.bailPosted),
    };
  });

  // The OTN (Offense Tracking Number) is the arrest's own number, so it's the key that merges
  // the same booking from the overlapping 48-hour logs. Without one, the same key Oʻahu's
  // records use, minus names: time, lowest report number, sex and age.
  const lowestReportNumber = offenses.map((offense) => offense.reportNumber).filter(Boolean).sort()[0];
  const dedupeKey = booking.otn
    ? `otn:${booking.otn}`
    : [arrestedAt.toISOString(), lowestReportNumber ?? '?', sex ?? '?', age ?? '?'].join('|');

  return {
    dedupeKey,
    fields: {
      arrestedAt,
      otn: booking.otn,
      name: booking.name,
      ethnicities: booking.race ? [booking.race] : [],
      sex,
      age,
      residence: booking.hometown,
      offenses,
      warnings,
    },
  };
};

module.exports = { toBookingFields };
