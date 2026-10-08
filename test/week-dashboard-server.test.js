const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const http = require('node:http');

const { createWeekDashboardServer } = require('../src/week-dashboard-server');

const ROOT = '/repo';
const MANIFEST = path.join(ROOT, 'data/normalized/nfl/nflverse-team-matchups-2005-2025.current.json');
const ACCEPTED = path.join(ROOT, 'data/normalized/nfl/run/matchups.accepted.jsonl');
const features = Object.fromEntries(['gamesPlayed', 'winPercentage', 'pointsScoredPerGame', 'pointsAllowedPerGame',
  'netYardsPerPlay', 'netEpaPerPlay', 'turnoverMarginPerGame', 'offensiveSackRate', 'defensiveSackRate', 'restDays',
  'passingEpaPerDropback', 'rushingEpaPerCarry', 'explosivePlayRate', 'passingCpoe', 'interceptionRate',
  'rushingYardsPerCarry', 'passingExplosiveRate', 'rushingExplosiveRate', 'penaltyYardsPerGame'].map((field) => [field, 1]));

function snapshot(overrides = {}) {
  return { gameId: 'game-1', season: 2026, week: 3, gameType: 'REG', homeTeam: 'HME', awayTeam: 'AWY',
    kickoff: { date: '2026-09-27', time: '17:00' }, closingSpreadHome: -3,
    currentOdds: { provider: 'the-odds-api', retrievedAt: '2026-09-27T12:00:00Z', consensusSpreadHome: -3,
      contributingBooks: 2, homeSpreads: [-3], requestUrl: 'https://secret.test' },
    homePregame: features, awayPregame: features, sourceUrl: 'https://secret.test', ...overrides };
}
function historical() { return { ...snapshot(), gameId: 'old', season: 2020, week: 3, homeScore: 24, awayScore: 20 }; }
function fileSystem() {
  const files = { [MANIFEST]: JSON.stringify({ accepted: 'run/matchups.accepted.jsonl' }), [ACCEPTED]: `${JSON.stringify(historical())}\n` };
  return { async readFile(file) { if (files[file]) return files[file]; throw new Error('missing'); }, async realpath(file) { return file; } };
}
async function response(server, route, options) { return fetch(`http://127.0.0.1:${server.address().port}${route}`, options); }
async function statusWithHost(server, host) {
  return new Promise((resolve, reject) => http.get({ hostname: '127.0.0.1', port: server.address().port, path: '/api/slate', headers: { Host: host } }, (result) => { result.resume(); result.on('end', () => resolve(result.statusCode)); }).on('error', reject));
}

test('weekly details expose previous games only for known matchups without delaying startup', async (t) => {
  let calls = 0;
  const server = await createWeekDashboardServer({ season: 2026, week: 3,
    games: [snapshot({ homeTeam: 'PHI', awayTeam: 'DAL' })], outputRoot: ROOT, fileSystem: fileSystem(),
    fetchImpl: async () => { calls++; return { ok: true, json: async () => ({ events: [] }) }; } });
  t.after(() => new Promise(resolve => server.close(resolve)));
  assert.equal(calls, 0);
  const reply = await response(server, '/api/previous-games/game-1');
  assert.equal(reply.status, 200);
  assert.deepEqual(await reply.json(), { home: { team: 'PHI', status: 'empty' }, away: { team: 'DAL', status: 'empty' } });
  assert.equal((await response(server, '/api/previous-games/unknown')).status, 404);
  assert.equal((await response(server, '/api/previous-games/game-1', { method: 'POST' })).status, 405);
});

