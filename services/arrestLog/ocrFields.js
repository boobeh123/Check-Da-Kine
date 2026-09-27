// Reads text from field boxes with Tesseract, plus the text cleanup from
// scrape/utils/ocr.py. Images are { width, height, pixels } with 3 bytes (RGB) per pixel.

const fs = require('node:fs');
const path = require('node:path');
const sharp = require('sharp');
const { createWorker, OEM, PSM } = require('tesseract.js');

const channels = 3;
const cachePath = path.join(__dirname, '..', '..', 'tessdataCache');

// Field text is only ~17px tall at the 2x render. Enlarging each crop 3x before OCR
// fixed misreads in testing (e.g. "KACHIAI" -> "KAOHIAI") for about 50% more time.
const ocrUpscale = 3;

// Pages are rendered at 2x the PDF's 72 DPI, then enlarged. The PNGs carry no DPI of
// their own, so without this Tesseract guesses and prints a warning for every field.
const ocrDpi = String(72 * 2 * ocrUpscale);

// Single-character mode, as the Python scraper used. Single-line mode (7) gave identical
// results on the sample logs, and every fix so far was verified in this mode, so it stays.
const pageSegMode = PSM.SINGLE_CHAR;

// Settings for short fields with a known alphabet (ages, release codes, bail amounts).
// Single-line mode, a smaller enlargement, and a white margin around the crop: without the
// margin, Tesseract read "44" as "dd" or "4". Checked against all 784 ages in 54 logs.
const shortFieldUpscale = 2;
const shortFieldMargin = 15; // Pixels of white added on every side, after enlarging
const digitsOnly = { charset: '0123456789' };
const lettersOnly = { charset: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ' };

// OCR misreads mapped to the ethnicity they should be.
// Copied from the Python scraper, including its choice to treat stray letters as "Unknown".
const ethnicityCorrections = {
  Filipino: ['Filipi', 'Filipir', 'Filig', 'Filip', 'Filipit'],
  Hawaiian: ['Hawe', 'Haw:', 'Hawai', 'Hawaiia', 'Hawaiie', 'Hav'],
  Samoan: ['Sam', 'Samc', 'Samo:', 'San', 'Sarn', 'Sar', 'Samoar', 'Samoi', 'Sarr'],
  Hispanic: ['Hise', 'Hisp', 'Hispar', 'Hispat', 'Hispe', 'Hispani', 'Hispani:', 'Hispanir', 'Hispaniv'],
  Other: [
    'Othe', 'Othe!', 'Othe:', 'Other Pac. Isl', 'Other Pac. Isl:', 'Other P',
    'Other A', 'Other Asian', 'Other 4', 'Other P.',
  ],
  Unknown: ['S', 'K', 'F', 'H', 'C', 'Unkr', 'Unkn', 'Unknow'],
  Indian: ['|Indian', '|Indiai', 'India', 'Indiai'],
  Japanese: ['Jape', 'Jap', 'Jap:', 'Jap<', 'Japa', 'Japane:', 'Japan', 'Japai', 'Japanes'],
  'Native American': ['Native Americ', 'Native', 'Nativ', 'Native /'],
  Chinese: ['Chin', 'Chii', 'Chine', 'Chines', 'Chir'],
  Tongan: ['Ton:', 'Ton', 'Tong'],
  Micronesian: ['Mic', 'Micr', 'Micrc', 'Microne', 'Micror'],
  Laotian: ['Laotia'],
  'Middle Eastern': ['Middle Easter', 'Middle Easter:'],
  Black: ['Blac', 'Blacl'],
  Korean: ['Kor', 'Kore', 'Kore:', 'Korei'],
  White: ['Whi', 'Whi!', 'Whit', 'Whit:'],
};

// The ethnicities HPD prints, from a survey of 54 logs (784 arrests), plus Thai, which the
// original project listed. A reading that isn't one of these is kept and flagged for review.
const hpdEthnicities = [
  'White', 'Hawaiian', 'Micronesian', 'Filipino', 'Black', 'Japanese', 'Samoan', 'Hispanic',
  'Other', 'Unknown', 'Chinese', 'Korean', 'Vietnamese', 'Tongan', 'Laotian', 'Indian',
  'Native American', 'Middle Eastern', 'Thai',
];

// Removes control characters and bytes 0x7F-0xFF that Tesseract sometimes emits, then trims
const cleanText = (text) => text.replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f-\xff]/g, '').trim();

// How many letters two words share at the start, ignoring case
const sharedStart = (first, second) => {
  const a = first.toLowerCase();
  const b = second.toLowerCase();
  let length = 0;
  while (length < a.length && length < b.length && a[length] === b[length]) length += 1;
  return length;
};

