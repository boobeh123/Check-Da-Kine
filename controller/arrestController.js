const { validationResult, matchedData } = require('express-validator');
const { listArrests } = require('../services/arrests/listArrests');
const { toSearchWords } = require('../services/arrests/searchWords');
const { getFilterOptions, resolveFilters } = require('../services/arrests/filterOptions');

const sexLabels = { M: 'Male', F: 'Female' };

exports.getArrests = async (req, res) => {
  const result = validationResult(req);
  // Both cursor fields share one message, so show each message once
  const errors = [...new Set(result.array().map((error) => error.msg))];

  // A broken link, search, or filter falls back to the newest arrests, with the message shown above them
  const { beforeTime, beforeId, q = '', charge = '', sex = '', officer = '' } = result.isEmpty() ? matchedData(req) : {};
  const cursor = beforeTime && beforeId ? { beforeTime, beforeId } : null;

  // A search with no letters or digits in it ("!!!") is no search at all
  const search = toSearchWords(q).length > 0 ? q : '';

  // Names, and filtering by officer, are for logged-in users only
  const showNames = Boolean(req.user);
  const options = await getFilterOptions({ showNames });
  const filters = resolveFilters({ search, charge, sex, officer }, options, showNames);
  const feed = await listArrests({ cursor, showNames, filters });

  // What the summary line lists, in the order the form shows them
  const activeFilters = [
    filters.charge,
    sexLabels[filters.sex],
    filters.officer && `Officer ${filters.officer}`,
    filters.search && `"${filters.search}"`,
  ].filter(Boolean);

  // A page with names must never be kept by a shared cache or shown from the back button
  // after logging out
  if (showNames) res.set('Cache-Control', 'private, no-store');

  res.status(errors.length > 0 ? 400 : 200).render('arrestsView', {
    title: 'Arrests',
    description: "Every arrest in the Honolulu Police Department's published arrest logs, newest first, with each charge, statute, and court date. Search and filter by charge, sex, location, or report number.",
    scripts: ['/js/arrestFeed.js'],
    errors,
    showNames,
    search,
    filters,
    options,
    activeFilters,
    ...feed,
  });
};
