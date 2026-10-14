// Shapes counts into rows for the bar charts (views/partials/barList.ejs).

// Adds each row's share of the largest count (0–100), which sets its bar length
const withShares = (rows) => {
  const largest = Math.max(0, ...rows.map((row) => row.count));
  return rows.map((row) => ({
    ...row,
    share: largest > 0 ? Number(((row.count / largest) * 100).toFixed(1)) : 0,
  }));
};

const sumCounts = (rows) => rows.reduce((sum, row) => sum + row.count, 0);

// counts: [{ _id: label, count }] from a MongoDB $group. Returns { label, count } rows,
// largest first and ties by label. MongoDB groups a missing value and a blank one ("")
// separately, but both show as one "Not listed" row.
const toRankedRows = (counts) => {
  const countsByLabel = new Map();
  counts.forEach((row) => {
    const label = row._id || 'Not listed';
    countsByLabel.set(label, (countsByLabel.get(label) ?? 0) + row.count);
  });

  return [...countsByLabel]
    .map(([label, count]) => ({ label, count }))
    .sort((first, second) => second.count - first.count || first.label.localeCompare(second.label));
};

// Rows largest first, with everything after the top `shown` folded into one "All others (n)" row
const toTopRows = (counts, shown) => {
  const sorted = toRankedRows(counts);

  // Folding a single leftover row would only rename it
  if (sorted.length <= shown + 1) return withShares(sorted);

  const rest = sorted.slice(shown);
  return withShares([...sorted.slice(0, shown), { label: `All others (${rest.length})`, count: sumCounts(rest) }]);
};

// For counts with a long tail, where an "All others" bar would dwarf every other bar. Returns
// every row largest first (for the table), bars for the top `shown` sized against the largest
// of them, and the rows left out summed up to describe under the chart: { rowCount, count,
// percent } of the whole, or null when every row has a bar.
const toTopBars = (counts, shown) => {
  const rows = toRankedRows(counts);

  // Leaving out a single row would only hide it
  const barRows = rows.length <= shown + 1 ? rows : rows.slice(0, shown);
  const leftOut = rows.slice(barRows.length);

  return {
    rows,
    bars: withShares(barRows),
    others:
      leftOut.length > 0
        ? {
            rowCount: leftOut.length,
            count: sumCounts(leftOut),
            percent: Math.round((sumCounts(leftOut) / sumCounts(rows)) * 100),
          }
        : null,
  };
};

module.exports = { withShares, toRankedRows, toTopRows, toTopBars };
