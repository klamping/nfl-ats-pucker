const assert = require('node:assert/strict');
const test = require('node:test');

const { buildTeamIdentity } = require('../src/normalize-team-identity');
const { normalizeTeamPostgame } = require('../src/normalize-team-postgame');

const sourceMetadata = {
  sourceUrl: 'https://github.com/nflverse/nflverse-data/releases/download/stats_team/stats_team_week_2025.csv',
  retrievedAt: '2026-09-27T00:00:00.000Z',
};

function identityRow(team, nflTeamId, full) {
  return {
    season: '2025', team, nfl_team_id: nflTeamId, full,
    location: full, nickname: full,
  };
}

const franchiseLookup = buildTeamIdentity({
  teamRows: [
    identityRow('ARI', '3800', 'Arizona Cardinals'),
    identityRow('NYG', '3410', 'New York Giants'),
  ],
  startSeason: 2025,
  endSeason: 2025,
}).lookup;

function marketGame(overrides = {}) {
  return {
    gameId: '2025_01_ARI_NYG', season: 2025, week: 1,
    gameType: 'REG', sourceGameType: 'REG',
    kickoff: { date: '2025-09-07', time: '13:00', weekday: 'Sunday' },
    awayTeam: 'ARI', homeTeam: 'NYG', awayScore: 17, homeScore: 28,
    ...overrides,
  };
}

function weeklyRow(team, overrides = {}) {
  return {
    season: '2025', week: '1', season_type: 'REG', game_id: '2025_01_ARI_NYG',
    team, opponent_team: team === 'ARI' ? 'NYG' : 'ARI',
    attempts: team === 'ARI' ? '30' : '25',
    carries: team === 'ARI' ? '20' : '30',
    sacks_suffered: team === 'ARI' ? '2' : '1',
    sack_yards_lost: team === 'ARI' ? '12' : '7',
    passing_yards: team === 'ARI' ? '212' : '207',
    rushing_yards: team === 'ARI' ? '100' : '140',
    passing_epa: team === 'ARI' ? '5' : '12',
    rushing_epa: team === 'ARI' ? '-1' : '3',
    interceptions: team === 'ARI' ? '2' : '0',
    lost_fumbles: team === 'ARI' ? '1' : '1',
    ...overrides,
  };
}

function normalize(overrides = {}) {
  return normalizeTeamPostgame({
    marketGames: [marketGame()],
    weeklyStats: [weeklyRow('ARI'), weeklyRow('NYG')],
    franchiseLookup,
    sourceMetadata,
    ...overrides,
  });
}

test('pairs exactly two team-game facts with market scores, opponent defense, raw stats and source provenance', () => {
  const result = normalize();

  assert.deepEqual(result.rejected, []);
  assert.equal(result.accepted.length, 2);
  const [away, home] = result.accepted;
  assert.deepEqual(result.accepted.map(({ team }) => team), ['ARI', 'NYG']);
  assert.equal(away.gameId, '2025_01_ARI_NYG');
  assert.equal(away.season, 2025);
  assert.equal(away.week, 1);
  assert.equal(away.gameType, 'REG');
  assert.deepEqual(away.kickoff, { date: '2025-09-07', time: '13:00', weekday: 'Sunday' });
  assert.equal(away.opponent, 'NYG');
  assert.equal(away.franchiseId, 'nflverse-3800');
  assert.equal(away.opponentFranchiseId, 'nflverse-3410');
  assert.equal(away.pointsFor, 17);
  assert.equal(away.pointsAgainst, 28);
  assert.equal(away.result, 'loss');
  assert.equal(home.pointsFor, 28);
  assert.equal(home.pointsAgainst, 17);
  assert.equal(home.result, 'win');
  assert.equal(home.franchiseId, 'nflverse-3410');
  assert.equal(home.opponentFranchiseId, 'nflverse-3800');
  assert.equal(away.offensiveYardsPerPlay, 300 / 52);
  assert.equal(away.defensiveYardsPerPlay, 340 / 56);
  assert.equal(away.offensiveEpaPerPlay, 4 / 52);
  assert.equal(away.defensiveEpaPerPlay, 15 / 56);
  assert.equal(away.turnoverMargin, -2);
  assert.equal(home.turnoverMargin, 2);
  assert.equal(away.offensiveSackRate, 2 / 32);
  assert.equal(away.defensiveSackRate, 1 / 26);
  assert.deepEqual(away.rawStats, weeklyRow('ARI'));
  assert.deepEqual(home.rawStats, weeklyRow('NYG'));
  assert.equal(away.source, 'nflverse');
  assert.equal(away.sourceUrl, sourceMetadata.sourceUrl);
  assert.equal(away.retrievedAt, sourceMetadata.retrievedAt);
});

test('rejects a game with a missing team row without emitting a partial fact', () => {
  const result = normalize({ weeklyStats: [weeklyRow('ARI')] });
  assert.deepEqual(result.accepted, []);
  assert.deepEqual(result.rejected.map(({ gameId, reason }) => ({ gameId, reason })), [
    { gameId: '2025_01_ARI_NYG', reason: 'incomplete_team_pair' },
  ]);
});

