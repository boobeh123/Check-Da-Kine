// Parses the sample arrest logs in samplePdfs/ and checks every field against the results
// saved beside each PDF (by `npm run parse`, after the OCR fixes were checked). The samples
// hold real names, so they're gitignored, this test skips itself without them, and a failure
// names the record and field but never prints the values. Run `npm run parse` to see them.
const fs = require('node:fs');
const path = require('node:path');
const { isDeepStrictEqual } = require('node:util');
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { parseArrestLog } = require('../services/arrestLog/parseArrestLog');

const sampleDir = path.join(__dirname, '..', 'samplePdfs');
const savedResultsFor = (pdf) => path.join(sampleDir, pdf.replace(/\.pdf$/, '.json'));
const samples = fs.existsSync(sampleDir)
  ? fs.readdirSync(sampleDir).filter((file) => file.endsWith('.pdf') && fs.existsSync(savedResultsFor(file)))
  : [];

describe('OCR regression', { skip: samples.length === 0 && 'no sample PDFs with saved results in samplePdfs/' }, () => {
  samples.forEach((pdf) => {
    it(`reads ${pdf} the same as before`, { timeout: 2 * 60 * 1000 }, async () => {
      const expected = JSON.parse(fs.readFileSync(savedResultsFor(pdf), 'utf8'));
      const records = await parseArrestLog(fs.readFileSync(path.join(sampleDir, pdf)));

      assert.equal(records.length, expected.length, 'number of arrests');
      const changed = records.flatMap((record, index) =>
        Object.keys(expected[index])
          .filter((field) => !isDeepStrictEqual(record[field], expected[index][field]))
          .map((field) => `arrest ${index + 1}: ${field}`)
      );
      assert.deepEqual(changed, [], 'fields that read differently');
    });
  });
});
