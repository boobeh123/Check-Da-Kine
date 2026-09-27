// Renders each page of a PDF to raw RGB pixels with pdf.js,
// drawing onto an in-memory canvas from @napi-rs/canvas.

const { createCanvas } = require('@napi-rs/canvas');

let pdfjsPromise;

// pdf.js is an ES module, so CommonJS code loads it with a dynamic import.
// The legacy build is the one pdf.js recommends for Node.
const loadPdfjs = () => {
  pdfjsPromise ??= import('pdfjs-dist/legacy/build/pdf.mjs');
  return pdfjsPromise;
};

// Canvas pixels are RGBA; the rest of the pipeline expects RGB, so drop the alpha byte
const toRgb = (rgba, width, height) => {
  const pixelCount = width * height;
  const pixels = Buffer.alloc(pixelCount * 3);

  for (let i = 0; i < pixelCount; i += 1) {
    pixels[i * 3] = rgba[i * 4];
    pixels[i * 3 + 1] = rgba[i * 4 + 1];
    pixels[i * 3 + 2] = rgba[i * 4 + 2];
  }

  return pixels;
};

// Returns one { width, height, pixels } image per page
const renderPages = async (pdfBuffer, scale) => {
  const pdfjs = await loadPdfjs();

  // isEvalSupported: false stops pdf.js from compiling code found in a PDF,
  // which hardens it against malicious files
  const loadingTask = pdfjs.getDocument({
    data: new Uint8Array(pdfBuffer),
    isEvalSupported: false,
  });
  const pages = [];

  try {
    const pdf = await loadingTask.promise;

    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
      const page = await pdf.getPage(pageNumber);
      const viewport = page.getViewport({ scale });
      const width = Math.floor(viewport.width);
      const height = Math.floor(viewport.height);
      const canvas = createCanvas(width, height);

      await page.render({ canvas, viewport }).promise;

      const { data } = canvas.getContext('2d').getImageData(0, 0, width, height);
      pages.push({ width, height, pixels: toRgb(data, width, height) });
      page.cleanup();
    }
  } finally {
    // Frees the document and its worker; pdf.js 6 does this on the loading task
    await loadingTask.destroy();
  }

  return pages;
};

module.exports = { renderPages };
