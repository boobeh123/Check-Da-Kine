// The Arrests page's filter dropdowns: every charge on record and, for logged-in users only,
// every arresting officer, A to Z with arrest counts. OCR variants of one name ("THEFT 4",
// "THEFT 4.") become one option that matches all of them.

const ArrestRecord = require('../../model/ArrestRecord');
const { normalizeCharge, normalizeOfficer } = require('./normalizeNames');

// groups: [{ _id: printed name, arrests: [arrest ids] }] -> [{ value, label, count, variants }].
// count is arrests, not charges: an arrest listing a name twice counts once.
const toOptions = (groups, normalize) => {
  const merged = new Map();
  groups.forEach(({ _id: printed, arrests }) => {
    const name = normalize(printed);
    if (!name) return;
    const option = merged.get(name) ?? { variants: [], arrestIds: new Set() };
    option.variants.push(printed);
    arrests.forEach((id) => option.arrestIds.add(String(id)));
    merged.set(name, option);
  });

  return [...merged.entries()]
    .map(([name, { variants, arrestIds }]) => ({
      value: name,
      label: `${name} (${arrestIds.size.toLocaleString('en-US')})`,
      count: arrestIds.size,
      variants,
    }))
    .sort((first, second) => first.value.localeCompare(second.value));
};

const namesAndArrests = (field) => [{ $group: { _id: `$offenses.${field}`, arrests: { $addToSet: '$_id' } } }];

// officers is null for guests: officer names are never read for them
const getFilterOptions = async ({ showNames }) => {
  const [facets] = await ArrestRecord.aggregate([
    { $unwind: '$offenses' },
    {
      $facet: {
        charges: namesAndArrests('offenseName'),
        ...(showNames && { officers: namesAndArrests('officer') }),
      },
    },
  ]);

  return {
    charges: toOptions(facets?.charges ?? [], normalizeCharge),
    officers: showNames ? toOptions(facets?.officers ?? [], normalizeOfficer) : null,
  };
};

// chosen: { search, charge, sex, officer } from the validated query. Returns the same, plus
// the printed variants each chosen name matches. A name that isn't on record matches nothing
// ([]), and a guest's officer is dropped: filtering by officer would tie officers to arrests
// without their names ever being shown.
const resolveFilters = (chosen, options, showNames) => {
  const officer = showNames ? chosen.officer : '';
  const variantsOf = (name, list) => (name ? (list?.find((option) => option.value === name)?.variants ?? []) : null);

  return {
    ...chosen,
    officer,
    chargeVariants: variantsOf(chosen.charge, options.charges),
    officerVariants: variantsOf(officer, options.officers),
  };
};

module.exports = { getFilterOptions, resolveFilters, toOptions };
