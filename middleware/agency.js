// middleware/agency.js
const { agencies } = require('../services/agencies');

// Picks the island a route serves (services/agencies.js) and puts it on req.agency for the
// controller. Routes without it are Oʻahu's.
exports.useAgency = (key) => {
  const agency = agencies[key];
  if (!agency) throw new Error(`No island called "${key}" in services/agencies.js`);

  return (req, res, next) => {
    req.agency = agency;
    next();
  };
};
