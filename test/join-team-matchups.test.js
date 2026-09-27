const assert = require('node:assert/strict');
const test = require('node:test');

const { joinTeamPregameToMarkets } = require('../src/join-team-matchups');

const market = {
  gameId: '2025_02_ARI_NYG', season: 2025, week: 2,
  gameType: 'REG', kickoff: { date: '2025-09-14', time: '13:00', weekday: 'Sunday' },
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
  gameType: 'REG', kickoff: { date: '2025-09-14', time: '13:00', weekday: 'Sunday' },
  franchiseId: 'nflverse-3800', features: { ...emptyFeatures, gamesPlayed: 1, wins: 1 },
  pointsFor: 42, rawStats: { passing_yards: '300' },
};
const home = {
  gameId: market.gameId, season: 2025, week: 2, team: 'NYG',
  gameType: 'REG', kickoff: { date: '2025-09-14', time: '13:00', weekday: 'Sunday' },
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
    gameType: 'REG', kickoff: { date: '2025-09-14', time: '13:00', weekday: 'Sunday' },
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

test('copies only safe nested kickoff and weather values from the market game', () => {
  const injected = {
    ...market,
    kickoff: { date: '2025-09-14', time: '13:00', weekday: 'Sunday', homeScore: 28 },
    weather: { temperature: 72, wind: 8, finalScore: '28-17' },
  };
  const { accepted, rejected } = joinTeamPregameToMarkets({
    marketGames: [injected], pregameRecords: [away, home],
  });
  assert.deepEqual(rejected, []);
  assert.deepEqual(accepted[0].kickoff, {
    date: '2025-09-14', time: '13:00', weekday: 'Sunday',
  });
  assert.deepEqual(accepted[0].weather, { temperature: 72, wind: 8 });
});

test('rejects missing or malformed market kickoff date/time instead of publishing a matchup', () => {
  for (const kickoff of [
    undefined,
    { time: '13:00' },
    { date: '2025-09-14' },
    { date: '2025-99-99', time: '13:00' },
    { date: '2025-09-14', time: '25:00' },
  ]) {
    const { accepted, rejected } = joinTeamPregameToMarkets({
      marketGames: [{ ...market, kickoff }], pregameRecords: [away, home],
    });
    assert.deepEqual(accepted, []);
    assert.deepEqual(rejected.map(({ reason }) => reason), ['invalid_market_kickoff']);
  }
});

test('rejects missing or mismatched game types and kickoff identity on either pregame side', () => {
  for (const [row, reason] of [
    [{ ...home, gameType: 'POST' }, 'game_type_mismatch'],
    [{ ...home, gameType: undefined }, 'game_type_mismatch'],
    [{ ...home, kickoff: { date: '2025-09-15', time: '13:00' } }, 'kickoff_mismatch'],
    [{ ...home, kickoff: { date: '2025-09-14', time: '16:00' } }, 'kickoff_mismatch'],
    [{ ...home, kickoff: { date: '2025-09-14' } }, 'kickoff_mismatch'],
    [{ ...home, kickoff: null }, 'kickoff_mismatch'],
  ]) {
    const { accepted, rejected } = joinTeamPregameToMarkets({
      marketGames: [market], pregameRecords: [away, row],
    });
    assert.deepEqual(accepted, []);
    assert.deepEqual(rejected.map(({ reason: actual }) => actual), [reason]);
  }
  const { accepted, rejected } = joinTeamPregameToMarkets({
    marketGames: [{ ...market, gameType: undefined }], pregameRecords: [away, home],
  });
  assert.deepEqual(accepted, []);
  assert.deepEqual(rejected.map(({ reason }) => reason), ['missing_core_field']);
});

test('does not require weekday to identify the same kickoff', () => {
  const { accepted, rejected } = joinTeamPregameToMarkets({
    marketGames: [{ ...market, kickoff: { date: '2025-09-14', time: '13:00' } }],
    pregameRecords: [away, { ...home, kickoff: { date: '2025-09-14', time: '13:00', weekday: 'Monday' } }],
  });
  assert.deepEqual(rejected, []);
  assert.deepEqual(accepted[0].kickoff, { date: '2025-09-14', time: '13:00' });
});

test('omits an object-valued stadium rather than copying its postgame fields', () => {
  const { accepted, rejected } = joinTeamPregameToMarkets({
    marketGames: [{ ...market, stadium: { homeScore: 28 }, roof: 'outdoors' }],
    pregameRecords: [away, home],
  });
  assert.deepEqual(rejected, []);
  assert.equal(accepted.length, 1);
  assert.equal(Object.hasOwn(accepted[0], 'stadium'), false);
  assert.equal(accepted[0].roof, 'outdoors');
});

test('omits an object-valued source and preserves only correctly typed scalar market metadata', () => {
  const { accepted, rejected } = joinTeamPregameToMarkets({
    marketGames: [{
      ...market, source: { finalScore: '28-17' }, stadium: 'MetLife Stadium',
      sourceUrl: 'https://example.com/games.csv', divisionGame: false,
      closingTotal: 44.5, awayRest: { finalScore: '28-17' },
      homeRest: 7, roof: null, surface: ['grass', { homeScore: 28 }],
    }],
    pregameRecords: [away, home],
  });
  assert.deepEqual(rejected, []);
  assert.equal(accepted.length, 1);
  assert.deepEqual(Object.fromEntries(['source', 'stadium', 'sourceUrl', 'divisionGame',
    'closingTotal', 'awayRest', 'homeRest', 'roof', 'surface']
    .filter((field) => Object.hasOwn(accepted[0], field))
    .map((field) => [field, accepted[0][field]])), {
    stadium: 'MetLife Stadium', sourceUrl: 'https://example.com/games.csv',
    divisionGame: false, closingTotal: 44.5, homeRest: 7, roof: null,
  });
});
