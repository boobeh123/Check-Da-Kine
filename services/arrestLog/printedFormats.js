// Formats HPD prints in its arrest logs, and turning them into real dates.

const datePattern = /^(\d{2})\/(\d{2})\/(\d{4})$/; // MM/DD/YYYY
const timePattern = /^([01]\d|2[0-3]):[0-5]\d$/; // 24-hour HH:MM
const reportNumberPattern = /^\d+-\d{3}$/; // e.g. 21548557-001

const isRealDate = (text) => {
  const match = datePattern.exec(text);
  if (!match) return false;

  const [, month, day, year] = match.map(Number);
  const date = new Date(year, month - 1, day);
  return date.getMonth() === month - 1 && date.getDate() === day;
};

// Splits "MM/DD/YYYY HH:MM" into { date, time }, or returns null if it isn't that format
const splitDateTime = (text) => {
  const [date, time, ...extra] = text.split(' ').filter((part) => part !== '');
  return isRealDate(date) && timePattern.test(time) && extra.length === 0 ? { date, time } : null;
};

// HPD prints Hawaii time, which is UTC-10 all year (Hawaii has no daylight saving time)
const toHawaiiDate = (date, time) => {
  if (!isRealDate(date) || !timePattern.test(time)) return null;

  const [month, day, year] = date.split('/');
  return new Date(`${year}-${month}-${day}T${time}:00-10:00`);
};

module.exports = {
  timePattern,
  reportNumberPattern,
  isRealDate,
  splitDateTime,
  toHawaiiDate,
};
