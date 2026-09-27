// Sizes each chart bar from the share the server worked out (0–100% of the largest value).
// Without JavaScript the bars stay empty, but every value is still shown as text and in the tables.

/**************************************************************
DOM selectors
***************************************************************/
const chartBars = document.querySelectorAll('[data-share]');

/**************************************************************
Main logic
***************************************************************/
const sizeBars = () => {
  chartBars.forEach((bar) => {
    bar.style.setProperty('--barShare', bar.dataset.share);
  });
};

// The script loads with defer, so the page is already parsed and no listener is needed
sizeBars();
