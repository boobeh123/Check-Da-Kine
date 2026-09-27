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
  age: { top: 25, bottom: 50, left: 177, right: recordWidth - 1380 },
  name: { top: 0, bottom: 25, left: 270, right: recordWidth - 850 },
};

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
  releaseDateTime: { top: 0, bottom: 25, left: 1265, right: recordWidth },
  releaseInfo: { top: 25, bottom: 50, left: 1265, right: recordWidth },
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
};
