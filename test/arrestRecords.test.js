// Turning OCR output into arrest records: the release-info and sex cleanup, warnings for
// fields that don't look right, the key that merges the same arrest across overlapping logs,
// and the pixel scanning that finds where the age starts and splits "RBL / 500".
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { normalizeReleaseInfo, toSexLetter, findWarnings } = require('../services/arrestLog/parseArrestLog');
const { toRecordFields } = require('../services/arrestLog/toRecordFields');
const { findInkRuns, groupIntoWords } = require('../services/arrestLog/segmentRecords');
const { wordGap, slashMaxWidth } = require('../services/arrestLog/layoutConstants');

// A record as parseArrestLog returns it. Every value is made up.
const parsedRecord = (overrides = {}) => ({
  date: '09/26/2026',
  time: '15:48',
  name: 'DOE, JANE',
  ethnicities: ['Hawaiian'],
  sex: 'M',
  age: '32',
  offenses: [
    {
      reportNumber: '26000000-001',
      offenseName: 'THEFT 4',
      statute: 'HRS 708-0833',
      location: '1XX EXAMPLE ST',
      officer: 'OFFICER, TEST',
      courtInfo: 'HONOLULU DISTRICT / 1A 10/26/2026 09:00',
      releaseDateTime: '09/26/2026 16:30',
      releaseInfo: 'RBL / 100',
    },
  ],
  warnings: [],
  ...overrides,
});

describe('normalizeReleaseInfo', () => {
  it('rebuilds "CODE / AMOUNT" when the slash was misread', () => {
    assert.equal(normalizeReleaseInfo('RBL 7/500'), 'RBL / 500');
    assert.equal(normalizeReleaseInfo('RBL 7 / 500'), 'RBL / 500');
    assert.equal(normalizeReleaseInfo('RBL/500'), 'RBL / 500');
  });

  it('leaves everything else as read', () => {
    assert.equal(normalizeReleaseInfo('RBL / 500'), 'RBL / 500');
    assert.equal(normalizeReleaseInfo('500'), '500');
    assert.equal(normalizeReleaseInfo('OTH'), 'OTH');
    assert.equal(normalizeReleaseInfo('RBL 7500'), 'RBL 7500'); // No slash, so no way to tell
  });
});

describe('toSexLetter', () => {
  it('keeps the letter from "M /" or "F /"', () => {
    assert.equal(toSexLetter('M /'), 'M');
    assert.equal(toSexLetter('F/'), 'F');
    assert.equal(toSexLetter('F'), 'F');
  });

  it('keeps anything else as read, so it gets flagged', () => {
    assert.equal(toSexLetter('= /'), '= /');
    assert.equal(toSexLetter(''), '');
  });
});

describe('findWarnings', () => {
  it('finds nothing wrong with a clean record', () => {
    assert.deepEqual(findWarnings(parsedRecord()), []);
  });

  it('flags each field that failed OCR', () => {
    const warnings = findWarnings(
      parsedRecord({
        date: '09/31/2026',
        time: '1548',
        sex: '=',
        age: 'dd',
        ethnicities: ['Mi'],
      })
    );
    assert.deepEqual(warnings, [
      'date "09/31/2026" is not a valid MM/DD/YYYY date',
      'time "1548" is not HH:MM',
      'sex "=" is not M or F',
      'age "dd" is not a whole number from 18 to 122',
      `ethnicity "Mi" isn't one of HPD's categories`,
    ]);
  });

  it('flags ages outside 18 to 122', () => {
    assert.equal(findWarnings(parsedRecord({ age: '5' })).length, 1);
    assert.equal(findWarnings(parsedRecord({ age: '123' })).length, 1);
    assert.equal(findWarnings(parsedRecord({ age: '122' })).length, 0);
  });

  it('flags a bad report number or release time, but not a blank release', () => {
    const offense = parsedRecord().offenses[0];
    const withOffense = (changes) => findWarnings(parsedRecord({ offenses: [{ ...offense, ...changes }] }));

    assert.deepEqual(withOffense({ reportNumber: 'Z6000000-001' }), [
      'offense 1 report number "Z6000000-001" is not the NNNNNNNN-NNN format',
    ]);
    assert.deepEqual(withOffense({ releaseDateTime: '09/26/2026' }), [
      'offense 1 release "09/26/2026" is not MM/DD/YYYY HH:MM',
    ]);
    assert.deepEqual(withOffense({ releaseDateTime: '' }), []);
  });

  it('flags a record with no ethnicity or no offenses', () => {
    assert.deepEqual(findWarnings(parsedRecord({ ethnicities: [], offenses: [] })), [
      'no ethnicity was read',
      'no offenses were detected',
    ]);
  });
});

