const assert = require('node:assert/strict');
const { mkdtempSync, writeFileSync, rmSync, readFileSync } = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const { loadTheOddsApiKey, createOddsApiClient, findConsensusHomeSpread } = require('../src/odds-api-client');

const fixture = JSON.parse(readFileSync(path.join(__dirname, 'fixtures', 'odds-api-response.json'), 'utf8'));
const target = { homeTeam: 'Philadelphia Eagles', awayTeam: 'Dallas Cowboys', kickoff: '2026-09-27T20:25:00.000Z' };
const secret = 'test-only-secret-123';

function eventWith(bookmakers) {
  return [{ ...fixture[0], bookmakers }];
}

test('loads only theoddsapi from a .env file, ignoring unrelated values and comments', () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'odds-client-test-'));
  const envPath = path.join(dir, '.env');
  try {
    writeFileSync(envPath, `other_provider=do-not-return\n# theoddsapi=not-the-key\ntheoddsapi = "${secret}" # local key\n`);
    assert.equal(loadTheOddsApiKey({ envPath }), secret);
    writeFileSync(envPath, 'other_provider=do-not-return\ntheoddsapi=  # missing\n');
    assert.throws(() => loadTheOddsApiKey({ envPath }), /theoddsapi.*(missing|blank)/i);
    assert.throws(() => loadTheOddsApiKey({ envPath }), (error) => !String(error).includes('do-not-return'));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('requests only current NFL US spreads and returns safe metadata', async () => {
  let requests = 0;
  const client = createOddsApiClient({ apiKey: secret, fetchImpl: async (url, options) => {
    requests += 1;
    const parsed = new URL(url);
    assert.equal(parsed.origin + parsed.pathname, 'https://api.the-odds-api.com/v4/sports/americanfootball_nfl/odds');
    assert.equal(parsed.searchParams.get('regions'), 'us');
    assert.equal(parsed.searchParams.get('markets'), 'spreads');
    assert.equal(parsed.searchParams.get('apiKey'), secret);
    assert.equal(parsed.searchParams.has('date'), false);
    assert.equal(parsed.searchParams.has('oddsFormat'), false);
    assert.equal(options?.headers?.authorization, undefined);
    return { ok: true, json: async () => fixture };
  } });
  const result = await client.fetchNflSpreads();
  assert.equal(requests, 1);
  assert.deepEqual(result.response, fixture);
  assert.equal(result.source, 'the-odds-api');
  assert.match(result.retrievedAt, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
  assert.equal(JSON.stringify(result).includes(secret), false);
  assert.equal(JSON.stringify(result).includes('apiKey='), false);
});

test('refuses missing credentials without making a request', async () => {
  let called = false;
  assert.throws(() => createOddsApiClient({ apiKey: '  ', fetchImpl: async () => { called = true; } }), /api key/i);
  assert.equal(called, false);
});

test('redacts the key and request URL from transport, HTTP, and parsing failures', async () => {
  for (const fetchImpl of [
    async (url) => { throw new Error(`network failure ${url}`); },
    async () => ({ ok: false, status: 401, statusText: secret, url: `https://example.test/?apiKey=${secret}` }),
    async () => ({ ok: true, json: async () => { throw new Error(`invalid JSON ${secret}`); } }),
  ]) {
    const client = createOddsApiClient({ apiKey: secret, fetchImpl });
    await assert.rejects(client.fetchNflSpreads(), (error) => {
      assert.equal(String(error).includes(secret), false);
      assert.equal(String(error).includes('apiKey='), false);
      assert.equal(JSON.stringify(error).includes(secret), false);
      return /odds api/i.test(String(error));
    });
  }
});

test('does not return a credential echoed in the provider response', async () => {
  const client = createOddsApiClient({ apiKey: secret, fetchImpl: async () => ({
    ok: true,
    json: async () => [{ ...fixture[0], id: `echo-${secret}` }],
  }) });
  const result = await client.fetchNflSpreads();
  assert.equal(JSON.stringify(result).includes(secret), false);
  assert.equal(result.response[0].id, 'echo-[REDACTED]');
});

test('takes the median of finite home spreads from distinct bookmakers', () => {
  const currentOdds = findConsensusHomeSpread({ response: fixture, target });
  assert.match(currentOdds.retrievedAt, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
  assert.deepEqual({ ...currentOdds, retrievedAt: undefined }, {
    provider: 'the-odds-api',
    retrievedAt: undefined,
    contributingBooks: 4,
    homeSpreads: [-4.5, -3.5, -2.5, -1.5],
    consensusSpreadHome: -3,
  });
});

test('carries the retrieval timestamp through a fetched response', () => {
  const result = findConsensusHomeSpread({
    response: { response: fixture, retrievedAt: '2026-09-27T10:00:00.000Z', source: 'the-odds-api' },
    target,
  });
  assert.equal(result.retrievedAt, '2026-09-27T10:00:00.000Z');
});

test('rejects reversed, wrong-team, and wrong-kickoff events without guessing a line', () => {
  for (const response of [
    [{ ...fixture[0], home_team: target.awayTeam, away_team: target.homeTeam }],
    [{ ...fixture[0], away_team: 'New York Giants' }],
    [{ ...fixture[0], commence_time: '2026-09-27T21:25:00Z' }],
  ]) {
    assert.throws(() => findConsensusHomeSpread({ response, target }), /matching.*(team|kickoff|event)|reversed/i);
  }
});

test('rejects events without finite home quotes and excludes malformed or wrong-market quotes', () => {
  const invalidBooks = [
    { key: 'nan', markets: [{ key: 'spreads', outcomes: [{ name: target.homeTeam, point: '3.5' }] }] },
    { key: 'infinite', markets: [{ key: 'spreads', outcomes: [{ name: target.homeTeam, point: Infinity }] }] },
    { key: 'away', markets: [{ key: 'spreads', outcomes: [{ name: target.awayTeam, point: 3.5 }] }] },
    { key: 'totals', markets: [{ key: 'totals', outcomes: [{ name: target.homeTeam, point: -2 }] }] },
  ];
  assert.throws(() => findConsensusHomeSpread({ response: eventWith(invalidBooks), target }), /valid.*home.*spread|quote/i);
  const odds = findConsensusHomeSpread({ response: eventWith([...invalidBooks, fixture[0].bookmakers[0]]), target });
  assert.equal(odds.contributingBooks, 1);
  assert.deepEqual(odds.homeSpreads, [-4.5]);
  assert.equal(odds.consensusSpreadHome, -4.5);
});

test('rejects malformed bookmaker collections as missing valid quotes', () => {
  for (const response of [
    [{ ...fixture[0], bookmakers: { invalid: true } }],
    eventWith([{ key: 'bad-book', markets: { invalid: true } }]),
  ]) {
    assert.throws(() => findConsensusHomeSpread({ response, target }), /valid home spread quotes/i);
  }
});
