// Finds the booking logs the Hawaiʻi Police Department lists for the Big Island, and downloads
// them. The listing keeps only about 8 days of logs, one a day.

const cheerio = require('cheerio');
const { userAgent } = require('../userAgent');

const listingUrl = 'https://www.hawaiipolice.gov/news-and-media/booking-logs/';
const hostname = 'www.hawaiipolice.gov';
const requestTimeoutMs = 60 * 1000;

// Named for when the log was printed, in Hawaii time:
// "Media Booking Report_2026-10-24-05-58-36.pdf" -> year, month, day, hour, minute, second
const fileNamePattern = /^Media Booking Report_(\d{4})-(\d{2})-(\d{2})-(\d{2})-(\d{2})-(\d{2})\.pdf$/;

const fetchFromHcpd = async (url) => {
  const response = await fetch(url, { headers: { 'User-Agent': userAgent }, signal: AbortSignal.timeout(requestTimeoutMs) });
  if (!response.ok) throw new Error(`The Hawaiʻi Police Department's site returned ${response.status} for ${url}`);
  return response;
};

// A link from the listing -> { fileName, sourceUrl, publishedAt }, or null if it isn't a booking
// log on the department's own site. The printed name has spaces, so the stored name uses
// dashes ("Media-Booking-Report_2026-10-24-05-58-36.pdf"), which also suits Cloudinary.
const toListedLog = (href) => {
  if (!URL.canParse(href, listingUrl)) return null;

  const url = new URL(href, listingUrl);
  if (url.protocol !== 'https:' || url.hostname !== hostname) return null;

  const printedName = decodeURIComponent(url.pathname.split('/').pop());
  const match = fileNamePattern.exec(printedName);
  if (!match) return null;

  const [, year, month, day, hour, minute, second] = match;
  return {
    fileName: printedName.replace(/ /g, '-'),
    sourceUrl: url.href,
    publishedAt: new Date(`${year}-${month}-${day}T${hour}:${minute}:${second}-10:00`),
  };
};

// The listing page's HTML -> every booking log it links, oldest first
const parseLogList = (html) => {
  const $ = cheerio.load(html);
  const logs = $('a[href]')
    .toArray()
    .map((link) => toListedLog($(link).attr('href')))
    .filter((log) => log !== null);

  // The same log can be linked more than once
  return [...new Map(logs.map((log) => [log.fileName, log])).values()].sort((first, second) => first.publishedAt - second.publishedAt);
};

const fetchLogList = async () => {
  const logs = parseLogList(await (await fetchFromHcpd(listingUrl)).text());
  if (logs.length === 0) throw new Error("No booking logs found on the Big Island listing page; its layout may have changed");
  return logs;
};

const downloadPdf = async (url) => {
  const pdf = Buffer.from(await (await fetchFromHcpd(url)).arrayBuffer());

  // Every PDF starts with "%PDF-"; anything else is an error page served as a success
  if (pdf.subarray(0, 5).toString() !== '%PDF-') throw new Error(`${url} did not return a PDF`);
  return pdf;
};

module.exports = { fetchLogList, parseLogList, downloadPdf, listingUrl };
