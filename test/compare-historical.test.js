const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { compareHistorical, runComparisonCli } = require('../src/compare-historical');

const FEATURES = ['gamesPlayed', 'winPercentage', 'pointsScoredPerGame', 'pointsAllowedPerGame',
  'netYardsPerPlay', 'netEpaPerPlay', 'turnoverMarginPerGame', 'offensiveSackRate',
  'defensiveSackRate', 'restDays'];

function matchup(overrides = {}) {
  const features = Object.fromEntries(FEATURES.map((field) => [field, 1]));
  return {
    gameId: 'game-1', season: 2026, week: 3, gameType: 'REG', awayTeam: 'AWY', homeTeam: 'HME',
    awayScore: 0, homeScore: 0, closingSpreadHome: -3,
    kickoff: { date: '2026-09-20', time: '13:00' },
    awayPregame: { ...features }, homePregame: { ...features },
    ...overrides,
  };
}

function snapshot(overrides = {}) {
  const value = matchup({
    awayScore: undefined, homeScore: undefined,
    currentOdds: { provider: 'the-odds-api', retrievedAt: '2026-09-01T00:00:00Z',
      contributingBooks: 2, homeSpreads: [-3, -3], consensusSpreadHome: -3 },
    ...overrides,
  });
  delete value.awayScore;
  delete value.homeScore;
  return value;
}

function historical(overrides = {}) {
  return matchup({ season: 2020, gameType: 'REG', ...overrides });
}

test('validates the gathered snapshot and selected finite features', () => {
  const invalid = snapshot({ homePregame: { ...snapshot().homePregame, netEpaPerPlay: null } });
  assert.throws(() => compareHistorical({ input: invalid, historicalMatchups: [] }), /finite|valid/i);
});

test('allows partially populated historical features at 70% coverage and rejects lower coverage', () => {
  const partial = historical({ week: 2, homePregame: {
    ...snapshot().homePregame, gamesPlayed: 2, netEpaPerPlay: null,
  } });
  const sparse = historical({ week: 3, homePregame: Object.fromEntries(FEATURES.map((field, index) => [field, index < 3 ? 1 : null])) });
  const result = compareHistorical({ input: snapshot(), historicalMatchups: [partial, sparse] });
  assert.equal(result.candidates.length, 1);
  assert.equal(result.candidates[0].featureCoverage, 20 / 21);
  assert.deepEqual(result.candidates[0].omittedFeatures, ['home.netEpaPerPlay']);
  assert.ok(Math.abs(result.candidates[0].distanceContributions['home.gamesPlayed'] - 1 / 20) < 1e-12);
  assert.equal(result.filters.minimumFeatureCoverage, 0.7);
});

test('rejects a snapshot without gameId before comparing historical matchups', () => {
  const input = snapshot();
  delete input.gameId;
  let comparisonStarted = false;
  class HistoricalMatchups extends Array {
    filter(...args) {
      comparisonStarted = true;
      return super.filter(...args);
    }
  }

  assert.throws(() => compareHistorical({ input, historicalMatchups: new HistoricalMatchups() }), /valid/i);
  assert.equal(comparisonStarted, false);
});

test('defaults Week 3 to historical Weeks 2 through 5', () => {
  const result = compareHistorical({ input: snapshot(), historicalMatchups: [
    historical({ week: 1 }), historical({ week: 2 }), historical({ week: 5 }), historical({ week: 6 }),
  ] });
  assert.deepEqual(result.filters.weekWindow, { startWeek: 2, endWeek: 5 });
  assert.deepEqual(result.candidates.map((candidate) => candidate.week), [2, 5]);
});

test('uses explicit week offsets from the target week', () => {
  const result = compareHistorical({ input: snapshot(), historicalMatchups: [
    historical({ week: 1 }), historical({ week: 6 }), historical({ week: 7 }),
  ], weekWindow: { startOffset: -2, endOffset: 4 } });
  assert.deepEqual(result.filters.weekWindow, { startWeek: 1, endWeek: 7 });
  assert.deepEqual(result.candidates.map((candidate) => candidate.week), [1, 6, 7]);
});

