const { getDispatchPage } = require('../services/dispatches/getDispatchPage');
const { dispatchPageUrl } = require('../services/dispatches/fetchDispatches');

exports.getDispatches = async (req, res) => {
  const page = await getDispatchPage();

  res.render('dispatchesView', {
    title: 'Dispatches',
    styles: ['/vendor/leaflet/leaflet.css'],
    // Deferred scripts run in this order, so Leaflet is ready before the map script
    scripts: ['/js/dashboardCharts.js', '/vendor/leaflet/leaflet.js', '/js/dispatchMap.js'],
    sourceUrl: dispatchPageUrl,
    ...page,
  });
};
