// Reads HPD's active dispatch calls page. Despite the page's file name ("past 24 hours"),
// it lists only the calls that are still open.

const cheerio = require('cheerio');
const { fetchFromHpd } = require('../hpdRequest');

const dispatchPageUrl = 'https://www.honolulupd.org/wp-content/hpd/cfs/Incidents_past_24_hours.html';

const months = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

// "09/26/2026 21:07:15 PM": month, day, year, hour, minute, second. HPD prints a 24-hour
// time followed by an AM/PM that doesn't match it, so the AM/PM is ignored.
const callTimePattern = /^(\d{2})\/(\d{2})\/(\d{4}) (\d{2}):(\d{2}):(\d{2})/;

// "Data last updated on September 26, 2026 21:29:06 PM": month name, day, year, time
const updatedPattern = /Data last updated on\s+([A-Za-z]+) (\d{1,2}), (\d{4}) (\d{2}):(\d{2}):(\d{2})/;

const padded = (number) => String(number).padStart(2, '0');

// Rejects days that don't exist, like February 31 (month 0 means the name wasn't recognized)
const isRealDay = (year, month, day) => {
  const date = new Date(Date.UTC(year, month - 1, day));
  return month >= 1 && date.getUTCMonth() === month - 1 && date.getUTCDate() === Number(day);
};

// Hawaii is UTC-10 all year. Returns null for a day that doesn't exist.
const toHawaiiTime = (year, month, day, hour, minute, second) =>
  isRealDay(Number(year), Number(month), Number(day))
    ? new Date(`${year}-${padded(month)}-${padded(day)}T${hour}:${minute}:${second}-10:00`)
    : null;

// A call row has exactly five cells: received, type, address, city, district
const toCall = (cells) => {
  const match = callTimePattern.exec(cells[0]);
  if (cells.length !== 5 || !match) return null;

  const [, month, day, year, hour, minute, second] = match;
  const receivedAt = toHawaiiTime(year, month, day, hour, minute, second);
  const [, type, address, city, district] = cells;
  if (!receivedAt || !type) return null;

  return { receivedAt, type, address, city, district };
};

// Returns { updatedAt, calls, skippedRows } from the page's HTML
const parseDispatchPage = (html) => {
  const $ = cheerio.load(html);
  const cellTexts = (row) => $(row).children('td').toArray().map((cell) => $(cell).text().replace(/\s+/g, ' ').trim());

  const updatedMatch = updatedPattern.exec($('#oReportCell').text().replace(/\s+/g, ' '));
  if (!updatedMatch) throw new Error("Couldn't find the \"Data last updated on\" time; HPD's page layout may have changed");

  const [, monthName, day, year, hour, minute, second] = updatedMatch;
  const updatedAt = toHawaiiTime(year, months.indexOf(monthName) + 1, day, hour, minute, second);
  if (!updatedAt) throw new Error(`HPD's "last updated" time "${updatedMatch[0]}" isn't a real date`);

  // Five-cell rows are calls, apart from the header row and blank spacer rows
  const rows = $('#oReportCell tr')
    .toArray()
    .map(cellTexts)
    .filter((cells) => cells.length === 5 && cells[0] !== 'Call Received' && cells.some((cell) => cell !== ''));
  const calls = rows.map(toCall).filter((call) => call !== null);

  return { updatedAt, calls, skippedRows: rows.length - calls.length };
};

const fetchDispatches = async () => parseDispatchPage(await (await fetchFromHpd(dispatchPageUrl)).text());

module.exports = { fetchDispatches, parseDispatchPage, dispatchPageUrl };
