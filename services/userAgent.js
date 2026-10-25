// How Check Da Kine identifies itself to the sites it reads that accept an honest name: the
// Nominatim geocoder (its usage policy asks for one) and the Big Island booking logs. HPD's
// site rejects requests that don't look like a browser, so hpdRequest.js sends a browser's.
module.exports = { userAgent: 'CheckDaKine/1.0 (+https://checkdakine.com)' };
