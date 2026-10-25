const { validationResult, matchedData } = require('express-validator');
const { agencies, islandList } = require('../services/agencies');
const { listArrests } = require('../services/arrests/listArrests');
const { toSearchWords } = require('../services/arrests/searchWords');
const { getFilterOptions, resolveFilters } = require('../services/arrests/filterOptions');

const sexLabels = { M: 'Male', F: 'Female' };

// An island's Arrests page: Oʻahu's at /arrests, and the others at their own paths (req.agency,
// set by middleware/agency.js)
exports.getArrests = async (req, res) => {
  const agency = req.agency ?? agencies.oahu;
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
  const options = await getFilterOptions({ showNames, agency });
  const filters = resolveFilters({ search, charge, sex, officer }, options, showNames);
  const feed = await listArrests({ cursor, showNames, filters, agency });

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
    title: agency.copy.arrestsTitle,
    description: agency.copy.arrestsDescription,
    scripts: ['/js/arrestFeed.js'],
    agency,
    islands: islandList,
    errors,
    showNames,
    search,
    filters,
    options,
    activeFilters,
    ...feed,
  });
};
