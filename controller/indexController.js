const { validationResult, matchedData } = require('express-validator');
const { getDashboard } = require('../services/dashboard/getDashboard');
const { getLatestNews } = require('../services/news/getLatestNews');
const { getLatestPosts } = require('../services/news/getLatestPosts');

exports.getHome = async (req, res) => {
  const result = validationResult(req);
  const errors = result.array().map((error) => error.msg);

  // A bad range is reported on the page itself, which falls back to the default range.
  // Flashing it would save a session for the visitor, and visitors get none until they
  // log in (see server.js).
  const { start, end } = result.isEmpty() ? matchedData(req) : {};
  // HPD's news and X posts are the latest, whatever date range is chosen
  const [dashboard, news, xPosts] = await Promise.all([getDashboard({ start, end }), getLatestNews(), getLatestPosts()]);

  res.status(errors.length > 0 ? 400 : 200).render('homeView', {
    title: 'Honolulu Police Department arrest statistics',
    description: "Arrests from the Honolulu Police Department's published arrest logs, counted by age, sex, and ethnicity for any date range.",
    scripts: ['/js/dashboardCharts.js'],
    errors,
    news,
    xPosts,
    ...dashboard,
  });
};
