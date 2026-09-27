// Finds the arrest logs HPD currently lists, and downloads them.

const cheerio = require('cheerio');
const { fetchFromHpd } = require('../hpdRequest');

const listingUrl = 'https://www.honolulupd.org/information/arrest-logs/';
const hpdHostname = 'www.honolulupd.org';

// Logs are named for when HPD published them, in Hawaii time:
// 2026-09-26-05-00-32_Arrest_Log.pdf -> year, month, day, hour, minute, second
const fileNamePattern = /^(\d{4})-(\d{2})-(\d{2})-(\d{2})-(\d{2})-(\d{2})_Arrest_Log\.pdf$/;

// Turns a link from the listing page into { fileName, sourceUrl, publishedAt }, or null
// if it isn't an arrest log on HPD's own site
const toListedLog = (href) => {
  if (!URL.canParse(href, listingUrl)) return null;

  const url = new URL(href, listingUrl);
  if (url.protocol !== 'https:' || url.hostname !== hpdHostname) return null;

  const fileName = url.pathname.split('/').pop();
  const match = fileNamePattern.exec(fileName);
  if (!match) return null;

  const [, year, month, day, hour, minute, second] = match;
  return {
    fileName,
    sourceUrl: url.href,
    publishedAt: new Date(`${year}-${month}-${day}T${hour}:${minute}:${second}-10:00`),
  };
};

// Returns every arrest log HPD currently lists, oldest first
const fetchLogList = async () => {
  const html = await (await fetchFromHpd(listingUrl)).text();
  const $ = cheerio.load(html);

  const logs = $('a[href]')
    .toArray()
    .map((link) => toListedLog($(link).attr('href')))
    .filter((log) => log !== null);

  // The same log can be linked more than once on the page
  const uniqueLogs = [...new Map(logs.map((log) => [log.fileName, log])).values()];

  if (uniqueLogs.length === 0) {
    throw new Error("No arrest logs found on HPD's listing page; its layout may have changed");
  }

  return uniqueLogs.sort((first, second) => first.publishedAt - second.publishedAt);
};

const downloadPdf = async (url) => {
  const pdf = Buffer.from(await (await fetchFromHpd(url)).arrayBuffer());

  // Every PDF starts with "%PDF-"; anything else is an error page served as a success
  if (pdf.subarray(0, 5).toString() !== '%PDF-') {
    throw new Error(`${url} did not return a PDF`);
  }

  return pdf;
};

module.exports = { fetchLogList, downloadPdf };
