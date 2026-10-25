// Reads a PDF's text layer as positioned pieces, for logs printed as real text (the Big Island's
// booking logs). Oʻahu's arrest logs have no usable text, so they're rendered and read with OCR
// instead (arrestLog/renderPages.js).

let pdfjsPromise;

// pdf.js is an ES module, so CommonJS code loads it with a dynamic import, as renderPages.js does.
// The legacy build is the one pdf.js recommends for Node.
const loadPdfjs = () => {
  pdfjsPromise ??= import('pdfjs-dist/legacy/build/pdf.mjs');
  return pdfjsPromise;
};

// Returns [{ page, x, y, s }] for every non-blank piece of text: x and y are PDF points from the
// page's bottom-left corner, rounded, and s is the trimmed text
const readPdfText = async (pdfBuffer) => {
  const pdfjs = await loadPdfjs();

  // isEvalSupported: false stops pdf.js from compiling code found in a PDF
  const loadingTask = pdfjs.getDocument({ data: new Uint8Array(pdfBuffer), isEvalSupported: false, verbosity: 0 });
  const items = [];

  try {
    const pdf = await loadingTask.promise;
    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
      const page = await pdf.getPage(pageNumber);
      const { items: pieces } = await page.getTextContent();
      pieces
        .filter((piece) => piece.str.trim() !== '')
        .forEach((piece) => {
          items.push({ page: pageNumber, x: Math.round(piece.transform[4]), y: Math.round(piece.transform[5]), s: piece.str.trim() });
        });
      page.cleanup();
    }
  } finally {
    await loadingTask.destroy();
  }

  return items;
};

module.exports = { readPdfText };
