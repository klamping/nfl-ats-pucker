const assert = require('node:assert/strict');
const test = require('node:test');

const { deriveTeamPregame } = require('../src/derive-team-pregame');

function postgame(gameId, season, week, date, overrides = {}) {
  return {
    gameId, season, week, gameType: week > 18 ? 'POST' : 'REG',
    kickoff: { date, time: '13:00', weekday: 'Sunday' },
    team: 'ARI', opponent: 'NYG', franchiseId: 'nflverse-3800',
    opponentFranchiseId: 'nflverse-3410',
    pointsFor: 24, pointsAgainst: 14, result: 'win',
    offensiveYardsPerPlay: 6, defensiveYardsPerPlay: 4,
    offensiveEpaPerPlay: 0.2, defensiveEpaPerPlay: 0.1,
    turnoverMargin: 2, offensiveSackRate: 0.05, defensiveSackRate: 0.1,
    rawStats: { passing_yards: '300' }, source: 'nflverse',
    ...overrides,
  };
}

test('opening week has null history, and week two uses only earlier same-season games', () => {
  const first = postgame('2025_01_ARI_NYG', 2025, 1, '2025-09-07');
  const second = postgame('2025_02_ARI_LA', 2025, 2, '2025-09-14', {
    pointsFor: 3, pointsAgainst: 31, result: 'loss',
    offensiveYardsPerPlay: 2, defensiveYardsPerPlay: 8,
    offensiveEpaPerPlay: -0.3, defensiveEpaPerPlay: 0.4,
    turnoverMargin: -4, offensiveSackRate: 0.2, defensiveSackRate: 0.3,
  });
  const { accepted, rejected } = deriveTeamPregame([second, first]);
  assert.deepEqual(rejected, []);
  assert.deepEqual(accepted.map(({ gameId }) => gameId), [first.gameId, second.gameId]);
  const [opening, weekTwo] = accepted;
  assert.deepEqual(opening.features, {
    gamesPlayed: null, wins: null, losses: null, winPercentage: null,
    pointsScoredPerGame: null, pointsAllowedPerGame: null,
    netYardsPerPlay: null, netEpaPerPlay: null, turnoverMarginPerGame: null,
    offensiveSackRate: null, defensiveSackRate: null, restDays: null,
  });
  assert.deepEqual(weekTwo.features, {
    gamesPlayed: 1, wins: 1, losses: 0, winPercentage: 1,
    pointsScoredPerGame: 24, pointsAllowedPerGame: 14,
    netYardsPerPlay: 2, netEpaPerPlay: 0.1, turnoverMarginPerGame: 2,
    offensiveSackRate: 0.05, defensiveSackRate: 0.1, restDays: 7,
  });
  assert.deepEqual(Object.keys(weekTwo).sort(), [
    'features', 'franchiseId', 'gameId', 'gameType', 'kickoff', 'opponent',
    'season', 'team', 'week',
  ].sort());
});

test('postseason includes earlier regular and postseason games but a new season starts empty', () => {
  const regular = postgame('2025_18_ARI_NYG', 2025, 18, '2026-01-04');
  const wildcard = postgame('2025_19_ARI_LA', 2025, 19, '2026-01-11', {
    pointsFor: 10, pointsAgainst: 20, result: 'loss',
    offensiveYardsPerPlay: 4, defensiveYardsPerPlay: 5,
    offensiveEpaPerPlay: 0, defensiveEpaPerPlay: 0.2,
    turnoverMargin: -2, offensiveSackRate: 0.15, defensiveSackRate: 0.2,
  });
  const divisional = postgame('2025_20_ARI_SEA', 2025, 20, '2026-01-18');
  const newSeason = postgame('2026_01_ARI_NYG', 2026, 1, '2026-09-06');
  const { accepted, rejected } = deriveTeamPregame([divisional, newSeason, wildcard, regular]);
  assert.deepEqual(rejected, []);
  const { defensiveSackRate, ...postseasonFeatures } = accepted[2].features;
  assert.deepEqual(postseasonFeatures, {
    gamesPlayed: 2, wins: 1, losses: 1, winPercentage: 0.5,
    pointsScoredPerGame: 17, pointsAllowedPerGame: 17,
    netYardsPerPlay: 0.5, netEpaPerPlay: -0.05, turnoverMarginPerGame: 0,
    offensiveSackRate: 0.1, restDays: 7,
  });
  assert.ok(Math.abs(defensiveSackRate - 0.15) < 1e-12);
  assert.equal(accepted[3].features.gamesPlayed, null);
});

