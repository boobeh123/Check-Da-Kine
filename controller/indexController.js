const { validationResult, matchedData } = require('express-validator');
const { agencies, islandList } = require('../services/agencies');
const { getDashboard } = require('../services/dashboard/getDashboard');
const { getLatestNews } = require('../services/news/getLatestNews');
const { getLatestPosts } = require('../services/news/getLatestPosts');

// An island's stats page: Oʻahu's at /, and the others at their own paths (req.agency, set by
// middleware/agency.js)
exports.getHome = async (req, res) => {
  const agency = req.agency ?? agencies.oahu;
  const result = validationResult(req);
  const errors = result.array().map((error) => error.msg);

  // A bad range is reported on the page itself, which falls back to the default range.
  // Flashing it would save a session for the visitor, and visitors get none until they
  // log in (see server.js).
  const { start, end } = result.isEmpty() ? matchedData(req) : {};
  // HPD's news and X posts are the latest, whatever date range is chosen. They're Oʻahu's.
  const [dashboard, news, xPosts] = await Promise.all([
    getDashboard({ start, end, agency }),
    agency.hasNews ? getLatestNews() : null,
    agency.hasNews ? getLatestPosts() : null,
  ]);

  res.status(errors.length > 0 ? 400 : 200).render('homeView', {
    title: agency.copy.statsTitle,
    description: agency.copy.statsDescription,
    scripts: ['/js/dashboardCharts.js'],
    errors,
    news,
    xPosts,
    agency,
    islands: islandList,
    ...dashboard,
  });
};
