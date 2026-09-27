const { validationResult, matchedData } = require('express-validator');
const { getDashboard } = require('../services/dashboard/getDashboard');

exports.getHome = async (req, res) => {
  const result = validationResult(req);
  const errors = result.array().map((error) => error.msg);

  // There are no sessions for flash messages, so a bad range is reported on the page
  // itself, which falls back to the default range
  const { start, end } = result.isEmpty() ? matchedData(req) : {};
  const dashboard = await getDashboard({ start, end });

  res.status(errors.length > 0 ? 400 : 200).render('homeView', {
    title: 'Honolulu Police Department arrest statistics',
    scripts: ['/js/dashboardCharts.js'],
    errors,
    ...dashboard,
  });
};