describe('toRecordFields', () => {
  it('turns printed text into typed fields', () => {
    const { dedupeKey, fields } = toRecordFields(parsedRecord());
    assert.equal(fields.arrestedAt.toISOString(), '2026-09-27T01:48:00.000Z');
    assert.equal(fields.sex, 'M');
    assert.equal(fields.age, 32);
    assert.equal(fields.offenses[0].releasedAt.toISOString(), '2026-09-27T02:30:00.000Z');
    assert.equal(dedupeKey, '2026-09-27T01:48:00.000Z|26000000|M|32');
  });

  it('gives the same key to the same arrest read from two overlapping logs', () => {
    const offense = parsedRecord().offenses[0];
    // Names are left out of the key: a cut-off name picks up different OCR noise in each log
    const earlier = toRecordFields(parsedRecord({ name: 'DOE, JANE?' }));
    // The later log lists a second charge first; the lowest report number still names the incident
    const later = toRecordFields(
      parsedRecord({ name: 'DOE, JANET', offenses: [{ ...offense, reportNumber: '26000000-002' }, offense] })
    );
    assert.equal(later.dedupeKey, earlier.dedupeKey);
  });

  it('gives a different arrest a different key', () => {
    const first = toRecordFields(parsedRecord());
    assert.notEqual(toRecordFields(parsedRecord({ time: '15:49' })).dedupeKey, first.dedupeKey);
    assert.notEqual(toRecordFields(parsedRecord({ age: '33' })).dedupeKey, first.dedupeKey);
  });

  it('leaves out an unreadable sex or age, and marks it in the key', () => {
    const { dedupeKey, fields } = toRecordFields(parsedRecord({ sex: '=', age: 'dd' }));
    assert.equal(fields.sex, undefined);
    assert.equal(fields.age, undefined);
    assert.equal(dedupeKey, '2026-09-27T01:48:00.000Z|26000000|?|?');
  });

  it('keeps a release printed before the arrest, with a warning', () => {
    const offense = { ...parsedRecord().offenses[0], releaseDateTime: '09/26/2026 09:00' };
    const { fields } = toRecordFields(parsedRecord({ offenses: [offense] }));
    assert.equal(fields.offenses[0].releasedAt.toISOString(), '2026-09-26T19:00:00.000Z');
    assert.deepEqual(fields.warnings, ['offense 26000000-001 shows a release time before the arrest time']);
  });

  it("skips a record whose arrest time or report number can't be read", () => {
    assert.match(toRecordFields(parsedRecord({ time: '15-48' })).skipReason, /could not be read/);
    const offense = { ...parsedRecord().offenses[0], reportNumber: '2600OOOO-001' };
    assert.equal(toRecordFields(parsedRecord({ offenses: [offense] })).skipReason, 'no report number could be read');
  });
});

// A white image with dark columns at the given [left, right] ranges, like a line of text
const imageWithInk = (width, height, inkedColumns, shade = 0) => {
  const pixels = Buffer.alloc(width * height * 3, 255);
  inkedColumns.forEach(([left, right]) => {
    for (let y = 0; y < height; y += 1) {
      for (let x = left; x <= right; x += 1) pixels.fill(shade, (y * width + x) * 3, (y * width + x) * 3 + 3);
    }
  });
  return { width, height, pixels };
};

const wholeLine = (width, height) => ({ top: 0, bottom: height, left: 0, right: width });

describe('findInkRuns and groupIntoWords', () => {
  it('finds each character in "M / 44", so the age can start after the slash', () => {
    // M, the slash, then two digits one blank column apart
    const image = imageWithInk(60, 10, [[5, 12], [18, 21], [26, 31], [33, 38]]);
    const runs = findInkRuns(image, wholeLine(60, 10), 0, 10);
    assert.deepEqual(runs, [
      { left: 5, right: 12 },
      { left: 18, right: 21 },
      { left: 26, right: 31 },
      { left: 33, right: 38 },
    ]);
    const [, slash] = runs;
    assert.equal(slash.right, 21); // parseArrestLog starts the age box just past this
  });

  it('splits "RBL / 500" into code, slash, and amount', () => {
    // Letters 1 column apart, 6-column gaps around a 4-column slash, digits 1 column apart
    const image = imageWithInk(70, 10, [[0, 6], [8, 14], [16, 21], [28, 31], [38, 43], [45, 50], [52, 57]]);
    const words = groupIntoWords(findInkRuns(image, wholeLine(70, 10), 0, 10), wordGap);
    assert.deepEqual(words, [
      { left: 0, right: 21 },
      { left: 28, right: 31 },
      { left: 38, right: 57 },
    ]);
    assert.ok(words[1].right - words[1].left < slashMaxWidth, 'the middle word is narrow enough to be the slash');
  });

  it('ignores light gray and anything below the record', () => {
    assert.deepEqual(findInkRuns(imageWithInk(20, 10, [[4, 6]], 230), wholeLine(20, 10), 0, 10), []);
    assert.deepEqual(findInkRuns(imageWithInk(20, 10, [[4, 6]]), wholeLine(20, 10), 0, 0), []);
  });

  it('closes a run that reaches the end of the line', () => {
    assert.deepEqual(findInkRuns(imageWithInk(20, 10, [[15, 19]]), wholeLine(20, 10), 0, 10), [{ left: 15, right: 19 }]);
  });
});