test('later results cannot change previously emitted snapshots or mutate the input', () => {
  const first = postgame('2025_01_ARI_NYG', 2025, 1, '2025-09-07');
  const second = postgame('2025_02_ARI_LA', 2025, 2, '2025-09-14');
  const firstTwo = deriveTeamPregame([first, second]).accepted;
  const third = postgame('2025_03_ARI_SEA', 2025, 3, '2025-09-21', { pointsFor: 100 });
  const all = deriveTeamPregame([third, first, second]).accepted;
  assert.deepEqual(all.slice(0, 2), firstTwo);
  assert.equal(first.pointsFor, 24);
  assert.equal(second.features, undefined);
});

test('same-time games cannot contribute to one another even if game IDs order them', () => {
  const first = postgame('2025_01_ARI_LA', 2025, 1, '2025-09-07');
  const second = postgame('2025_01_ARI_NYG', 2025, 1, '2025-09-07');
  const { accepted } = deriveTeamPregame([second, first]);
  assert.deepEqual(accepted.map((record) => record.features.gamesPlayed), [null, null]);
});

test('rejects duplicate team-game records and invalid core fields without adding them to history', () => {
  const first = postgame('2025_01_ARI_NYG', 2025, 1, '2025-09-07');
  const bad = postgame('2025_02_ARI_LA', 2025, 2, '2025-09-14', { pointsFor: null });
  const next = postgame('2025_03_ARI_SEA', 2025, 3, '2025-09-21');
  const { accepted, rejected } = deriveTeamPregame([first, first, bad, next]);
  assert.deepEqual(rejected.map(({ gameId, reason }) => ({ gameId, reason })), [
    { gameId: first.gameId, reason: 'duplicate_team_game' },
    { gameId: first.gameId, reason: 'duplicate_team_game' },
    { gameId: bad.gameId, reason: 'missing_core_field' },
  ]);
  assert.equal(accepted.length, 1);
  assert.equal(accepted[0].features.gamesPlayed, null);
});

test('missing optional game metrics do not get fabricated as zero', () => {
  const first = postgame('2025_01_ARI_NYG', 2025, 1, '2025-09-07', {
    offensiveEpaPerPlay: null, turnoverMargin: null, defensiveSackRate: null,
  });
  const second = postgame('2025_02_ARI_LA', 2025, 2, '2025-09-14');
  const { accepted } = deriveTeamPregame([first, second]);
  assert.equal(accepted[1].features.netEpaPerPlay, null);
  assert.equal(accepted[1].features.turnoverMarginPerGame, null);
  assert.equal(accepted[1].features.defensiveSackRate, null);
});

test('malformed kickoff dates reject the row instead of throwing or poisoning history', () => {
  const bad = postgame('2025_01_ARI_NYG', 2025, 1, '2025-99-99');
  const good = postgame('2025_02_ARI_LA', 2025, 2, '2025-09-14');
  const { accepted, rejected } = deriveTeamPregame([bad, good]);
  assert.deepEqual(rejected.map(({ reason }) => reason), ['missing_core_field']);
  assert.equal(accepted[0].features.gamesPlayed, null);
});

test('franchises have independent histories within the same season', () => {
  const arizona = postgame('2025_01_ARI_NYG', 2025, 1, '2025-09-07');
  const newYork = postgame('2025_01_ARI_NYG', 2025, 1, '2025-09-07', {
    team: 'NYG', opponent: 'ARI', franchiseId: 'nflverse-3410',
    opponentFranchiseId: 'nflverse-3800', pointsFor: 14, pointsAgainst: 24,
    result: 'loss',
  });
  const arizonaNext = postgame('2025_02_ARI_LA', 2025, 2, '2025-09-14');
  const newYorkNext = postgame('2025_02_NYG_DAL', 2025, 2, '2025-09-14', {
    team: 'NYG', franchiseId: 'nflverse-3410', pointsFor: 3,
  });
  const { accepted } = deriveTeamPregame([newYorkNext, arizonaNext, newYork, arizona]);
  const byTeam = Object.fromEntries(accepted.filter(({ week }) => week === 2)
    .map(({ team, features }) => [team, features]));
  assert.equal(byTeam.ARI.pointsScoredPerGame, 24);
  assert.equal(byTeam.NYG.pointsScoredPerGame, 14);
  assert.equal(byTeam.ARI.winPercentage, 1);
  assert.equal(byTeam.NYG.winPercentage, 0);
});
