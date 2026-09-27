// Turns what someone typed in the Arrests search box into a MongoDB text search. The input is
// only ever split into plain words; it never becomes part of a regular expression or a query
// operator.

const maxWords = 10;

// "DUI  kalakaua" -> ["DUI", "KALAKAUA"]; "708-0833" -> ["708", "0833"]
const toSearchWords = (text) =>
  (text ?? '')
    .toUpperCase()
    .split(/[^A-Z0-9]+/) // anything that isn't a letter or digit separates words
    .filter((word) => word !== '')
    .slice(0, maxWords);

// Quoting each word makes MongoDB require all of them, instead of any one
const toTextSearch = (words) => words.map((word) => `"${word}"`).join(' ');

module.exports = { toSearchWords, toTextSearch };
