const assert = require('node:assert/strict');
const test = require('node:test');

const { joinTeamPregameToMarkets } = require('../src/join-team-matchups');

const market = {
  gameId: '2025_02_ARI_NYG', season: 2025, week: 2,
  awayTeam: 'ARI', homeTeam: 'NYG', closingSpreadHome: -3,
  homeScore: 28, awayScore: 17,
};
const emptyFeatures = {
  gamesPlayed: null, wins: null, losses: null, winPercentage: null,
  pointsScoredPerGame: null, pointsAllowedPerGame: null,
  netYardsPerPlay: null, netEpaPerPlay: null, turnoverMarginPerGame: null,
  offensiveSackRate: null, defensiveSackRate: null, restDays: null,
};
const away = {
  gameId: market.gameId, season: 2025, week: 2, team: 'ARI',
  franchiseId: 'nflverse-3800', features: { ...emptyFeatures, gamesPlayed: 1, wins: 1 },
  pointsFor: 42, rawStats: { passing_yards: '300' },
};
const home = {
  gameId: market.gameId, season: 2025, week: 2, team: 'NYG',
  franchiseId: 'nflverse-3410', features: { ...emptyFeatures, gamesPlayed: 1, wins: 0 },
  pointsFor: 3, rawStats: { passing_yards: '100' },
};

test('joins exactly two pregame feature objects by game and side without postgame or score fields', () => {
  const { accepted, rejected } = joinTeamPregameToMarkets({
    marketGames: [market], pregameRecords: [home, away],
  });
  assert.deepEqual(rejected, []);
  assert.deepEqual(accepted, [{
    gameId: market.gameId, season: 2025, week: 2,
    awayTeam: 'ARI', homeTeam: 'NYG', closingSpreadHome: -3,
    awayPregame: { ...emptyFeatures, gamesPlayed: 1, wins: 1 },
    homePregame: { ...emptyFeatures, gamesPlayed: 1, wins: 0 },
  }]);
});

test('rejects missing and duplicate sides rather than emitting partial matchups', () => {
  const missing = joinTeamPregameToMarkets({ marketGames: [market], pregameRecords: [away] });
  assert.deepEqual(missing.accepted, []);
  assert.deepEqual(missing.rejected.map(({ gameId, reason }) => ({ gameId, reason })), [
    { gameId: market.gameId, reason: 'incomplete_team_pair' },
  ]);
  const duplicate = joinTeamPregameToMarkets({
    marketGames: [market], pregameRecords: [away, home, { ...home }],
  });
  assert.deepEqual(duplicate.accepted, []);
  assert.deepEqual(duplicate.rejected.map(({ reason }) => reason), ['duplicate_team_row']);
});

test('rejects wrong-game and wrong-team records, and records without pregame features', () => {
  for (const [records, reason] of [
    [[away, { ...home, gameId: 'another-game' }], 'incomplete_team_pair'],
    [[away, { ...home, team: 'DAL' }], 'team_mismatch'],
    [[away, { ...home, features: null }], 'missing_core_field'],
    [[away, { ...home, features: { gamesPlayed: 1 } }], 'missing_core_field'],
    [[away, { ...home, franchiseId: null }], 'missing_core_field'],
  ]) {
    const { accepted, rejected } = joinTeamPregameToMarkets({ marketGames: [market], pregameRecords: records });
    assert.deepEqual(accepted, []);
    assert.equal(rejected[0].reason, reason);
  }
});

test('strips injected postgame fields even when nested inside the feature object', () => {
  const injected = { ...home, features: { ...home.features, pointsFor: 42, rawStats: {} } };
  const { accepted, rejected } = joinTeamPregameToMarkets({
    marketGames: [market], pregameRecords: [away, injected],
  });
  assert.deepEqual(rejected, []);
  assert.equal(accepted[0].homePregame.pointsFor, undefined);
  assert.equal(accepted[0].homePregame.rawStats, undefined);
});
