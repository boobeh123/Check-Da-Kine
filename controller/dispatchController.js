const { getDispatchPage } = require('../services/dispatches/getDispatchPage');
const { dispatchPageUrl } = require('../services/dispatches/fetchDispatches');

exports.getDispatches = async (req, res) => {
  const page = await getDispatchPage();

  res.render('dispatchesView', {
    title: 'Dispatches',
    scripts: ['/js/dashboardCharts.js'], // Sizes the bar charts
    sourceUrl: dispatchPageUrl,
    ...page,
  });
};
