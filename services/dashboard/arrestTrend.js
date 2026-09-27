// Groups daily arrest counts into the bars of the Arrests tile's small chart: one bar per day
// for up to a month, per week for up to 31 weeks, and per month beyond that, so the bars
// never get too thin to see.

const { withShares } = require('../chartRows');
const { addDays, countDays, formatShortDay, formatMonth } = require('./hawaiiDays');

const maxBars = 31;
const daysPerWeek = 7;

const chunk = (days, size) =>
  Array.from({ length: Math.ceil(days.length / size) }, (_, index) => days.slice(index * size, (index + 1) * size));

// Days are YYYY-MM-DD, so the first 7 characters name the month
const groupByMonth = (days) =>
  days.reduce((groups, day) => {
    const current = groups[groups.length - 1];
    if (current && current[0].slice(0, 7) === day.slice(0, 7)) current.push(day);
    else groups.push([day]);
    return groups;
  }, []);

// "Sep 21–27", or "Sep 28 – Oct 4" across a month's end
const labelWeek = (days) => {
  const first = days[0];
  const last = days[days.length - 1];
  if (first === last) return formatShortDay(first);
  if (first.slice(0, 7) === last.slice(0, 7)) return `${formatShortDay(first)}–${Number(last.slice(8))}`;
  return `${formatShortDay(first)} – ${formatShortDay(last)}`;
};

const units = [
  { unit: 'day', group: (days) => days.map((day) => [day]), label: (group) => formatShortDay(group[0]) },
  { unit: 'week', group: (days) => chunk(days, daysPerWeek), label: labelWeek },
  { unit: 'month', group: groupByMonth, label: (group) => formatMonth(group[0]) },
];

// dayCounts: [{ _id: 'YYYY-MM-DD', count }] in Hawaii days. startDay and endDay (YYYY-MM-DD)
// are the days to cover; the bar that includes today is marked partial, since today's
// arrests are still coming in.
const toArrestTrend = (dayCounts, startDay, endDay, today) => {
  const countsByDay = new Map(dayCounts.map((row) => [row._id, row.count]));
  const days = Array.from({ length: countDays(startDay, endDay) }, (_, index) => addDays(startDay, index));

  // The finest unit that fits; past 31 months, the monthly bars just get thinner
  const { unit, group, label } = units.find((option) => option.group(days).length <= maxBars) ?? units[units.length - 1];

  const bars = withShares(
    group(days).map((groupDays) => ({
      label: label(groupDays),
      count: groupDays.reduce((sum, day) => sum + (countsByDay.get(day) ?? 0), 0),
      partial: groupDays.includes(today),
    }))
  );
  const busiest = bars.reduce((best, bar) => (bar.count > best.count ? bar : best), bars[0]);

  return { unit, bars, busiest };
};

module.exports = { toArrestTrend };
