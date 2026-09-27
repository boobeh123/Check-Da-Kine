// Spots data that should have been refreshed by now, for the out-of-date notice on a page.

const msPerHour = 60 * 60 * 1000;

// "9 hours ago", or "3 days ago" once it's been two days
const formatHoursAgo = (hours) => {
  if (hours < 48) return `${hours} ${hours === 1 ? 'hour' : 'hours'} ago`;
  return `${Math.floor(hours / 24)} days ago`;
};

// { ago: '9 hours ago' } once lastUpdate is more than maxHours old, or null while it's fresh.
// now can be set so tests don't depend on the clock.
const findStaleness = (lastUpdate, maxHours, now = new Date()) => {
  const elapsed = now - lastUpdate;
  if (elapsed <= maxHours * msPerHour) return null;
  return { ago: formatHoursAgo(Math.floor(elapsed / msPerHour)) };
};

module.exports = { findStaleness };