// Most misreads are the right word cut short or with a wrong ending ("Hawaii", "Hawaiic",
// "Nati", "Filipii"), so match on the start of the word. The category must share at least
// 3 letters, or be the only one starting with a 2-letter reading ("Wh"), and win outright.
const matchByStart = (text) => {
  const scored = hpdEthnicities
    .map((category) => ({ category, shared: sharedStart(text, category) }))
    .sort((first, second) => second.shared - first.shared);
  const [best, runnerUp] = scored;

  const longEnough = best.shared >= 3 || (best.shared === text.length && text.length === 2);
  return longEnough && best.shared > runnerUp.shared ? best.category : null;
};

const correctEthnicity = (reading) => {
  // Stray punctuation from the column edges ("Blac}", "|Indian")
  const text = reading.replace(/^[^A-Za-z]+|[^A-Za-z]+$/g, '').replace(/\s+/g, ' ');

  const exact = hpdEthnicities.find((category) => category.toLowerCase() === text.toLowerCase());
  if (exact) return exact;

  const known = Object.entries(ethnicityCorrections).find(([, misreads]) => misreads.includes(text));
  if (known) return known[0];

  return matchByStart(text) ?? text;
};

const isHpdEthnicity = (ethnicity) => hpdEthnicities.includes(ethnicity);

// Splits "White, Tongan" into ["White", "Tongan"] and fixes misreads
const correctEthnicities = (text) =>
  text
    .split(',')
    .map((ethnicity) => ethnicity.trim())
    .filter((ethnicity) => ethnicity !== '')
    .map(correctEthnicity)
    .filter((ethnicity) => ethnicity !== '');

// Copies a box out of the strip, clamped so it never reaches past limitBottom
const cropBox = (image, box, originTop, limitBottom) => {
  const top = originTop + box.top;
  const bottom = Math.min(originTop + box.bottom, limitBottom, image.height);
  const left = box.left;
  const right = Math.min(box.right, image.width);

  if (bottom <= top || right <= left) return null;

  const width = right - left;
  const height = bottom - top;
  const rowLength = width * channels;
  const pixels = Buffer.alloc(rowLength * height);

  for (let row = 0; row < height; row += 1) {
    const sourceStart = ((top + row) * image.width + left) * channels;
    image.pixels.copy(pixels, row * rowLength, sourceStart, sourceStart + rowLength);
  }

  return { width, height, pixels };
};

// An all-white box is an empty field. Tesseract invents text like "Co" for these.
const isBlank = (crop) => crop.pixels.every((value) => value === 255);

// Enlarges a crop to a PNG; short fields also get a white margin
const toPng = async (crop, charset) => {
  const upscale = charset ? shortFieldUpscale : ocrUpscale;
  const enlarged = await sharp(crop.pixels, {
    raw: { width: crop.width, height: crop.height, channels },
  })
    .resize({ width: crop.width * upscale, kernel: 'lanczos3' })
    .png()
    .toBuffer();

  if (!charset) return enlarged;

  return sharp(enlarged)
    .extend({
      top: shortFieldMargin,
      bottom: shortFieldMargin,
      left: shortFieldMargin,
      right: shortFieldMargin,
      background: '#ffffff',
    })
    .png()
    .toBuffer();
};

// Starts one Tesseract worker and returns a reader that OCRs field boxes with it
const createFieldReader = async () => {
  fs.mkdirSync(cachePath, { recursive: true });

  const worker = await createWorker('eng', OEM.LSTM_ONLY, { cachePath });

  // options.charset limits the characters Tesseract may return (digitsOnly, lettersOnly) and
  // switches to the short-field settings. Without it, a field is read the original way.
  const readField = async (image, box, originTop, limitBottom, { charset } = {}) => {
    const crop = cropBox(image, box, originTop, limitBottom);
    if (!crop || isBlank(crop)) return '';

    // Set every time, because the previous field may have used the other settings
    await worker.setParameters({
      tessedit_pageseg_mode: charset ? PSM.SINGLE_LINE : pageSegMode,
      tessedit_char_whitelist: charset ?? '',
      user_defined_dpi: charset ? String(72 * 2 * shortFieldUpscale) : ocrDpi,
    });

    const { data } = await worker.recognize(await toPng(crop, charset));
    return cleanText(data.text);
  };

  const terminate = () => worker.terminate();

  return { readField, terminate };
};

module.exports = {
  createFieldReader,
  correctEthnicities,
  isHpdEthnicity,
  cleanText,
  digitsOnly,
  lettersOnly,
};
