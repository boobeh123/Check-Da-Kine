// Cuts rendered pages into one tall strip of records, then finds where each
// record and offense starts. Ported from scrape/main.py and scrape/utils/imgs.py.
// Images are { width, height, pixels } with 3 bytes (RGB) per pixel.

const {
  pageCrops,
  recordStartScan,
  offenseStartScan,
  startPadding,
  inkThreshold,
} = require('./layoutConstants');

const channels = 3;

// Returns the rows from top (inclusive) to bottom (exclusive) as a new image
const cropRows = (image, top, bottom) => {
  const rowLength = image.width * channels;
  return {
    width: image.width,
    height: bottom - top,
    pixels: image.pixels.subarray(top * rowLength, bottom * rowLength),
  };
};

// Stacks images of equal width top to bottom
const stackImages = (images) => {
  const { width } = images[0];

  if (images.some((image) => image.width !== width)) {
    throw new Error('Pages have different widths and cannot be stacked');
  }

  return {
    width,
    height: images.reduce((total, image) => total + image.height, 0),
    pixels: Buffer.concat(images.map((image) => image.pixels)),
  };
};

// Same test as the Python scraper: no channel is pure white
const isDarkPixel = (image, x, y) => {
  const offset = (y * image.width + x) * channels;
  const [red, green, blue] = image.pixels.subarray(offset, offset + channels);
  return red !== 255 && green !== 255 && blue !== 255;
};

// Scans column x from startY to endY and returns the y of each start line
const findStartLines = (image, { x, startY, skipAfterHit }, endY) => {
  const startLines = [];
  let y = startY;

  while (y < endY) {
    if (isDarkPixel(image, x, y)) {
      startLines.push(y);
      y += skipAfterHit;
    } else {
      y += 1;
    }
  }

  return startLines;
};

// Turns start lines into { top, bottom } regions ending where the next one begins
const toRegions = (startLines, regionTop, regionBottom) =>
  startLines.map((startLine, index) => {
    const nextStart = startLines[index + 1];
    return {
      top: Math.max(regionTop, startLine - startPadding),
      bottom: nextStart === undefined ? regionBottom : nextStart - startPadding,
    };
  });

// Removes each page's header and footer and stacks what's left into one strip,
// so a record that runs across a page break stays in one piece
const buildRecordStrip = (pages) => {
  const croppedPages = pages.map((page, index) => {
    const crop = index === 0 ? pageCrops.firstPage : pageCrops.otherPages;
    return cropRows(page, crop.top, page.height - crop.bottom);
  });
  return stackImages(croppedPages);
};

// Returns each record's { top, bottom, offenses: [{ top, bottom }] } in strip coordinates
const segmentRecords = (strip) => {
  const recordStarts = findStartLines(strip, recordStartScan, strip.height);
  const records = toRegions(recordStarts, 0, strip.height);

  return records.map((record) => {
    // The Python scraper scanned for offenses from 20px into each cropped record
    const offenseScan = { ...offenseStartScan, startY: record.top + offenseStartScan.startY };
    const offenseStarts = findStartLines(strip, offenseScan, record.bottom);
    return { ...record, offenses: toRegions(offenseStarts, record.top, record.bottom) };
  });
};

const hasInk = (image, x, top, bottom) => {
  for (let y = top; y < bottom; y += 1) {
    if (image.pixels[(y * image.width + x) * channels] < inkThreshold) return true;
  }
  return false;
};

// Finds each stretch of columns with ink in a line of text: roughly one per character.
// line is a box relative to originTop, the same shape as the field boxes.
// Returns [{ left, right }] in strip coordinates, left to right.
const findInkRuns = (image, line, originTop, limitBottom) => {
  const top = originTop + line.top;
  const bottom = Math.min(originTop + line.bottom, limitBottom, image.height);
  const runs = [];
  let runStart = null;

  for (let x = line.left; x < line.right; x += 1) {
    const inked = hasInk(image, x, top, bottom);
    if (inked && runStart === null) runStart = x;
    if (!inked && runStart !== null) {
      runs.push({ left: runStart, right: x - 1 });
      runStart = null;
    }
  }
  if (runStart !== null) runs.push({ left: runStart, right: line.right - 1 });

  return runs;
};

// Joins runs closer than minGap blank columns into words
const groupIntoWords = (runs, minGap) =>
  runs.reduce((words, run) => {
    const lastWord = words[words.length - 1];
    if (lastWord && run.left - lastWord.right - 1 < minGap) {
      lastWord.right = run.right;
    } else {
      words.push({ ...run });
    }
    return words;
  }, []);

module.exports = { buildRecordStrip, segmentRecords, findInkRuns, groupIntoWords };
