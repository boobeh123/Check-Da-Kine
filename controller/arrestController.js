const { validationResult, matchedData } = require('express-validator');
const { listArrests } = require('../services/arrests/listArrests');
const { toSearchWords } = require('../services/arrests/searchWords');

exports.getArrests = async (req, res) => {
  const result = validationResult(req);
  // Both cursor fields share one message, so show each message once
  const errors = [...new Set(result.array().map((error) => error.msg))];

  // A broken link or search falls back to the newest arrests, with the message shown above them
  const { beforeTime, beforeId, q = '' } = result.isEmpty() ? matchedData(req) : {};
  const cursor = beforeTime && beforeId ? { beforeTime, beforeId } : null;

  // A search with no letters or digits in it ("!!!") is no search at all
  const search = toSearchWords(q).length > 0 ? q : '';

  // Names are for logged-in users only
  const showNames = Boolean(req.user);
  const feed = await listArrests({ cursor, showNames, search });

  // A page with names must never be kept by a shared cache or shown from the back button
  // after logging out
  if (showNames) res.set('Cache-Control', 'private, no-store');

  res.status(errors.length > 0 ? 400 : 200).render('arrestsView', {
    title: 'Arrests',
    description: "Every arrest in the Honolulu Police Department's published arrest logs, newest first, with each charge, statute, and court date. Search by charge, location, or report number.",
    scripts: ['/js/arrestFeed.js'],
    errors,
    showNames,
    search,
    ...feed,
  });
};
