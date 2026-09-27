// Sizes each chart bar from the share the server worked out (0–100% of the largest value).
// Each chart's bars grow in, one after another, when the chart first scrolls into view.
// Without JavaScript the bars stay empty, but every value is still shown as text and in the tables.

/**************************************************************
DOM selectors
***************************************************************/
const charts = document.querySelectorAll('.barList, .columnChart');

/**************************************************************
Helpers
***************************************************************/
const barStagger = 40; // ms between one bar starting to grow and the next

// styles.css turns the change of size into growth
const sizeBars = (chart) => {
  chart.querySelectorAll('[data-share]').forEach((bar, index) => {
    bar.style.transitionDelay = `${index * barStagger}ms`;
    bar.style.setProperty('--barShare', bar.dataset.share);
  });
};

const sizeAllCharts = () => charts.forEach(sizeBars);

/**************************************************************
Main logic
***************************************************************/
// A chart grows once a quarter of it is on screen, so the growth is seen rather than missed
const chartObserver = new IntersectionObserver(
  (entries) => {
    entries
      .filter((entry) => entry.isIntersecting)
      .forEach((entry) => {
        sizeBars(entry.target);
        chartObserver.unobserve(entry.target);
      });
  },
  { threshold: 0.25 }
);

/**************************************************************
Event listeners
***************************************************************/
charts.forEach((chart) => chartObserver.observe(chart));

// A printout shows every chart, including ones never scrolled to
window.addEventListener('beforeprint', sizeAllCharts);