test('rejects duplicate weekly rows on either side instead of selecting one', () => {
  const result = normalize({ weeklyStats: [weeklyRow('ARI'), weeklyRow('NYG'), weeklyRow('ARI')] });
  assert.deepEqual(result.accepted, []);
  assert.deepEqual(result.rejected.map(({ reason }) => reason), ['duplicate_team_row']);
});

test('rejects an opponent mismatch even when both team aliases are present', () => {
  const result = normalize({ weeklyStats: [weeklyRow('ARI', { opponent_team: 'DAL' }), weeklyRow('NYG')] });
  assert.deepEqual(result.accepted, []);
  assert.deepEqual(result.rejected.map(({ reason }) => reason), ['opponent_mismatch']);
});

test('rejects unsupported weekly season_type for the entire pair', () => {
  const result = normalize({ weeklyStats: [weeklyRow('ARI', { season_type: 'PRE' }), weeklyRow('NYG')] });
  assert.deepEqual(result.accepted, []);
  assert.deepEqual(result.rejected.map(({ reason }) => reason), ['unsupported_season_type']);
});

test('retains non-computable metrics as null, including zero-play and zero-dropback denominators', () => {
  const result = normalize({ weeklyStats: [
    weeklyRow('ARI', {
      attempts: '0', carries: '0', sacks_suffered: '0', interceptions: '',
    }),
    weeklyRow('NYG', { sack_yards_lost: '', passing_epa: '' }),
  ] });
  assert.deepEqual(result.rejected, []);
  assert.equal(result.accepted.length, 2);
  const [away, home] = result.accepted;
  assert.equal(away.offensiveYardsPerPlay, null);
  assert.equal(away.offensiveEpaPerPlay, null);
  assert.equal(away.offensiveSackRate, null);
  assert.equal(away.turnoverMargin, null);
  assert.equal(away.defensiveYardsPerPlay, null);
  assert.equal(away.defensiveEpaPerPlay, null);
  assert.equal(home.defensiveYardsPerPlay, null);
  assert.equal(home.defensiveEpaPerPlay, null);
  assert.equal(home.defensiveSackRate, null);
});

test('rejects mismatched season/week and unresolved franchise aliases without producing one-sided facts', () => {
  for (const [stats, expectedReason] of [
    [[weeklyRow('ARI', { week: '2' }), weeklyRow('NYG')], 'game_metadata_mismatch'],
    [[weeklyRow('ARI'), weeklyRow('NYG', { team: 'DAL', opponent_team: 'ARI' })], 'team_mismatch'],
  ]) {
    const result = normalize({ weeklyStats: stats });
    assert.deepEqual(result.accepted, []);
    assert.deepEqual(result.rejected.map(({ reason }) => reason), [expectedReason]);
  }
  const result = normalize({ franchiseLookup: new Map([['2025:ARI', franchiseLookup.get('2025:ARI')]]) });
  assert.deepEqual(result.accepted, []);
  assert.deepEqual(result.rejected.map(({ reason }) => reason), ['unknown_team_alias']);
});

test('rejects duplicate market games and weekly rows with no market game', () => {
  const duplicate = normalize({ marketGames: [marketGame(), marketGame()] });
  assert.deepEqual(duplicate.accepted, []);
  assert.deepEqual(duplicate.rejected.map(({ reason }) => reason), ['duplicate_market_game']);

  const orphan = normalize({ weeklyStats: [
    weeklyRow('ARI'), weeklyRow('NYG'), weeklyRow('ARI', { game_id: 'missing' }),
  ] });
  assert.equal(orphan.accepted.length, 2);
  assert.deepEqual(orphan.rejected.map(({ gameId, reason }) => ({ gameId, reason })), [
    { gameId: 'missing', reason: 'missing_market_game' },
  ]);
});

test('accepts postseason rows paired with a postseason market game, and rejects disagreement', () => {
  const marketGames = [marketGame({ gameType: 'POST', sourceGameType: 'WC' })];
  const weeklyStats = [weeklyRow('ARI', { season_type: 'POST' }), weeklyRow('NYG', { season_type: 'POST' })];
  const result = normalize({ marketGames, weeklyStats });
  assert.deepEqual(result.rejected, []);
  assert.deepEqual(result.accepted.map(({ gameType }) => gameType), ['POST', 'POST']);

  const mismatch = normalize({ marketGames });
  assert.deepEqual(mismatch.accepted, []);
  assert.deepEqual(mismatch.rejected.map(({ reason }) => reason), ['game_type_mismatch']);
});

test('rejects a market game without a score rather than inventing points', () => {
  const result = normalize({ marketGames: [marketGame({ homeScore: null })] });
  assert.deepEqual(result.accepted, []);
  assert.deepEqual(result.rejected.map(({ reason }) => reason), ['missing_score']);
});
