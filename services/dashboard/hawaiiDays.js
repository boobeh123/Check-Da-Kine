// Calendar days in Hawaii time, written as YYYY-MM-DD. Hawaii is UTC-10 all year
// (no daylight saving time), so a day always starts at 10:00 UTC.

const timeZone = 'Pacific/Honolulu';
const msPerDay = 24 * 60 * 60 * 1000;

// The en-CA locale formats dates as YYYY-MM-DD
const toHawaiiDay = (date) => date.toLocaleDateString('en-CA', { timeZone });

const todayInHawaii = () => toHawaiiDay(new Date());

const startOfHawaiiDay = (day) => new Date(`${day}T00:00:00-10:00`);

const addDays = (day, count) => {
  const date = new Date(`${day}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + count);
  return date.toISOString().slice(0, 10);
};

// Days from start to end, counting both
const countDays = (startDay, endDay) => Math.round((Date.parse(endDay) - Date.parse(startDay)) / msPerDay) + 1;

// "Sep 26, 2026"
const formatDay = (day) =>
  startOfHawaiiDay(day).toLocaleDateString('en-US', { timeZone, month: 'short', day: 'numeric', year: 'numeric' });

// "Sep 26, 2026, 5:00 PM HST"
const formatDateTime = (date) =>
  `${date.toLocaleString('en-US', { timeZone, dateStyle: 'medium', timeStyle: 'short' })} HST`;

// "Sep 26, 9:07 PM", for lists where the year and time zone would be noise
const formatShortDateTime = (date) =>
  date.toLocaleString('en-US', { timeZone, month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });

module.exports = {
  toHawaiiDay,
  todayInHawaii,
  startOfHawaiiDay,
  addDays,
  countDays,
  formatDay,
  formatDateTime,
  formatShortDateTime,
};
