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

// Removes control characters and bytes 0x7F-0xFF that Tesseract sometimes emits, then trims
const cleanText = (text) => text.replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f-\xff]/g, '').trim();

// Splits "White, Tongan" into ["White", "Tongan"] and fixes known misreads
const correctEthnicities = (text) =>
  text
    .split(',')
    .map((ethnicity) => ethnicity.trim())
    .filter((ethnicity) => ethnicity !== '')
    .map((ethnicity) => {
      const match = Object.entries(ethnicityCorrections).find(([, misreads]) =>
        misreads.includes(ethnicity)
      );
      return match ? match[0] : ethnicity;
    });

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

// Starts one Tesseract worker and returns a reader that OCRs field boxes with it
const createFieldReader = async () => {
  fs.mkdirSync(cachePath, { recursive: true });

  const worker = await createWorker('eng', OEM.LSTM_ONLY, { cachePath });
  await worker.setParameters({ tessedit_pageseg_mode: pageSegMode, user_defined_dpi: ocrDpi });

  const readField = async (image, box, originTop, limitBottom) => {
    const crop = cropBox(image, box, originTop, limitBottom);
    if (!crop || isBlank(crop)) return '';

    const png = await sharp(crop.pixels, {
      raw: { width: crop.width, height: crop.height, channels },
    })
      .resize({ width: crop.width * ocrUpscale, kernel: 'lanczos3' })
      .png()
      .toBuffer();

    const { data } = await worker.recognize(png);
    return cleanText(data.text);
  };

  const terminate = () => worker.terminate();

  return { readField, terminate };
};

module.exports = { createFieldReader, correctEthnicities, cleanText };
