// Broader groups for the ethnicities HPD prints, used by the officer breakdown.
// The order is fixed: it sets each group's chart color and breaks ties.
const ethnicityGroups = [
  {
    key: 'pacificIslander',
    label: 'Hawaiian or Pacific Islander',
    colorClass: 'seriesPacificIslander',
    members: ['Hawaiian', 'Samoan', 'Tongan', 'Micronesian'],
  },
  { key: 'white', label: 'White', colorClass: 'seriesWhite', members: ['White'] },
  {
    key: 'asian',
    label: 'Asian',
    colorClass: 'seriesAsian',
    members: ['Filipino', 'Japanese', 'Chinese', 'Korean', 'Vietnamese', 'Laotian', 'Thai', 'Indian'],
  },
  { key: 'black', label: 'Black', colorClass: 'seriesBlack', members: ['Black'] },
  { key: 'hispanic', label: 'Hispanic', colorClass: 'seriesHispanic', members: ['Hispanic'] },
  { key: 'nativeAmerican', label: 'Native American', colorClass: 'seriesNativeAmerican', members: ['Native American'] },
  // Everything else, including "Other", "Unknown", and misreads the parser couldn't correct
  { key: 'other', label: 'Other or unknown', colorClass: 'seriesOther', members: [] },
];

const otherGroup = ethnicityGroups[ethnicityGroups.length - 1];

const toEthnicityGroup = (ethnicity) =>
  ethnicityGroups.find((group) => group.members.includes(ethnicity)) ?? otherGroup;

module.exports = { ethnicityGroups, toEthnicityGroup };
