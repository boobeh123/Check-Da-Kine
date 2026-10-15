const { validationResult, matchedData } = require('express-validator');
const { getDispatchPage } = require('../services/dispatches/getDispatchPage');
const { dispatchPageUrl } = require('../services/dispatches/fetchDispatches');

exports.getDispatches = async (req, res) => {
  const result = validationResult(req);
  const errors = result.array().map((error) => error.msg);

  // A bad range is reported on the page itself, which falls back to all time, the way the
  // home page handles one (indexController.js)
  const { start, end } = result.isEmpty() ? matchedData(req) : {};
  const page = await getDispatchPage({ start, end });

  res.status(errors.length > 0 ? 400 : 200).render('dispatchesView', {
    title: 'Dispatches',
    description: 'The police calls HPD is handling right now on a map of Oahu, with counts by call type and district for any date range.',
    styles: ['/vendor/leaflet/leaflet.css'],
    // Deferred scripts run in this order, so Leaflet is ready before the map script
    scripts: ['/js/dashboardCharts.js', '/vendor/leaflet/leaflet.js', '/js/dispatchMap.js'],
    sourceUrl: dispatchPageUrl,
    errors,
    ...page,
  });
};
