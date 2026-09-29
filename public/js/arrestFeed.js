// Turns the Arrests page's "Load more arrests" link into infinite scroll, fading cards below
// the fold up as they scroll into view, and applies each filter dropdown as soon as it
// changes by swapping in the new results without reloading the page. Both work without this
// script (the link opens the next page, and the Search button applies the filters).

/**************************************************************
DOM selectors
***************************************************************/
const searchForm = document.querySelector('.arrestSearch');
const filterSelects = document.querySelectorAll('.filterRow select');
const filterHint = document.querySelector('#filterHint');
const filterStatus = document.querySelector('#filterStatus');

// Everything below the search card, replaced when a filter changes. The feed's parts are
// found again inside it each time (see setUpFeed).
let results = document.querySelector('.arrestResults');
let arrestFeed = null;
let feedStatus = null;
let loadMoreLink = null;

/**************************************************************
Helpers
***************************************************************/
const preloadDistance = '400px'; // Start loading this far before the link scrolls into view
const filterDelay = 250; // ms to wait after a dropdown changes, so arrow-key presses settle first
const hintText = filterHint?.textContent;

let isLoading = false;
let feedGeneration = 0; // Goes up when new results are swapped in, so a load for the old ones is dropped
let filterTimer = null;
let filterRequest = null; // The filter fetch in flight, cancelled by a newer change

const formatCount = (count) => Number(count).toLocaleString('en-US');

const showCount = (end) => {
  feedStatus.dataset.end = end;
  feedStatus.textContent =
    `Showing arrests ${formatCount(feedStatus.dataset.start)}–${formatCount(end)} ` +
    `of ${formatCount(feedStatus.dataset.total)}.`;
};

const showEndOfFeed = () => {
  const endMessage = document.createElement('p');
  endMessage.className = 'feedEnd';
  endMessage.textContent = feedStatus.dataset.endMessage; // Worded for the filters, if there are any
  loadMoreLink.replaceWith(endMessage);
};

// Fetches a page the server renders and parses it, so new cards come from the same template
// as the first page's and are moved over as elements, never as HTML strings
const fetchPage = async (url, signal) => {
  const response = await fetch(url, { headers: { Accept: 'text/html' }, signal });
  if (!response.ok) throw new Error(`Server responded ${response.status}`);
  return new DOMParser().parseFromString(await response.text(), 'text/html');
};

// The address the Search button would go to, leaving out anything not chosen
const filteredUrl = () => {
  const chosen = [...new FormData(searchForm)].filter(([, value]) => value.trim() !== '');
  const query = new URLSearchParams(chosen).toString();
  return query ? `/arrests?${query}` : '/arrests';
};

// What the status line says about new results: the summary, or the plain count
const describeResults = () => {
  const summary = results.querySelector('.summaryText')?.textContent;
  const empty = results.querySelector('.emptyState h2')?.textContent;
  const total = results.querySelector('.feedStatus')?.dataset.total;
  return (summary ?? empty ?? `Showing all ${formatCount(total)} arrests.`).replace(/\s+/g, ' ').trim();
};

/**************************************************************
Main logic
***************************************************************/
// A hidden card is shown (styles.css fades it up) once it's a little way onto the screen
const revealObserver = new IntersectionObserver(
  (entries) => {
    entries
      .filter((entry) => entry.isIntersecting)
      .forEach((entry) => {
        entry.target.classList.remove('beforeReveal');
        revealObserver.unobserve(entry.target);
      });
  },
  { rootMargin: '0px 0px -40px 0px' }
);

const hideUntilSeen = (card) => {
  card.classList.add('beforeReveal');
  revealObserver.observe(card);
};

const linkObserver = new IntersectionObserver(
  (entries) => {
    if (entries.some((entry) => entry.isIntersecting)) loadMore({ moveFocus: false });
  },
  { rootMargin: `0px 0px ${preloadDistance} 0px` }
);

