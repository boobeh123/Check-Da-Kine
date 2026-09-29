// The Arrests filters: merging OCR variants of a name into one dropdown option, turning the
// chosen filters into the database query and the paging links, and keeping guests from
// filtering by officer.
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { normalizeCharge, normalizeOfficer } = require('../services/arrests/normalizeNames');
const { toOptions, resolveFilters } = require('../services/arrests/filterOptions');
const { buildFilter, toHref } = require('../services/arrests/listArrests');

// Made-up names; ids are short stand-ins for arrest ids
const chargeGroups = [
  { _id: 'THEFT 4', arrests: ['a', 'b'] },
  { _id: 'THEFT 4.', arrests: ['b', 'c'] },
  { _id: 'ASSAULT 3', arrests: ['d'] },
  { _id: null, arrests: ['e'] },
];

describe('normalizeCharge and normalizeOfficer', () => {
  it('fold OCR variants of a charge into one name', () => {
    assert.equal(normalizeCharge('THEFT 4.'), 'THEFT 4');
    assert.equal(normalizeCharge('|ASSAULT  3'), 'ASSAULT 3');
    assert.equal(normalizeCharge('crim contmp crt'), 'CRIM CONTMP CRT');
    assert.equal(normalizeCharge('ABUSE FAM/HOUSEHOLD (DV)'), 'ABUSE FAM/HOUSEHOLD (DV)');
    assert.equal(normalizeCharge(null), '');
  });

  it('fold a cut-off officer name into the same one', () => {
    assert.equal(normalizeOfficer('OFFICERNAMEEXAMPL!'), 'OFFICERNAMEEXAMPL');
    assert.equal(normalizeOfficer('doe,  j'), 'DOE, J');
  });
});

describe('toOptions', () => {
  it('lists each name once, A to Z, counting arrests rather than charges', () => {
    assert.deepEqual(toOptions(chargeGroups, normalizeCharge), [
      { value: 'ASSAULT 3', label: 'ASSAULT 3 (1)', count: 1, variants: ['ASSAULT 3'] },
      { value: 'THEFT 4', label: 'THEFT 4 (3)', count: 3, variants: ['THEFT 4', 'THEFT 4.'] },
    ]);
  });
});

describe('resolveFilters', () => {
  const options = {
    charges: toOptions(chargeGroups, normalizeCharge),
    officers: toOptions([{ _id: 'DOE, J', arrests: ['a'] }], normalizeOfficer),
  };
  const chosen = { search: '', charge: 'THEFT 4', sex: 'F', officer: 'DOE, J' };

  it('matches every printed variant of the chosen names', () => {
    const filters = resolveFilters(chosen, options, true);
    assert.deepEqual(filters.chargeVariants, ['THEFT 4', 'THEFT 4.']);
    assert.deepEqual(filters.officerVariants, ['DOE, J']);
  });

  it("matches nothing for a name that isn't on record, instead of ignoring the filter", () => {
    assert.deepEqual(resolveFilters({ ...chosen, charge: 'NOT A CHARGE' }, options, true).chargeVariants, []);
  });

  it("drops a guest's officer filter entirely", () => {
    const filters = resolveFilters(chosen, { charges: options.charges, officers: null }, false);
    assert.equal(filters.officer, '');
    assert.equal(filters.officerVariants, null);
  });

  it('leaves out filters that were not chosen', () => {
    const filters = resolveFilters({ search: '', charge: '', sex: '', officer: '' }, options, true);
    assert.equal(filters.chargeVariants, null);
    assert.equal(filters.officerVariants, null);
  });
});

describe('buildFilter', () => {
  it('matches every arrest when nothing is chosen', () => {
    assert.deepEqual(buildFilter({}), {});
  });

  it('combines the search, sex, and filters, with charge and officer on the same charge', () => {
    const filter = buildFilter({
      search: 'kalakaua',
      sex: 'F',
      chargeVariants: ['THEFT 4', 'THEFT 4.'],
      officerVariants: ['DOE, J'],
    });
    assert.deepEqual(JSON.parse(JSON.stringify(filter)), {
      $text: { $search: '"KALAKAUA"' },
      sex: 'F',
      offenses: { $elemMatch: { offenseName: { $in: ['THEFT 4', 'THEFT 4.'] }, officer: { $in: ['DOE, J'] } } },
    });
  });
});

describe('toHref', () => {
  const record = { arrestedAt: new Date('2026-09-27T01:48:00.000Z'), _id: '66f5a1b2c3d4e5f6a7b8c9d0' };

  it('keeps the search and every filter in the paging links', () => {
    assert.equal(
      toHref({ search: 'kalakaua', charge: 'THEFT 4', sex: 'F', officer: '' }, record),
      '/arrests?q=kalakaua&charge=THEFT+4&sex=F&beforeTime=2026-09-27T01%3A48%3A00.000Z&beforeId=66f5a1b2c3d4e5f6a7b8c9d0'
    );
  });

  it('links to the plain feed when nothing is chosen', () => {
    assert.equal(toHref({}), '/arrests');
  });
});
