// Ethnicity cleanup: OCR misreads map back to HPD's categories, and a reading that can't be
// matched is kept as read so the record gets flagged.
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { correctEthnicities, isHpdEthnicity, cleanText } = require('../services/arrestLog/ocrFields');
const { toEthnicityGroup } = require('../services/dashboard/ethnicityGroups');

// [what OCR read, what it should become]
const expectCorrections = (pairs) => {
  pairs.forEach(([reading, expected]) => {
    assert.deepEqual(correctEthnicities(reading), [expected], `"${reading}"`);
  });
};

describe('correctEthnicities', () => {
  it('keeps exact categories, whatever the case', () => {
    expectCorrections([
      ['Hawaiian', 'Hawaiian'],
      ['hawaiian', 'Hawaiian'],
      ['Native American', 'Native American'],
    ]);
  });

  it('splits a list of ethnicities', () => {
    assert.deepEqual(correctEthnicities('White, Tongan'), ['White', 'Tongan']);
    assert.deepEqual(correctEthnicities('Hawaiian,  '), ['Hawaiian']);
    assert.deepEqual(correctEthnicities(''), []);
  });

  it('fixes the misreads the original Python scraper listed', () => {
    expectCorrections([
      ['Filipir', 'Filipino'],
      ['Sarn', 'Samoan'],
      ['Other Pac. Isl', 'Other'],
      ['Kore', 'Korean'],
      ['S', 'Unknown'],
    ]);
  });

  it('matches cut-off readings by the start of the word', () => {
    expectCorrections([
      ['Hawaii', 'Hawaiian'],
      ['Hawaiic', 'Hawaiian'],
      ['Filipii', 'Filipino'],
      ['Nati', 'Native American'],
      ['Micrones', 'Micronesian'],
      ['Viet', 'Vietnamese'],
      ['Wh', 'White'], // Two letters are enough when only one category starts with them
    ]);
  });

  it('strips stray punctuation from the column edges', () => {
    expectCorrections([
      ['Blac}', 'Black'],
      ['|Indian', 'Indian'],
      ['Haw:', 'Hawaiian'],
      ['Japane:', 'Japanese'],
    ]);
  });

  it("keeps a reading it can't match, which then fails isHpdEthnicity", () => {
    expectCorrections([
      ['Mi', 'Mi'], // Micronesian or Middle Eastern: too close to call
      ['Xyz', 'Xyz'],
    ]);
    assert.equal(isHpdEthnicity('Mi'), false);
    assert.equal(isHpdEthnicity('Micronesian'), true);
  });
});

describe('cleanText', () => {
  it('drops control characters and stray high bytes that Tesseract emits', () => {
    assert.equal(cleanText('\x0cKALAKAUA AVE\n'), 'KALAKAUA AVE');
    assert.equal(cleanText('RBL\xa0'), 'RBL');
  });
});

describe('toEthnicityGroup', () => {
  it('puts each ethnicity in its broader group for the officer chart', () => {
    assert.equal(toEthnicityGroup('Samoan').key, 'pacificIslander');
    assert.equal(toEthnicityGroup('Thai').key, 'asian');
    assert.equal(toEthnicityGroup('White').key, 'white');
  });

  it('puts Other, Unknown, and uncorrected misreads in "Other or unknown"', () => {
    assert.equal(toEthnicityGroup('Other').key, 'other');
    assert.equal(toEthnicityGroup('Unknown').key, 'other');
    assert.equal(toEthnicityGroup('Mi').key, 'other');
  });
});
