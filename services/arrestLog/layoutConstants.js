// Pixel positions in HPD's arrest-log PDFs, rendered at 2x (1584px wide).
// Ported from the Python scraper:
//   scrape/main.py         - header and footer crops per page
//   scrape/utils/imgs.py   - start-line scans for records and offenses
//   scrape/utils/parse.py  - field boxes

const renderScale = 2;
const recordWidth = 1584;

// Rows cut from the top and bottom of each page before the pages are stacked
const pageCrops = {
  firstPage: { top: 270, bottom: 100 },
  otherPages: { top: 160, bottom: 90 },
};

// A record or offense starts on the first row with a dark pixel in column x.
// After a hit, the scan jumps ahead so the same line of text isn't counted twice.
const recordStartScan = { x: 45, startY: 0, skipAfterHit: 40 };
const offenseStartScan = { x: 460, startY: 20, skipAfterHit: 40 };

// Records and offenses are cropped this many pixels above their start line
const startPadding = 5;

// Field boxes relative to the top of a record
const recordFields = {
  date: { top: 0, bottom: 25, left: 40, right: recordWidth - 1450 },
  time: { top: 25, bottom: 50, left: 40, right: recordWidth - 1450 },
  ethnicities: { top: 0, bottom: 25, left: 145, right: recordWidth - 1313 },
  // Wider than the letter alone (the Python box ended at x=165) so it also takes in the
  // "/" after it. Tesseract misreads a lone letter ("F" came back as "="), but reads it
  // reliably with the slash beside it. parseArrestLog keeps only the letter.
  sex: { top: 25, bottom: 50, left: 145, right: recordWidth - 1409 },
  name: { top: 0, bottom: 25, left: 270, right: recordWidth - 850 },
};

// The age sits after the slash in "M / 44", and where it starts depends on the letter:
// "F" is narrower than "M". A fixed box (the Python one started at x=177) cut off the
// first digit of women's ages, turning 65 into 55. So the slash is found by scanning
// this line, and the age box starts just after it. Measured across 784 records, the slash
// ends at x=173 (M) or x=169 (F) and the age starts 6 pixels later.
const sexAgeLine = { top: 25, bottom: 50, left: 140, right: 262 };
const ageAfterSlash = 3; // Blank columns to skip after the slash
const ageRight = 230; // Room for three digits (HPD prints 125 for some unidentified people)

// Anything darker than this counts as ink when scanning for gaps
const inkThreshold = 200;

// Release info prints as "RBL / 500". Across 1,046 lines, the gaps beside the slash were
// at least 5 pixels and gaps inside a word at most 4, so a 5-pixel gap separates words.
const releaseInfoLine = { top: 25, bottom: 50, left: 1265, right: recordWidth };
const wordGap = 5;
const slashMaxWidth = 8; // The slash is 5 pixels wide; letters and numbers are wider

// Field boxes relative to the top of an offense (a record can have several)
const offenseFields = {
  reportNumber: { top: 0, bottom: 25, left: 450, right: recordWidth - 1000 },
  offenseName: { top: 0, bottom: 25, left: 584, right: recordWidth - 770 },
  statute: { top: 25, bottom: 50, left: 584, right: recordWidth - 770 },
  location: { top: 0, bottom: 25, left: 825, right: recordWidth - 315 },
  officer: { top: 25, bottom: 50, left: 825, right: recordWidth - 315 },
  courtInfo: { top: 50, bottom: 75, left: 825, right: recordWidth - 315 },
  // The "Rel-Date/Time / How-Rel" column, which the Python scraper never read.
  // Overflow from the officer column ends by x=1258 and this column's text starts
  // at x=1273, so starting at 1265 takes in the column without the overflow.
  // Release info, the line below, is read separately (see releaseInfoLine above)
  releaseDateTime: { top: 0, bottom: 25, left: 1265, right: recordWidth },
};

module.exports = {
  renderScale,
  recordWidth,
  pageCrops,
  recordStartScan,
  offenseStartScan,
  startPadding,
  recordFields,
  offenseFields,
  sexAgeLine,
  ageAfterSlash,
  ageRight,
  inkThreshold,
  releaseInfoLine,
  wordGap,
  slashMaxWidth,
};
