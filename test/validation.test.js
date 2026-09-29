// Input checks: the dashboard's date range, the Arrests page's search and paging link, the
// login form, and cleaning search words before they reach MongoDB.
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { validationResult, matchedData } = require('express-validator');
const { validateDateRange, validateArrestsPage, validateLogin } = require('../middleware/validators');
const { toSearchWords, toTextSearch } = require('../services/arrests/searchWords');

// Runs a validator chain against a stand-in request; returns the messages and the request
const check = async (chain, { query = {}, body = {} } = {}) => {
  const req = { query, body };
  for (const validator of chain) await validator.run(req);
  return { messages: validationResult(req).array().map((error) => error.msg), req };
};

describe('validateDateRange', () => {
  it('accepts no dates, or a real range', async () => {
    assert.deepEqual((await check(validateDateRange)).messages, []);
    assert.deepEqual((await check(validateDateRange, { query: { start: '2026-09-01', end: '2026-09-26' } })).messages, []);
  });

  it("rejects dates that don't exist or aren't YYYY-MM-DD", async () => {
    assert.deepEqual((await check(validateDateRange, { query: { start: '2026-02-30' } })).messages, [
      'Enter a real start date, written as YYYY-MM-DD.',
    ]);
    assert.deepEqual((await check(validateDateRange, { query: { end: '09/26/2026' } })).messages, [
      'Enter a real end date, written as YYYY-MM-DD.',
    ]);
  });

  it('rejects an end before the start, and a repeated parameter', async () => {
    assert.deepEqual((await check(validateDateRange, { query: { start: '2026-09-26', end: '2026-09-01' } })).messages, [
      'The end date must be on or after the start date.',
    ]);
    assert.equal((await check(validateDateRange, { query: { start: ['2026-09-01', '2026-09-02'] } })).messages.length, 1);
  });
});

describe('validateArrestsPage', () => {
  const broken = 'That link to more arrests is broken.';
  const cursor = { beforeTime: '2026-09-27T01:48:00.000Z', beforeId: '66f5a1b2c3d4e5f6a7b8c9d0' };

  it('accepts a paging link with both halves, or neither', async () => {
    assert.deepEqual((await check(validateArrestsPage, { query: cursor })).messages, []);
    assert.deepEqual((await check(validateArrestsPage)).messages, []);
  });

  it('rejects a paging link with a missing or broken half', async () => {
    assert.deepEqual((await check(validateArrestsPage, { query: { beforeTime: cursor.beforeTime } })).messages, [broken]);
    assert.ok((await check(validateArrestsPage, { query: { ...cursor, beforeId: 'not-an-id' } })).messages.includes(broken));
    assert.ok((await check(validateArrestsPage, { query: { ...cursor, beforeTime: 'yesterday' } })).messages.includes(broken));
  });

  it('trims the search and caps it at 100 characters', async () => {
    const { messages, req } = await check(validateArrestsPage, { query: { q: '  assault  ' } });
    assert.deepEqual(messages, []);
    assert.equal(matchedData(req).q, 'assault');
    assert.deepEqual((await check(validateArrestsPage, { query: { q: 'A'.repeat(100) } })).messages, []);
    assert.deepEqual((await check(validateArrestsPage, { query: { q: 'A'.repeat(101) } })).messages, [
      'Keep the search to 100 characters or fewer.',
    ]);
  });

  it('rejects a search that arrives as an object, like q[$ne]=', async () => {
    assert.equal((await check(validateArrestsPage, { query: { q: { $ne: 'x' } } })).messages.length, 1);
  });

  it('accepts the filters, trimming the charge and officer', async () => {
    const { messages, req } = await check(validateArrestsPage, { query: { charge: ' THEFT 4 ', sex: 'F', officer: ' DOE, J ' } });
    assert.deepEqual(messages, []);
    const { charge, sex, officer } = matchedData(req);
    assert.deepEqual({ charge, sex, officer }, { charge: 'THEFT 4', sex: 'F', officer: 'DOE, J' });
  });

  it('rejects a sex other than M or F, and filters that are too long or not text', async () => {
    assert.deepEqual((await check(validateArrestsPage, { query: { sex: 'X' } })).messages, ['Choose Male or Female.']);
    assert.deepEqual((await check(validateArrestsPage, { query: { sex: ['M', 'F'] } })).messages, ['Choose Male or Female.']);
    assert.deepEqual((await check(validateArrestsPage, { query: { charge: 'A'.repeat(201) } })).messages, [
      'Choose a charge from the list.',
    ]);
    assert.deepEqual((await check(validateArrestsPage, { query: { officer: { $ne: 'x' } } })).messages, [
      'Choose an officer from the list.',
    ]);
  });
});

describe('validateLogin', () => {
  it('trims and lowercases the email', async () => {
    const { messages, req } = await check(validateLogin, { body: { email: '  Someone@Example.COM ', password: 'secret' } });
    assert.deepEqual(messages, []);
    assert.equal(req.body.email, 'someone@example.com');
  });

  it('rejects a bad email and a missing or huge password', async () => {
    assert.deepEqual((await check(validateLogin, { body: { email: 'not-an-email', password: 'secret' } })).messages, [
      'Enter a valid email address.',
    ]);
    assert.deepEqual((await check(validateLogin, { body: { email: 'someone@example.com', password: '' } })).messages, [
      'Enter your password.',
    ]);
    assert.deepEqual((await check(validateLogin, { body: { email: 'someone@example.com', password: 'x'.repeat(201) } })).messages, [
      'Enter your password.',
    ]);
  });
});

describe('toSearchWords and toTextSearch', () => {
  it('splits a search into uppercase letters-and-digits words', () => {
    assert.deepEqual(toSearchWords('Kalakaua Ave'), ['KALAKAUA', 'AVE']);
    assert.deepEqual(toSearchWords('708-0833'), ['708', '0833']);
    assert.deepEqual(toSearchWords('  assault!!  3 '), ['ASSAULT', '3']);
  });

  it('leaves nothing that MongoDB could read as an operator or a pattern', () => {
    assert.deepEqual(toSearchWords('$where .* "x" -dui'), ['WHERE', 'X', 'DUI']);
  });

  it('treats an empty or symbols-only search as no search', () => {
    assert.deepEqual(toSearchWords('!!!'), []);
    assert.deepEqual(toSearchWords(undefined), []);
  });

  it('keeps at most 10 words', () => {
    assert.equal(toSearchWords('a b c d e f g h i j k l').length, 10);
  });

  it('quotes every word, so each one has to match', () => {
    assert.equal(toTextSearch(['DUI', 'KAILUA']), '"DUI" "KAILUA"');
  });
});