// Watching the link again makes the observer re-check it, so a link that is still on screen
// after a load (on a tall screen, say) loads the next page too
const watchLink = () => {
  linkObserver.unobserve(loadMoreLink);
  linkObserver.observe(loadMoreLink);
};

const loadMore = async ({ moveFocus }) => {
  if (isLoading) return;
  isLoading = true;
  const generation = feedGeneration;
  arrestFeed.setAttribute('aria-busy', 'true');

  try {
    const nextPage = await fetchPage(loadMoreLink.href);
    if (generation !== feedGeneration) return; // The filters changed while this page loaded

    const newCards = [...nextPage.querySelectorAll('.arrestFeed > .arrestCard')];
    const nextLink = nextPage.querySelector('.loadMore');
    const nextStatus = nextPage.querySelector('.feedStatus');

    arrestFeed.append(...newCards);
    newCards.forEach(hideUntilSeen); // Before the next paint, so they never flash in first
    if (nextStatus) showCount(nextStatus.dataset.end);

    // Keyboard and screen reader users who pressed the link land on the first new arrest
    if (moveFocus && newCards.length > 0) newCards[0].focus();

    if (nextLink) {
      loadMoreLink.href = nextLink.getAttribute('href');
      watchLink();
    } else {
      linkObserver.disconnect();
      showEndOfFeed();
    }
  } catch (error) {
    if (generation !== feedGeneration) return;
    console.error(error);
    feedStatus.textContent = "Couldn't load more arrests. Try again.";
  } finally {
    if (generation === feedGeneration) {
      isLoading = false;
      arrestFeed.removeAttribute('aria-busy');
    }
  }
};

// Starts infinite scroll and the card fade-in on the current results. Cards already on
// screen are left alone.
const setUpFeed = () => {
  feedGeneration += 1;
  isLoading = false;
  linkObserver.disconnect();
  revealObserver.disconnect();

  arrestFeed = results.querySelector('.arrestFeed');
  feedStatus = results.querySelector('.feedStatus');
  loadMoreLink = results.querySelector('.loadMore');

  if (arrestFeed) {
    [...arrestFeed.children]
      .filter((card) => card.getBoundingClientRect().top > window.innerHeight)
      .forEach(hideUntilSeen);
  }
  if (arrestFeed && loadMoreLink) {
    loadMoreLink.addEventListener('click', handleLoadMoreClick);
    linkObserver.observe(loadMoreLink);
  }
};

// Swaps in the results for the form's current choices and puts them in the address bar.
// Focus stays on the dropdown, so keyboard users can keep going.
const applyFilters = async () => {
  filterRequest?.abort();
  const request = new AbortController();
  filterRequest = request;
  const url = filteredUrl();
  results.setAttribute('aria-busy', 'true');

  try {
    const page = await fetchPage(url, request.signal);
    const newResults = page.querySelector('.arrestResults');
    if (!newResults) throw new Error('The page came back without results');

    results.replaceWith(newResults);
    results = newResults;
    history.replaceState(null, '', url);
    setUpFeed();
    filterHint.textContent = hintText;
    filterStatus.textContent = describeResults();
  } catch (error) {
    if (error.name === 'AbortError') return; // A newer change took over
    console.error(error);
    filterHint.textContent = "Couldn't update the results. Press Search to try again.";
  } finally {
    if (request === filterRequest) results.removeAttribute('aria-busy');
  }
};

/**************************************************************
Event handlers
***************************************************************/
const handleLoadMoreClick = (event) => {
  event.preventDefault();
  loadMore({ moveFocus: true });
};

// Rapid changes (holding an arrow key on a closed dropdown) apply only the last choice
const handleFilterChange = () => {
  clearTimeout(filterTimer);
  filterTimer = setTimeout(applyFilters, filterDelay);
};

/**************************************************************
Event listeners
***************************************************************/
if (results) setUpFeed();

if (searchForm && results && filterSelects.length > 0) {
  filterSelects.forEach((select) => select.addEventListener('change', handleFilterChange));
  filterHint.hidden = false;
}
