// Cuts rendered pages into one tall strip of records, then finds where each
// record and offense starts. Ported from scrape/main.py and scrape/utils/imgs.py.
// Images are { width, height, pixels } with 3 bytes (RGB) per pixel.

const {
  pageCrops,
  recordStartScan,
  offenseStartScan,
  startPadding,
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

module.exports = { buildRecordStrip, segmentRecords };
