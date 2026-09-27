// Draws the Dispatches page's map: one dot per active call, with its time, type, and place
// in a popup. The list under the map has the same calls, so nothing depends on the map.
// Each call's row and dot are linked: pointing at either one highlights both, and choosing
// a row opens its dot's popup.

/**************************************************************
DOM selectors
***************************************************************/
const callMap = document.querySelector('.callMap');
const callRows = document.querySelectorAll('.callRow[data-call-id]');
const callListHint = document.querySelector('#callListHint');

/**************************************************************
Helpers
***************************************************************/
const oahuCenter = [21.46, -157.98];
const oahuZoom = 10;
const closestZoom = 15; // Don't zoom past street level, even for a single dot

// Colors come from styles.css, so the dots match the site's brand colors
const cssColor = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();

const addLine = (parent, tag, text, className) => {
  const line = document.createElement(tag);
  line.textContent = text;
  if (className) line.className = className;
  parent.append(line);
};

// Built from elements with textContent, never from HTML strings
const buildPopup = (call) => {
  const popup = document.createElement('div');
  addLine(popup, 'strong', call.type, 'mapPopupType');
  addLine(popup, 'span', call.receivedAt, 'mapPopupLine');
  addLine(popup, 'span', call.place, 'mapPopupLine');
  addLine(popup, 'span', call.district, 'mapPopupLine');
  if (call.streetLevel) addLine(popup, 'span', 'Placed on the street; the block wasn’t found', 'mapPopupNote');
  return popup;
};

// Swaps a row's <div> for a <button> with the same contents, so it can be clicked and tabbed to
const toRowButton = (row) => {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = `${row.className} callButton`;
  button.setAttribute('aria-describedby', 'callListHint');
  button.append(...row.childNodes);
  row.replaceWith(button);
  return button;
};

// On phones the list runs long below the map, so a chosen call's dot may be out of view
const scrollMapIntoView = () => {
  const { top, bottom } = callMap.getBoundingClientRect();
  if (top >= 0 && bottom <= window.innerHeight) return;
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  callMap.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'center' });
};

/**************************************************************
Main logic
***************************************************************/
const drawMap = () => {
  const calls = JSON.parse(callMap.dataset.calls);

  // Scroll-wheel zoom is off so scrolling the page never gets stuck on the map
  const map = L.map(callMap, { scrollWheelZoom: false }).setView(oahuCenter, oahuZoom);

  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    // OpenStreetMap's tile policy requires a Referer and sends an "Access blocked" tile
    // without one. The site-wide header (helmet) sends none, so the tiles alone send the
    // site's domain; never a page path.
    referrerPolicy: 'strict-origin',
  }).addTo(map);

  // A 2px white ring keeps overlapping dots distinct
  const dotStyle = {
    radius: 8,
    color: cssColor('--colorSurface'),
    weight: 2,
    fillColor: cssColor('--colorPrimary'),
    fillOpacity: 0.9,
  };
  // A highlighted dot is bigger and amber, so it stands out from the blue ones
  const highlightedDotStyle = { ...dotStyle, radius: 12, weight: 3, fillColor: cssColor('--colorAccent'), fillOpacity: 1 };

  const dots = new Map(); // call id -> its dot
  const rowButtons = new Map(); // call id -> its row in the list
  let openCallId = null; // The call whose popup is open stays highlighted

  const setHighlight = (id, isOn) => {
    const dot = dots.get(id);
    dot.setStyle(isOn ? highlightedDotStyle : dotStyle);
    if (isOn) dot.bringToFront();
    rowButtons.get(id)?.classList.toggle('isHighlighted', isOn);
  };

  const highlight = (id) => setHighlight(id, true);
  const unhighlight = (id) => {
    if (id !== openCallId) setHighlight(id, false);
  };

  calls.forEach((call) => {
    const dot = L.circleMarker([call.lat, call.lng], dotStyle).bindPopup(buildPopup(call));
    dot.on('mouseover', () => highlight(call.id));
    dot.on('mouseout', () => unhighlight(call.id));
    dot.on('popupopen', () => {
      openCallId = call.id;
      highlight(call.id);
    });
    dot.on('popupclose', () => {
      openCallId = null;
      unhighlight(call.id);
    });
    dots.set(call.id, dot);
  });

  const group = L.featureGroup([...dots.values()]).addTo(map);
  map.fitBounds(group.getBounds().pad(0.15), { maxZoom: closestZoom });

  // Rows whose call has a dot become buttons; calls that couldn't be placed stay plain text
  callRows.forEach((row) => {
    const id = row.dataset.callId;
    if (!dots.has(id)) return;

    const button = toRowButton(row);
    rowButtons.set(id, button);
    button.addEventListener('mouseenter', () => highlight(id));
    button.addEventListener('mouseleave', () => unhighlight(id));
    button.addEventListener('focus', () => highlight(id));
    button.addEventListener('blur', () => unhighlight(id));
    button.addEventListener('click', () => {
      scrollMapIntoView();
      dots.get(id).openPopup();
    });
  });

  if (rowButtons.size > 0) callListHint.hidden = false;
};

/**************************************************************
Event listeners
***************************************************************/
// Scripts load with defer, so the page is parsed; L is set by leaflet.js, which loads first
if (callMap && window.L) drawMap();
