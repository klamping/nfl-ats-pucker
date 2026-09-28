const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { compareHistorical, runComparisonCli } = require('../src/compare-historical');

const FEATURES = ['gamesPlayed', 'winPercentage', 'pointsScoredPerGame', 'pointsAllowedPerGame',
  'netYardsPerPlay', 'netEpaPerPlay', 'turnoverMarginPerGame', 'offensiveSackRate',
  'defensiveSackRate', 'restDays', 'passingEpaPerDropback', 'rushingEpaPerCarry',
  'explosivePlayRate'];

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

test('accepts an nflverse retrospective market with a matching finite consensus line', () => {
  const input = snapshot({
    currentOdds: { provider: 'nflverse', retrievedAt: '2026-09-01T00:00:00Z', consensusSpreadHome: -3 },
  });

  assert.deepEqual(compareHistorical({ input, historicalMatchups: [] }).summary, {
    candidateCount: 0, homeCovers: 0, awayCovers: 0, pushes: 0, homeCoverRate: null,
  });
});

test('rejects nflverse retrospective markets with a missing or mismatched consensus line', () => {
  for (const currentOdds of [
    { provider: 'nflverse', retrievedAt: '2026-09-01T00:00:00Z' },
    { provider: 'nflverse', retrievedAt: '2026-09-01T00:00:00Z', consensusSpreadHome: -2.5 },
  ]) {
    assert.throws(() => compareHistorical({ input: snapshot({ currentOdds }), historicalMatchups: [] }), /valid/i);
  }
});

