// Shapes counts into rows for the bar charts (views/partials/barList.ejs).

// Adds each row's share of the largest count (0–100), which sets its bar length
const withShares = (rows) => {
  const largest = Math.max(0, ...rows.map((row) => row.count));
  return rows.map((row) => ({
    ...row,
    share: largest > 0 ? Number(((row.count / largest) * 100).toFixed(1)) : 0,
  }));
};

// counts: [{ _id: label, count }] from a MongoDB $group. Returns rows largest first, with
// everything after the top `shown` folded into one "All others (n)" row.
const toTopRows = (counts, shown) => {
  const sorted = counts
    .map((row) => ({ label: row._id ?? 'Not listed', count: row.count }))
    .sort((first, second) => second.count - first.count || first.label.localeCompare(second.label));

  // Folding a single leftover row would only rename it
  if (sorted.length <= shown + 1) return withShares(sorted);

  const rest = sorted.slice(shown);
  const restCount = rest.reduce((sum, row) => sum + row.count, 0);
  return withShares([...sorted.slice(0, shown), { label: `All others (${rest.length})`, count: restCount }]);
};

module.exports = { withShares, toTopRows };
