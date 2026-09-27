// Parses local arrest-log PDFs and saves each one's records as JSON next to the PDF.
// With two or more PDFs, also lists report numbers that appear in more than one.
//
// Usage: node jobs/parseLocalPdf.js <file.pdf> [more.pdf ...]

const fs = require('node:fs/promises');
const path = require('node:path');
const { parseArgs } = require('node:util');
const { parseArrestLog } = require('../services/arrestLog/parseArrestLog');

const getPdfPaths = () => {
  const { positionals } = parseArgs({ allowPositionals: true });

  if (positionals.length === 0) {
    throw new Error('Usage: node jobs/parseLocalPdf.js <file.pdf> [more.pdf ...]');
  }

  return positionals;
};

const parseOnePdf = async (pdfPath) => {
  const startedAt = Date.now();
  const records = await parseArrestLog(await fs.readFile(pdfPath));
  const seconds = ((Date.now() - startedAt) / 1000).toFixed(1);

  const { dir, name } = path.parse(pdfPath);
  const outputPath = path.join(dir, `${name}.json`);
  await fs.writeFile(outputPath, JSON.stringify(records, null, 2));

  const offenseCount = records.reduce((total, record) => total + record.offenses.length, 0);
  const flaggedCount = records.filter((record) => record.warnings.length > 0).length;

  console.log(`\n${path.basename(pdfPath)}`);
  console.log(`  records:               ${records.length}`);
  console.log(`  offenses:              ${offenseCount}`);
  console.log(`  records with warnings: ${flaggedCount}`);
  console.log(`  time:                  ${seconds}s`);
  console.log(`  saved:                 ${outputPath}`);

  return { fileName: path.basename(pdfPath), records };
};

// Report numbers that show up in more than one PDF, with the files they appear in
const findSharedReportNumbers = (results) => {
  const filesByReportNumber = new Map();

  results.forEach(({ fileName, records }) => {
    records
      .flatMap((record) => record.offenses.map((offense) => offense.reportNumber))
      .forEach((reportNumber) => {
        const files = filesByReportNumber.get(reportNumber) ?? new Set();
        files.add(fileName);
        filesByReportNumber.set(reportNumber, files);
      });
  });

  return [...filesByReportNumber].filter(([, files]) => files.size > 1);
};

const main = async () => {
  const results = [];
  for (const pdfPath of getPdfPaths()) {
    results.push(await parseOnePdf(pdfPath));
  }

  if (results.length > 1) {
    const shared = findSharedReportNumbers(results);
    console.log(`\nReport numbers found in more than one PDF: ${shared.length}`);
    shared.forEach(([reportNumber, files]) => {
      console.log(`  ${reportNumber}: ${[...files].join(', ')}`);
    });
  }
};

main().catch((err) => {
  console.error(err.message);
  process.exitCode = 1;
});
