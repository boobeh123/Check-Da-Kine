// Turns the Arrests page's "Load more arrests" link into infinite scroll. The link works on
// its own (it opens the next page), so the feed still works if this script doesn't run.

/**************************************************************
DOM selectors
***************************************************************/
const arrestFeed = document.querySelector('.arrestFeed');
const feedStatus = document.querySelector('.feedStatus');
const loadMoreLink = document.querySelector('.loadMore');

/**************************************************************
Helpers
***************************************************************/
const preloadDistance = '400px'; // Start loading this far before the link scrolls into view
let isLoading = false;

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
  endMessage.textContent = "That's every arrest on record.";
  loadMoreLink.replaceWith(endMessage);
};

// Fetches the next page the server renders and parses it, so its cards come from the same
// template as the first page's and are moved over as elements, never as HTML strings
const fetchNextPage = async (url) => {
  const response = await fetch(url, { headers: { Accept: 'text/html' } });
  if (!response.ok) throw new Error(`Server responded ${response.status}`);
  return new DOMParser().parseFromString(await response.text(), 'text/html');
};

/**************************************************************
Main logic
***************************************************************/
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
  arrestFeed.setAttribute('aria-busy', 'true');

  try {
    const nextPage = await fetchNextPage(loadMoreLink.href);
    const newCards = [...nextPage.querySelectorAll('.arrestFeed > .arrestCard')];
    const nextLink = nextPage.querySelector('.loadMore');
    const nextStatus = nextPage.querySelector('.feedStatus');

    arrestFeed.append(...newCards);
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
    console.error(error);
    feedStatus.textContent = "Couldn't load more arrests. Try again.";
  } finally {
    isLoading = false;
    arrestFeed.removeAttribute('aria-busy');
  }
};

/**************************************************************
Event handlers
***************************************************************/
const handleLoadMoreClick = (event) => {
  event.preventDefault();
  loadMore({ moveFocus: true });
};

/**************************************************************
Event listeners
***************************************************************/
if (arrestFeed && loadMoreLink) {
  loadMoreLink.addEventListener('click', handleLoadMoreClick);
  linkObserver.observe(loadMoreLink);
}