test('filters same game type and home spread band before ranking', () => {
  const result = compareHistorical({ input: snapshot(), spreadBand: 2, historicalMatchups: [
    historical({ week: 2, closingSpreadHome: -4 }),
    historical({ week: 3, closingSpreadHome: 0 }),
    historical({ week: 4, gameType: 'POST', closingSpreadHome: -3 }),
  ] });
  assert.equal(result.candidates.length, 1);
  assert.equal(result.candidates[0].week, 2);
});

test('ranks by normalized weighted feature distances and exposes contributions', () => {
  const near = historical({ week: 2, homePregame: { ...snapshot().homePregame, gamesPlayed: 2 } });
  const far = historical({ week: 4, homePregame: { ...snapshot().homePregame, gamesPlayed: 10 } });
  const result = compareHistorical({ input: snapshot(), historicalMatchups: [far, near] });
  assert.deepEqual(result.candidates.map((candidate) => candidate.week), [2, 4]);
  assert.ok(result.candidates[0].similarityScore < result.candidates[1].similarityScore);
  assert.ok(Object.hasOwn(result.candidates[0].distanceContributions, 'home.gamesPlayed'));
  assert.ok(Object.hasOwn(result.candidates[0].distanceContributions, 'away.gamesPlayed'));
  assert.ok(Object.hasOwn(result.candidates[0].distanceContributions, 'closingSpreadHome'));
  assert.equal(result.candidates[0].distanceContributions['home.gamesPlayed'], 1 / 9 / 21);
  assert.equal(result.candidates[0].distanceContributions['away.gamesPlayed'], 0);
});

test('grades home cover, away cover, and push with exact ATS margin math and aggregates', () => {
  const result = compareHistorical({ input: snapshot(), spreadBand: 10, historicalMatchups: [
    historical({ week: 2, homeScore: 24, awayScore: 20, closingSpreadHome: 3 }),
    historical({ week: 3, homeScore: 20, awayScore: 24, closingSpreadHome: -3 }),
    historical({ week: 4, homeScore: 23, awayScore: 20, closingSpreadHome: 3 }),
  ] });
  const grades = Object.fromEntries(result.candidates.map(({ week, homeAtsMargin, outcome }) =>
    [week, { homeAtsMargin, outcome }]));
  assert.deepEqual(grades, {
    2: { homeAtsMargin: 1, outcome: 'home_cover' },
    3: { homeAtsMargin: -1, outcome: 'away_cover' },
    4: { homeAtsMargin: 0, outcome: 'push' },
  });
  assert.deepEqual(result.summary, { candidateCount: 3, homeCovers: 1, awayCovers: 1, pushes: 1, homeCoverRate: 0.5 });
});

test('returns a stable empty result when no candidates match', () => {
  const result = compareHistorical({ input: snapshot(), historicalMatchups: [] });
  assert.deepEqual(result.candidates, []);
  assert.deepEqual(result.summary, { candidateCount: 0, homeCovers: 0, awayCovers: 0, pushes: 0, homeCoverRate: null });
});

test('CLI reads snapshot and accepted historical manifest once and remains read-only', async () => {
  const root = '/repo';
  const manifestPath = path.join(root, 'data/normalized/nfl/nflverse-team-matchups-2005-2025.current.json');
  const acceptedPath = path.join(root, 'data/normalized/nfl/run/matchups.accepted.jsonl');
  const reads = [];
  const writes = [];
  const fileSystem = {
    async readFile(file) {
      reads.push(file);
      if (file === '/input.json') return JSON.stringify(snapshot());
      if (file === manifestPath) return JSON.stringify({ accepted: 'run/matchups.accepted.jsonl' });
      if (file === acceptedPath) return `${JSON.stringify(historical({ week: 2 }))}\n`;
      throw new Error(`unexpected read: ${file}`);
    },
    writeFile(...args) { writes.push(args); throw new Error('must not write'); },
  };
  const output = { log: (line) => assert.doesNotThrow(() => JSON.parse(line)) };
  const result = await runComparisonCli({ inputPath: '/input.json', output, fileSystem, outputRoot: root });
  assert.equal(result.candidates.length, 1);
  assert.equal(reads.filter((file) => file === manifestPath).length, 1);
  assert.deepEqual(writes, []);
});
