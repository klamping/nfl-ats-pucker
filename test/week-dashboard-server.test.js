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

test('serves safe slate rows and successful detail comparisons', async (t) => {
  const server = await createWeekDashboardServer({ season: 2026, week: 3, games: [snapshot()],
    failures: [{ gameId: 'broken', message: 'private failure detail' }], outputRoot: ROOT, fileSystem: fileSystem(), port: 0 });
  t.after(() => new Promise((resolve) => server.close(resolve)));
  assert.equal(server.address().address, '127.0.0.1');

  const slate = await (await response(server, '/api/slate')).json();
  assert.deepEqual(slate, { season: 2026, week: 3, games: [
    { status: 'ready', gameId: 'game-1', matchup: 'AWY at HME', kickoff: { date: '2026-09-27', time: '17:00' },
      currentOdds: { provider: 'the-odds-api', consensusSpreadHome: -3, contributingBooks: 2 }, candidateCount: 1,
      homeCoverRate: 1, awayCoverRate: 0 },
    { status: 'unavailable', gameId: 'broken', message: 'Unable to gather game' },
  ] });
  assert.equal(JSON.stringify(slate).includes('secret'), false);
  assert.equal((await response(server, '/api/comparison/game-1')).status, 200);
  assert.equal((await response(server, '/api/comparison/broken')).status, 404);
  assert.equal((await response(server, '/games/game-1/')).status, 200);
  assert.equal((await response(server, '/games/broken/')).status, 404);
  assert.equal((await response(server, '/api/slate?x=1')).status, 404);
  assert.equal((await response(server, '/api/slate', { method: 'POST' })).status, 405);
  assert.equal(await statusWithHost(server, 'attacker.example'), 403);
});

test('keeps a valid game when another snapshot cannot be compared', async (t) => {
  const invalid = snapshot({ gameId: 'partial', homePregame: { ...features, pointsScoredPerGame: null } });
  const server = await createWeekDashboardServer({ season: 2026, week: 3, games: [snapshot(), invalid], failures: [], outputRoot: ROOT, fileSystem: fileSystem(), port: 0 });
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const slate = await (await response(server, '/api/slate')).json();
  assert.deepEqual(slate.games.map((game) => [game.gameId, game.status]), [['game-1', 'ready'], ['partial', 'unavailable']]);
});
