// Requests to HPD's website, shared by the arrest-log and dispatch scrapers.

const requestTimeoutMs = 60 * 1000;

// HPD's site rejects requests that don't look like they come from a browser
const requestHeaders = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36',
};

const fetchFromHpd = async (url) => {
  const response = await fetch(url, {
    headers: requestHeaders,
    signal: AbortSignal.timeout(requestTimeoutMs),
  });
  if (!response.ok) throw new Error(`HPD returned ${response.status} for ${url}`);
  return response;
};

module.exports = { fetchFromHpd };
