// Draws the Dispatches page's map: one dot per active call, with its time, type, and place
// in a popup. The list under the map has the same calls, so nothing depends on the map.

/**************************************************************
DOM selectors
***************************************************************/
const callMap = document.querySelector('.callMap');

/**************************************************************
Helpers
***************************************************************/
const oahuCenter = [21.46, -157.98];
const oahuZoom = 10;
const closestZoom = 15; // Don't zoom past street level, even for a single dot

// Colors come from styles.css, so the dots match the site's brand blue
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

  const dots = calls.map((call) => L.circleMarker([call.lat, call.lng], dotStyle).bindPopup(buildPopup(call)));
  const group = L.featureGroup(dots).addTo(map);
  map.fitBounds(group.getBounds().pad(0.15), { maxZoom: closestZoom });
};

/**************************************************************
Event listeners
***************************************************************/
// Scripts load with defer, so the page is parsed; L is set by leaflet.js, which loads first
if (callMap && window.L) drawMap();
