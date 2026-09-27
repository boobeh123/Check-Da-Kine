// Turns one arrest-log PDF into an array of records.
// Node port of the pipeline in scrape/main.py.

const { renderPages } = require('./renderPages');
const { buildRecordStrip, segmentRecords, findInkRuns, groupIntoWords } = require('./segmentRecords');
const {
  createFieldReader,
  correctEthnicities,
  isHpdEthnicity,
  digitsOnly,
  lettersOnly,
} = require('./ocrFields');
const {
  renderScale,
  recordFields,
  offenseFields,
  sexAgeLine,
  ageAfterSlash,
  ageRight,
  releaseInfoLine,
  wordGap,
  slashMaxWidth,
} = require('./layoutConstants');
const {
  timePattern,
  reportNumberPattern,
  isRealDate,
  splitDateTime,
} = require('./printedFormats');

// Release info is printed as "RBL / 500" (code / amount), an amount alone, or a code alone.
// readReleaseInfo splits it at the slash; this cleanup is for the rare line it can't split.
// Tesseract often reads the " / " as "/" or "7/", so rebuild the printed form. Amounts come
// after the slash, so a 7 dropped from before it is never part of the amount.
const normalizeReleaseInfo = (text) => {
  const match = /^([A-Z]+)\s*7?\s*\/\s*(\d+)$/.exec(text); // CODE, misread 7, slash, AMOUNT
  return match ? `${match[1]} / ${match[2]}` : text;
};

// The sex box reads "M /" or "F /"; keep the letter, or the raw text so it gets flagged
const toSexLetter = (text) => /^[MF]/.exec(text)?.[0] ?? text;

// Lists every field that doesn't look right, so bad OCR is flagged instead of silently dropped
const findWarnings = (record) => {
  const warnings = [];
  const age = Number(record.age);

  if (!isRealDate(record.date)) warnings.push(`date "${record.date}" is not a valid MM/DD/YYYY date`);
  if (!timePattern.test(record.time)) warnings.push(`time "${record.time}" is not HH:MM`);
  if (!['M', 'F'].includes(record.sex)) warnings.push(`sex "${record.sex}" is not M or F`);
  if (!/^\d+$/.test(record.age) || age < 18 || age > 122) {
    warnings.push(`age "${record.age}" is not a whole number from 18 to 122`);
  }
  if (record.ethnicities.length === 0) warnings.push('no ethnicity was read');
  record.ethnicities
    .filter((ethnicity) => !isHpdEthnicity(ethnicity))
    .forEach((ethnicity) => warnings.push(`ethnicity "${ethnicity}" isn't one of HPD's categories`));
  if (record.offenses.length === 0) warnings.push('no offenses were detected');

  record.offenses.forEach((offense, index) => {
    if (!reportNumberPattern.test(offense.reportNumber)) {
      warnings.push(`offense ${index + 1} report number "${offense.reportNumber}" is not the NNNNNNNN-NNN format`);
    }
    // Most offenses have no release date yet, so only a non-empty one is checked
    if (offense.releaseDateTime !== '' && !splitDateTime(offense.releaseDateTime)) {
      warnings.push(`offense ${index + 1} release "${offense.releaseDateTime}" is not MM/DD/YYYY HH:MM`);
    }
  });

  return warnings;
};

// OCRs every field in a group of boxes, one at a time on the shared worker
const readFields = async (reader, strip, fields, region) => {
  const values = {};
  for (const [field, box] of Object.entries(fields)) {
    values[field] = await reader.readField(strip, box, region.top, region.bottom);
  }
  return values;
};

// The age starts just after the slash in "M / 44". The first two runs of ink are the letter
// and the slash; if the line doesn't look like that, start where a man's age would.
const readAge = async (reader, strip, region) => {
  const [, slash] = findInkRuns(strip, sexAgeLine, region.top, region.bottom);
  const ageLeft = slash ? slash.right + 1 + ageAfterSlash : 177; // 177: after a man's slash
  const ageBox = { top: sexAgeLine.top, bottom: sexAgeLine.bottom, left: ageLeft, right: ageRight };
  return reader.readField(strip, ageBox, region.top, region.bottom, digitsOnly);
};

// "RBL / 500" is split at the spaces around the slash, and the code and the amount are read
// separately (letters only, then digits only), so the slash can never be misread as a 7.
// An amount or a code on its own ("500", "OTH") is read the original way.
const readReleaseInfo = async (reader, strip, offenseRegion) => {
  const runs = findInkRuns(strip, releaseInfoLine, offenseRegion.top, offenseRegion.bottom);
  const words = groupIntoWords(runs, wordGap);
  const slashIndex = words.findIndex(
    (word, index) => index > 0 && index < words.length - 1 && word.right - word.left < slashMaxWidth
  );

  if (slashIndex !== -1) {
    const lineBox = { top: releaseInfoLine.top, bottom: releaseInfoLine.bottom };
    const codeBox = { ...lineBox, left: words[0].left, right: words[slashIndex - 1].right + 1 };
    const amountBox = { ...lineBox, left: words[slashIndex + 1].left, right: words[words.length - 1].right + 1 };
    const code = await reader.readField(strip, codeBox, offenseRegion.top, offenseRegion.bottom, lettersOnly);
    const amount = await reader.readField(strip, amountBox, offenseRegion.top, offenseRegion.bottom, digitsOnly);
    if (code && amount) return `${code} / ${amount}`;
  }

  const text = await reader.readField(strip, releaseInfoLine, offenseRegion.top, offenseRegion.bottom);
  return normalizeReleaseInfo(text);
};

const readRecord = async (reader, strip, region) => {
  const { ethnicities, ...recordValues } = await readFields(reader, strip, recordFields, region);
  const age = await readAge(reader, strip, region);

  const offenses = [];
  for (const offenseRegion of region.offenses) {
    const offense = await readFields(reader, strip, offenseFields, offenseRegion);
    offenses.push({ ...offense, releaseInfo: await readReleaseInfo(reader, strip, offenseRegion) });
  }

  const record = {
    ...recordValues,
    age,
    sex: toSexLetter(recordValues.sex),
    ethnicities: correctEthnicities(ethnicities),
    offenses,
  };

  return { ...record, warnings: findWarnings(record) };
};

const parseArrestLog = async (pdfBuffer) => {
  const pages = await renderPages(pdfBuffer, renderScale);
  const strip = buildRecordStrip(pages);
  const regions = segmentRecords(strip);
  const reader = await createFieldReader();

  try {
    const records = [];
    for (const region of regions) {
      records.push(await readRecord(reader, strip, region));
    }
    return records;
  } finally {
    await reader.terminate();
  }
};

// The cleanup rules are exported for the tests (test/arrestRecords.test.js)
module.exports = { parseArrestLog, normalizeReleaseInfo, toSexLetter, findWarnings };
