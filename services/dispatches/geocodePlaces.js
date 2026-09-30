// Turns dispatch addresses into map coordinates with OpenStreetMap's free Nominatim service,
// caching every result in GeocodedPlace. Nominatim's usage policy: at most one request per
// second, an identifying User-Agent, and caching instead of repeating searches.

const mongoose = require('mongoose');
const GeocodedPlace = require('../../model/GeocodedPlace');

const nominatimUrl = 'https://nominatim.openstreetmap.org/search';
const userAgent = 'CheckDaKine/1.0 (+https://checkdakine.com)';
const requestGapMs = 1100; // A little over Nominatim's one-per-second limit
const requestTimeoutMs = 20 * 1000;
const maxLookupsPerRun = 30; // Keeps each run short; any extra places wait for the next run

// Oahu's bounding box (west, north, east, south), so "Kailua" can't land on another island
const oahuViewbox = '-158.30,21.72,-157.60,21.24';

// HPD abbreviations the geocoder doesn't understand
const streetWords = { KAM: 'KAMEHAMEHA', HMSTD: 'HOMESTEAD', H1E: 'H-1', H1W: 'H-1', H1: 'H-1', H2: 'H-2', H3: 'H-3' };

// HPD "cities" that are really parts of Honolulu with no place of that name on the map
const cityNames = { DOWNTOWN: 'HONOLULU', AIRPORT: 'HONOLULU' };

let lastRequestAt = 0;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const placeKey = ({ address, city }) => `${address}|${city}`;

// HPD masks the last digits: "51XX" is the 5100 block. Outside town, Oahu addresses are
// "zone-lot" numbers like 91-1200, which HPD prints without the hyphen and with the lot
// padded to four digits: "911200" is 91-1200 and "9504XX" is 95-400. Returns null when the
// mask hides the whole number ("XX", "9900XX").
const toHouseNumber = (printed) => {
  const digits = printed.replace(/X/g, '0');
  if (!/^\d+$/.test(digits) || Number(digits) === 0) return null;

  if (digits.length === 6) {
    const lot = String(Number(digits.slice(2)));
    return lot === '0' ? null : `${digits.slice(0, 2)}-${lot}`;
  }
  return String(Number(digits));
};

const expandStreet = (street) =>
  street
    .split(' ')
    .map((word) => streetWords[word] ?? word)
    .join(' ');

// "16XX HAUIKI ST" -> { number: "1600", streets: ["HAUIKI ST"] }
// "LIKELIKE HWY / NALANIEHA ST" -> { number: null, streets: ["LIKELIKE HWY", "NALANIEHA ST"] }
const toPlaceParts = (address) => {
  const streets = address.split('/').map((part) => part.trim()).filter(Boolean);
  if (streets.length > 1) return { number: null, streets: streets.map(expandStreet) };

  const [first, ...rest] = address.split(' ');
  const isNumber = /^[\dX]+$/.test(first) && rest.length > 0;
  return isNumber
    ? { number: toHouseNumber(first), streets: [expandStreet(rest.join(' '))] }
    : { number: null, streets: [expandStreet(address)] };
};

// Most precise first: the block, then each street in the town, then each street anywhere on
// Oahu. The geocoder can't find intersections, so those go straight to street level.
const buildQueries = ({ address, city }) => {
  const { number, streets } = toPlaceParts(address);
  const town = cityNames[city] ?? city;
  return [
    ...(number ? [{ text: `${number} ${streets[0]}, ${town}, Hawaii`, precision: 'block' }] : []),
    ...streets.map((street) => ({ text: `${street}, ${town}, Hawaii`, precision: 'street' })),
    ...streets.map((street) => ({ text: `${street}, Hawaii`, precision: 'street' })),
  ];
};

const searchNominatim = async (text) => {
  await sleep(Math.max(0, lastRequestAt + requestGapMs - Date.now()));
  lastRequestAt = Date.now();

  const params = new URLSearchParams({
    q: text,
    format: 'jsonv2',
    limit: '1',
    countrycodes: 'us',
    viewbox: oahuViewbox,
    bounded: '1',
  });
  const response = await fetch(`${nominatimUrl}?${params}`, {
    headers: { 'User-Agent': userAgent, 'Accept-Language': 'en' },
    signal: AbortSignal.timeout(requestTimeoutMs),
  });
  if (!response.ok) throw new Error(`Nominatim returned ${response.status}`);

  const [result] = await response.json();
  return result ? { lat: Number(result.lat), lng: Number(result.lon) } : null;
};

// Looks up every place in `calls` that isn't cached yet, within this run's lookup budget.
// Returns counts for the job's log line.
const geocodeNewPlaces = async (calls) => {
  const places = [...new Map(calls.map((call) => [placeKey(call), { address: call.address, city: call.city }])).values()];
  const cached = await GeocodedPlace.find({ key: mongoose.trusted({ $in: places.map(placeKey) }) })
    .select('key')
    .lean();
  const cachedKeys = new Set(cached.map((place) => place.key));
  const newPlaces = places.filter((place) => place.address && !cachedKeys.has(placeKey(place)));

  const summary = { block: 0, street: 0, notFound: 0, waiting: 0, lookups: 0 };

  for (const place of newPlaces) {
    const queries = buildQueries(place);
    let match = null;
    let triedAll = true;

    for (const query of queries) {
      if (summary.lookups >= maxLookupsPerRun) {
        triedAll = false;
        break;
      }
      summary.lookups += 1;
      const result = await searchNominatim(query.text);
      if (result) {
        match = { ...result, precision: query.precision, query: query.text };
        break;
      }
    }

    // Out of budget before every search was tried: leave it for the next run
    if (!match && !triedAll) {
      summary.waiting += 1;
      continue;
    }

    await GeocodedPlace.create({
      key: placeKey(place),
      ...place,
      found: Boolean(match),
      ...(match ?? {}),
      lookedUpAt: new Date(),
    });
    summary[match ? match.precision : 'notFound'] += 1;
  }

  return summary;
};

// Coordinates for already-cached places, keyed like placeKey
const findPlaced = async (calls) => {
  const places = await GeocodedPlace.find({
    key: mongoose.trusted({ $in: calls.map(placeKey) }),
    found: true,
  }).lean();
  return new Map(places.map((place) => [place.key, place]));
};

module.exports = { geocodeNewPlaces, findPlaced, placeKey, buildQueries };
