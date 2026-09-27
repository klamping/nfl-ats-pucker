const assert = require('node:assert/strict');
const test = require('node:test');

const { createSportsGameOddsClient } = require('../src/sportsgameodds-client');

const filters = { startsAfter: '2025-09-01', startsBefore: '2026-02-20' };

test('requests finalized NFL events with Pinnacle and no API key in the URL', async () => {
  let capturedUrl;
  let capturedHeaders;
  const client = createSportsGameOddsClient('test-key', async (url, options) => {
    capturedUrl = url;
    capturedHeaders = options.headers;
    return {
      ok: true,
      status: 200,
      json: async () => ({ events: [] }),
    };
  });

  await client.fetchFinalizedNflEvents(filters);

  assert.match(capturedUrl, /leagueID=NFL/);
  assert.match(capturedUrl, /finalized=true/);
  assert.match(capturedUrl, /bookmakerID=pinnacle/);
  assert.equal(new URL(capturedUrl).searchParams.get('includeOpenCloseOdds'), 'true');
  assert.equal(capturedHeaders['x-api-key'], 'test-key');
  assert.doesNotMatch(capturedUrl, /test-key/);
});

test('fails closed on a Pinnacle subscription-tier HTTP 400', async () => {
  const client = createSportsGameOddsClient('test-key', async () => ({
    ok: false,
    status: 400,
    json: async () => ({ error: 'The bookmakerID pinnacle is unavailable at your current subscription tier' }),
  }));

  await assert.rejects(client.fetchFinalizedNflEvents(filters), /SportsGameOdds.*400/);
});

test('rejects non-success responses before returning data', async () => {
  const client = createSportsGameOddsClient('test-key', async () => ({
    ok: false,
    status: 503,
    json: async () => ({ shouldNotReturn: true }),
  }));

  await assert.rejects(client.fetchFinalizedNflEvents(filters), /SportsGameOdds.*503/);
});
