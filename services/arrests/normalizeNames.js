// Folds OCR variants of the same printed name into one, so the dashboard counts one officer
// once and the Arrests filters list each charge and officer once.

// OCR leaves stray characters where a long name was cut off ("HOOPILIKEAN!"), so drop
// trailing non-letters to let those variants count as one officer
const normalizeOfficer = (name) =>
  (name ?? '')
    .toUpperCase()
    .replace(/[^A-Z]+$/, '') // trailing characters that aren't letters
    .replace(/\s+/g, ' ') // runs of spaces
    .trim();

// Charges end in a degree or number ("THEFT 4") or a closing bracket, so only stray
// punctuation from the column edges is dropped ("THEFT 4.", "|ASSAULT 3")
const normalizeCharge = (name) =>
  (name ?? '')
    .toUpperCase()
    .replace(/\s+/g, ' ') // runs of spaces
    .replace(/^[^A-Z0-9(]+|[^A-Z0-9)]+$/g, '') // stray characters at either end
    .trim();

module.exports = { normalizeOfficer, normalizeCharge };