test('serves safe slate rows and successful detail comparisons', async (t) => {
  const server = await createWeekDashboardServer({ season: 2026, week: 3, games: [snapshot()],
    failures: [{ gameId: 'broken', message: 'private failure detail' }], outputRoot: ROOT, fileSystem: fileSystem(), port: 0 });
  t.after(() => new Promise((resolve) => server.close(resolve)));
  assert.equal(server.address().address, '127.0.0.1');

  const slate = await (await response(server, '/api/slate')).json();
  assert.equal(slate.games[0].decidedGameCount, 1);
  assert.ok(Math.abs(slate.games[0].coverSplitInterval.lower - (-29.35)) < 0.02);
  assert.equal(slate.games[0].coverSplitInterval.upper, 50);
  const detail = await (await response(server, '/api/comparison/game-1')).json();
  assert.deepEqual(detail.confidence.coverSplitInterval, slate.games[0].coverSplitInterval);
  assert.equal(detail.confidence.decidedGameCount, 1);
  assert.deepEqual(slate.games[0].lineup, {
    home: { team: 'HME', official: { status: 'unavailable', source: 'nfl.com' }, depthChart: { status: 'unavailable', source: 'ourlads' } },
    away: { team: 'AWY', official: { status: 'unavailable', source: 'nfl.com' }, depthChart: { status: 'unavailable', source: 'ourlads' } },
  });
  const { coverSplitInterval, decidedGameCount, lineup, ...existingFields } = slate.games[0];
  slate.games[0] = existingFields;
  assert.deepEqual(slate, { season: 2026, week: 3, games: [
    { status: 'ready', gameId: 'game-1', matchup: 'AWY at HME', kickoff: { date: '2026-09-27', time: '17:00', utc: '2026-09-27T21:00:00.000Z' },
      currentOdds: { provider: 'the-odds-api', consensusSpreadHome: -3, contributingBooks: 2 }, candidateCount: 1,
      coverSplit: 50, weightedConfidence: 5, recommendedPick: 'HME' },
    { status: 'unavailable', gameId: 'broken', message: 'Unable to gather game' },
  ] });
  assert.equal(JSON.stringify(slate).includes('secret'), false);
  assert.equal((await response(server, '/api/comparison/game-1')).status, 200);
  assert.equal((await response(server, '/api/comparison/broken')).status, 404);
  assert.equal((await response(server, '/games/game-1/')).status, 200);
  assert.match((await response(server, '/chart.js')).headers.get('content-type'), /^text\/javascript\b/);
  assert.equal((await response(server, '/games/broken/')).status, 404);
  assert.equal((await response(server, '/api/slate?x=1')).status, 404);
  assert.equal((await response(server, '/api/slate', { method: 'POST' })).status, 405);
  assert.equal(await statusWithHost(server, 'attacker.example'), 403);
});

test('serves the weekly card stylesheet without changing game-detail assets', async (t) => {
  const server = await createWeekDashboardServer({ season: 2026, week: 3, games: [snapshot()], outputRoot: ROOT, fileSystem: fileSystem(), port: 0 });
  t.after(() => new Promise(resolve => server.close(resolve)));
  const page = await (await response(server, '/')).text();
  assert.match(page, /href="\/week-styles\.css"/);
  assert.match(page, /id="slate-body"[^>]*role="list"/);
  assert.doesNotMatch(page, /<table/);
  const styles = await response(server, '/week-styles.css');
  assert.equal(styles.status, 200);
  assert.match(styles.headers.get('content-type'), /^text\/css\b/);
  assert.match(await styles.text(), /\.ranked-board/);
  const detail = await (await response(server, '/games/game-1/')).text();
  assert.match(detail, /href="\/styles\.css"/);
  assert.doesNotMatch(detail, /week-styles\.css/);
  assert.equal((await response(server, '/week-styles.css', { method: 'POST' })).status, 405);
});

test('projects an unambiguous UTC kickoff from Eastern schedule values in summer, winter and across date changes', async (t) => {
  const cases = [
    ['2026-10-08', '20:00', '2026-10-09T00:00:00.000Z'],
    ['2026-12-17', '20:00', '2026-12-18T01:00:00.000Z'],
    ['2026-10-11', '00:30', '2026-10-11T04:30:00.000Z'],
    ['2026-03-08', '03:30', '2026-03-08T07:30:00.000Z'],
  ];
  const games = cases.map(([date, time], index) => snapshot({ gameId: `time-${index}`, kickoff: { date, time } }));
  const server = await createWeekDashboardServer({ season: 2026, week: 3, games, outputRoot: ROOT, fileSystem: fileSystem() });
  t.after(() => new Promise(resolve => server.close(resolve)));
  const slate = await (await response(server, '/api/slate')).json();
  assert.equal(slate.games.length, cases.length);
  for (const [index, [date, time, utc]] of cases.entries()) {
    assert.equal(slate.games[index].status, 'ready');
    assert.deepEqual(slate.games[index].kickoff, { date, time, utc });
  }
});