test('allows partially populated historical features at 70% coverage and rejects lower coverage', () => {
  const partial = historical({ week: 2, homePregame: {
    ...snapshot().homePregame, pointsScoredPerGame: 2, netEpaPerPlay: null,
  } });
  const sparse = historical({ week: 3, homePregame: Object.fromEntries(FEATURES.map((field, index) => [field, index < 3 ? 1 : null])) });
  const result = compareHistorical({ input: snapshot(), historicalMatchups: [partial, sparse] });
  assert.equal(result.candidates.length, 1);
  assert.equal(result.candidates[0].featureCoverage, 21 / 22);
  assert.deepEqual(result.candidates[0].omittedFeatures, ['home.netEpaPerPlay']);
  assert.ok(Math.abs(result.candidates[0].distanceContributions['home.pointsScoredPerGame'] - 1 / 21) < 1e-12);
  assert.equal(result.filters.minimumFeatureCoverage, 0.7);
  assert.equal(Object.keys(result.filters.featureWeights).length, 22);
  assert.ok(Math.abs(Object.values(result.filters.featureWeights).reduce((sum, weight) => sum + weight, 0) - 1) < 1e-12);
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

test('filters same game type and fixed home spread band before ranking', () => {
  const result = compareHistorical({ input: snapshot(), historicalMatchups: [
    historical({ week: 2, closingSpreadHome: -4 }),
    historical({ week: 3, closingSpreadHome: 1 }),
    historical({ week: 4, gameType: 'POST', closingSpreadHome: -3 }),
  ] });
  assert.equal(result.candidates.length, 1);
  assert.equal(result.candidates[0].week, 2);
});

test('uses a ±3.5 spread eligibility band without scoring eligible line differences', () => {
  const eligible = historical({ week: 2, closingSpreadHome: 0.5 });
  const outside = historical({ week: 3, closingSpreadHome: 0.6 });
  const result = compareHistorical({ input: snapshot(), spreadBand: 10, historicalMatchups: [eligible, outside] });

  assert.equal(result.filters.spreadBand, 3.5);
  assert.equal(Object.hasOwn(result.filters.featureWeights, 'closingSpreadHome'), false);
  assert.deepEqual(result.candidates.map((candidate) => candidate.week), [2]);
  assert.equal(result.candidates[0].similarityScore, 0);
  assert.equal(Object.hasOwn(result.candidates[0].distanceContributions, 'closingSpreadHome'), false);
});

test('ranks by normalized weighted feature distances and exposes contributions', () => {
  const near = historical({ week: 2, homePregame: {
    ...snapshot().homePregame, gamesPlayed: 2, passingEpaPerDropback: 2,
  } });
  const far = historical({ week: 4, homePregame: {
    ...snapshot().homePregame, gamesPlayed: 10, passingEpaPerDropback: 10,
  } });
  const result = compareHistorical({ input: snapshot(), historicalMatchups: [far, near] });
  assert.deepEqual(result.candidates.map((candidate) => candidate.week), [2, 4]);
  assert.ok(result.candidates[0].similarityScore < result.candidates[1].similarityScore);
  assert.equal(Object.hasOwn(result.candidates[0].distanceContributions, 'home.gamesPlayed'), false);
  assert.equal(Object.hasOwn(result.candidates[0].distanceContributions, 'away.gamesPlayed'), false);
  assert.ok(Object.hasOwn(result.candidates[0].distanceContributions, 'home.passingEpaPerDropback'));
  assert.equal(Object.hasOwn(result.candidates[0].distanceContributions, 'closingSpreadHome'), false);
  assert.equal(result.candidates[0].distanceContributions['home.gamesPlayed'], undefined);
  assert.equal(result.candidates[0].distanceContributions['home.passingEpaPerDropback'], 1 / 9 / 22);
  assert.equal(result.candidates[0].distanceContributions['away.gamesPlayed'], undefined);
});

test('returns every qualifying historical game by default', () => {
  const historicalMatchups = Array.from({ length: 11 }, (_, index) => historical({
    gameId: `game-${index + 1}`,
    week: 2,
  }));
  const result = compareHistorical({ input: snapshot(), historicalMatchups });

  assert.equal(result.candidates.length, 11);
  assert.equal(result.summary.candidateCount, 11);
  assert.equal(result.filters.limit, null);
});

test('applies an explicit candidate limit when requested', () => {
  const historicalMatchups = Array.from({ length: 11 }, (_, index) => historical({
    gameId: `game-${index + 1}`,
    week: 2,
  }));
  const result = compareHistorical({ input: snapshot(), historicalMatchups, limit: 3 });

  assert.equal(result.candidates.length, 3);
  assert.equal(result.filters.limit, 3);
});

test('keeps candidates at or below the 0.150 similarity-distance threshold', () => {
  const featureFields = ['pointsScoredPerGame', 'pointsAllowedPerGame', 'netYardsPerPlay', 'netEpaPerPlay'];
  const atThreshold = historical({
    gameId: 'at-threshold', week: 2,
    homePregame: {
      ...snapshot().homePregame,
      [featureFields[0]]: 2,
      [featureFields[1]]: 2,
      [featureFields[2]]: 2,
      [featureFields[3]]: 1.3,
    },
  });
  const beyondThreshold = historical({
    gameId: 'beyond-threshold', week: 3,
    homePregame: Object.fromEntries(FEATURES.map((field) => [field, featureFields.includes(field) ? 2 : 1])),
  });
  const result = compareHistorical({ input: snapshot(), historicalMatchups: [atThreshold, beyondThreshold] });

  assert.equal(result.filters.maximumSimilarityDistance, 0.15);
  assert.deepEqual(result.candidates.map((candidate) => candidate.gameId), ['at-threshold']);
  assert.equal(result.candidates[0].similarityScore, 0.15);
});

test('does not score games played or win percentage after week matching', () => {
  const historicalGame = historical({ week: 2, homePregame: {
    ...snapshot().homePregame, gamesPlayed: 10, winPercentage: 0.9,
  }, awayPregame: {
    ...snapshot().awayPregame, gamesPlayed: 1, winPercentage: 0.1,
  } });
  const result = compareHistorical({ input: snapshot(), historicalMatchups: [historicalGame] });

  assert.equal(Object.keys(result.filters.featureWeights).length, 22);
  assert.equal(result.candidates[0].similarityScore, 0);
  assert.equal(Object.hasOwn(result.candidates[0].distanceContributions, 'home.gamesPlayed'), false);
  assert.equal(Object.hasOwn(result.candidates[0].distanceContributions, 'away.winPercentage'), false);
});

test('grades home cover, away cover, and push with exact ATS margin math and aggregates', () => {
  const result = compareHistorical({ input: snapshot(), historicalMatchups: [
    historical({ week: 2, homeScore: 24, awayScore: 20, closingSpreadHome: 0.5 }),
    historical({ week: 3, homeScore: 20, awayScore: 24, closingSpreadHome: -3 }),
    historical({ week: 4, homeScore: 23, awayScore: 23, closingSpreadHome: 0 }),
  ] });
  const grades = Object.fromEntries(result.candidates.map(({ week, homeAtsMargin, outcome }) =>
    [week, { homeAtsMargin, outcome }]));
  const weekTwoCandidate = result.candidates.find((candidate) => candidate.week === 2);
  assert.equal(weekTwoCandidate.homeScore, 24);
  assert.equal(weekTwoCandidate.awayScore, 20);
  assert.equal(weekTwoCandidate.closingSpreadHome, 0.5);
  assert.equal(Object.hasOwn(weekTwoCandidate, 'homePregame'), false);
  assert.equal(Object.hasOwn(weekTwoCandidate, 'awayPregame'), false);
  assert.deepEqual(grades, {
    2: { homeAtsMargin: 4.5, outcome: 'home_cover' },
    3: { homeAtsMargin: -7, outcome: 'away_cover' },
    4: { homeAtsMargin: 0, outcome: 'push' },
  });
  assert.deepEqual(result.summary, { candidateCount: 3, homeCovers: 1, awayCovers: 1, pushes: 1, homeCoverRate: 0.5 });
});

test('grades a home +7 team that loses by one as a home cover', () => {
  const input = snapshot({
    closingSpreadHome: 7,
    currentOdds: { ...snapshot().currentOdds, consensusSpreadHome: 7 },
  });
  const result = compareHistorical({ input, historicalMatchups: [
    historical({ week: 2, homeScore: 20, awayScore: 21, closingSpreadHome: 7 }),
  ] });

  assert.equal(result.candidates[0].homeAtsMargin, 6);
  assert.equal(result.candidates[0].outcome, 'home_cover');
  assert.deepEqual(result.summary, { candidateCount: 1, homeCovers: 1, awayCovers: 0, pushes: 0, homeCoverRate: 1 });
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
