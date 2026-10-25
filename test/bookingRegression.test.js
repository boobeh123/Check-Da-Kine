// Reads the real Big Island booking logs in samplePdfs/bigIsland/ and checks that every one
// adds up to the totals it prints. The logs hold real names, so they're gitignored, this test
// skips itself without them, and it only ever compares counts. To add logs, save PDFs from
// https://www.hawaiipolice.gov/news-and-media/booking-logs/ there, with dashes for spaces.
const fs = require('node:fs');
const path = require('node:path');
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { readPdfText } = require('../services/pdfText');
const { parseBookingLog } = require('../services/bigIsland/parseBookingLog');
const { toBookingFields } = require('../services/bigIsland/toBookingFields');

const sampleDir = path.join(__dirname, '..', 'samplePdfs', 'bigIsland');
const samples = fs.existsSync(sampleDir) ? fs.readdirSync(sampleDir).filter((file) => file.endsWith('.pdf')) : [];

describe('Big Island booking logs', { skip: samples.length === 0 && 'no booking logs in samplePdfs/bigIsland/' }, () => {
  samples.forEach((pdf) => {
    it(`reads ${pdf} to the totals it prints, saving every booking`, async () => {
      const { bookings, errors } = parseBookingLog(await readPdfText(fs.readFileSync(path.join(sampleDir, pdf))));
      assert.deepEqual(errors, []);
      assert.ok(bookings.length > 0, 'no bookings found');
      assert.equal(bookings.filter((booking) => toBookingFields(booking).skipReason).length, 0, 'bookings skipped');
    });
  });
});