test('projects only validated lineup fields and never exposes captures, provider URLs or error internals', async (t) => {
  const retrievedAt = '2026-10-04T12:00:00.000Z';
  const safeHome = { team: 'HME',
    official: { status: 'ready', source: 'nfl.com', retrievedAt,
      injuries: [{ player: 'Example', position: 'QB', status: 'Questionable', observedAt: retrievedAt }],
      transactions: [{ date: '2026-10-03', player: 'Reserve', position: null, detail: 'Signed' }] },
    depthChart: { status: 'ready', source: 'ourlads', retrievedAt, sourceUpdatedAt: '2026-10-04T11:00:00.000Z',
      baseline: 'available', changes: [{ position: 'QB', rank: 1, outgoingPlayer: 'Old Starter', incomingPlayer: 'New Starter' }] },
  };
  const secrets = { rawCapture: '<html>secret raw body</html>', sourceUrl: 'https://www.ourlads.com/secret',
    capturePath: '/data/raw/lineups/private', error: 'caught-error-secret' };
  const input = snapshot({ lineup: { home: { ...safeHome, ...secrets,
    official: { ...safeHome.official, ...secrets, injuries: safeHome.official.injuries.map(value => ({ ...value, ...secrets })) },
    depthChart: { ...safeHome.depthChart, ...secrets, changes: safeHome.depthChart.changes.map(value => ({ ...value, ...secrets })) } },
    away: { team: 'AWY', official: { status: 'unavailable', ...secrets }, depthChart: { status: 'unavailable', ...secrets } } } });
  const server = await createWeekDashboardServer({ season: 2026, week: 3, games: [input], outputRoot: ROOT, fileSystem: fileSystem() });
  t.after(() => new Promise(resolve => server.close(resolve)));
  const body = await (await response(server, '/api/slate')).text();
  const slate = JSON.parse(body);
  assert.deepEqual(slate.games[0].lineup.home, safeHome);
  assert.deepEqual(slate.games[0].lineup.away, { team: 'AWY', official: { status: 'unavailable', source: 'nfl.com' }, depthChart: { status: 'unavailable', source: 'ourlads' } });
  for (const forbidden of ['<html>', 'ourlads.com/', 'nfl.com/', '/data/raw', 'caught-error-secret', 'capturePath', 'rawCapture']) assert.equal(body.includes(forbidden), false);
});

test('malformed source fields fail closed without changing a ready game status', async (t) => {
  const context = { team: 'HME', official: { status: 'ready', source: 'nfl.com', retrievedAt: 'invalid', injuries: [], transactions: [] },
    depthChart: { status: 'ready', source: 'ourlads', retrievedAt: '2026-10-04T12:00:00Z', sourceUpdatedAt: '2026-10-04T11:00:00Z',
      baseline: 'available', changes: [{ position: 'QB', rank: 3, incomingPlayer: { private: 'secret' }, outgoingPlayer: null }] } };
  const server = await createWeekDashboardServer({ season: 2026, week: 3, games: [snapshot({ lineup: { home: context } })], outputRoot: ROOT, fileSystem: fileSystem() });
  t.after(() => new Promise(resolve => server.close(resolve)));
  const slate = await (await response(server, '/api/slate')).json();
  assert.equal(slate.games[0].status, 'ready');
  assert.equal(slate.games[0].lineup.home.official.status, 'unavailable');
  assert.equal(slate.games[0].lineup.home.depthChart.status, 'unavailable');
});

test('keeps a valid game when another snapshot cannot be compared', async (t) => {
  const invalid = snapshot({ gameId: 'partial', homePregame: { ...features, pointsScoredPerGame: null } });
  const server = await createWeekDashboardServer({ season: 2026, week: 3, games: [snapshot(), invalid], failures: [], outputRoot: ROOT, fileSystem: fileSystem(), port: 0 });
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const slate = await (await response(server, '/api/slate')).json();
  assert.deepEqual(slate.games.map((game) => [game.gameId, game.status]), [['game-1', 'ready'], ['partial', 'unavailable']]);
});
