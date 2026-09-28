const assert = require('node:assert/strict');
const test = require('node:test');

const { buildTeamIdentity } = require('../src/normalize-team-identity');
const { normalizeTeamPostgame } = require('../src/normalize-team-postgame');
const { deriveTeamPregame } = require('../src/derive-team-pregame');

const sourceMetadata = {
  sourceUrl: 'https://github.com/nflverse/nflverse-data/releases/download/stats_team/stats_team_week_2025.csv',
  retrievedAt: '2026-09-27T00:00:00.000Z',
};

function identityRow(team, nflTeamId, full) {
  return {
    season: '2025', team, nfl_team_id: nflTeamId, full,
    location: full, nickname: full,
    conference: 'NFC', division: 'NFC West',
    team_color: '#000000', team_color2: '#FFFFFF',
    team_logo_espn: `https://example.test/${team}.png`,
    team_logo_wikipedia: `https://example.test/${team}.svg`,
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
    passing_20: team === 'ARI' ? '3' : '4',
    rushing_10: team === 'ARI' ? '4' : '5',
    passing_cpoe: team === 'ARI' ? '1.5' : '-0.5',
    passing_interceptions: team === 'ARI' ? '2' : '0',
    penalty_yards: team === 'ARI' ? '25' : '40',
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
  assert.equal(away.passingEpaPerDropback, 5 / 32);
  assert.equal(away.rushingEpaPerCarry, -1 / 20);
  assert.equal(away.explosivePlayRate, 7 / 52);
  assert.equal(away.passingCpoe, 1.5);
  assert.equal(away.interceptionRate, 2 / 30);
  assert.equal(away.rushingYardsPerCarry, 5);
  assert.equal(away.passingExplosiveRate, 3 / 32);
  assert.equal(away.rushingExplosiveRate, 4 / 20);
  assert.equal(away.penaltyYardsPerGame, 25);
  assert.deepEqual(away.rawStats, weeklyRow('ARI'));
  assert.deepEqual(home.rawStats, weeklyRow('NYG'));
  assert.equal(away.source, 'nflverse');
  assert.equal(away.sourceUrl, sourceMetadata.sourceUrl);
  assert.equal(away.retrievedAt, sourceMetadata.retrievedAt);
});

test('reconciles known cross-era aliases to seasonal franchise aliases while retaining source aliases', () => {
  const oldLookup = buildTeamIdentity({
    teamRows: [
      { ...identityRow('OAK', '2520', 'Oakland Raiders'), season: '2005', location: 'Oakland', nickname: 'Raiders' },
      { ...identityRow('SD', '4400', 'San Diego Chargers'), season: '2005', location: 'San Diego', nickname: 'Chargers' },
    ],
    startSeason: 2005,
    endSeason: 2005,
  }).lookup;
  const legacyMarket = marketGame({ gameId: '2005_01_OAK_SD', season: 2005, awayTeam: 'OAK', homeTeam: 'SD', week: 1 });
  const sourceRows = [
    weeklyRow('LV', { season: '2005', game_id: '2005_01_OAK_SD', opponent_team: 'LAC' }),
    weeklyRow('LAC', { season: '2005', game_id: '2005_01_OAK_SD', opponent_team: 'LV' }),
  ];

  const result = normalizeTeamPostgame({ marketGames: [legacyMarket], weeklyStats: sourceRows, franchiseLookup: oldLookup, sourceMetadata });

  assert.deepEqual(result.rejected, []);
  assert.deepEqual(result.accepted.map(({ team, opponent }) => [team, opponent]), [['OAK', 'SD'], ['SD', 'OAK']]);
  assert.deepEqual(result.accepted.map(({ sourceTeamAlias, sourceOpponentAlias }) => [sourceTeamAlias, sourceOpponentAlias]), [['LV', 'LAC'], ['LAC', 'LV']]);
  assert.deepEqual(result.accepted.map(({ rawStats }) => rawStats.team), ['LV', 'LAC']);

  const ramsLookup = buildTeamIdentity({
    teamRows: [
      { ...identityRow('STL', '2510', 'St. Louis Rams'), season: '2015', location: 'St. Louis', nickname: 'Rams' },
      { ...identityRow('ARI', '3800', 'Arizona Cardinals'), season: '2015', location: 'Arizona', nickname: 'Cardinals' },
    ],
    startSeason: 2015,
    endSeason: 2015,
  }).lookup;
  const ramsMarket = marketGame({ gameId: '2015_01_STL_ARI', season: 2015, awayTeam: 'STL', homeTeam: 'ARI' });
  const ramsStats = [
    weeklyRow('LA', { season: '2015', game_id: '2015_01_STL_ARI', opponent_team: 'ARI' }),
    weeklyRow('ARI', { season: '2015', game_id: '2015_01_STL_ARI', opponent_team: 'LA' }),
  ];
  const rams = normalizeTeamPostgame({ marketGames: [ramsMarket], weeklyStats: ramsStats, franchiseLookup: ramsLookup, sourceMetadata });
  assert.deepEqual(rams.rejected, []);
  assert.deepEqual(rams.accepted.map(({ team, sourceTeamAlias }) => [team, sourceTeamAlias]), [['STL', 'LA'], ['ARI', 'ARI']]);
});

test('handles signed live sack yards and turnover aliases once, and carries corrected net YPP into pregame', () => {
  const liveRows = [
    weeklyRow('ARI', {
      sack_yards_lost: '-12', interceptions: '', lost_fumbles: '',
      passing_interceptions: '2', fumbles_lost_total: '1',
    }),
    weeklyRow('NYG', {
      sack_yards_lost: '-7', interceptions: '', lost_fumbles: '',
      passing_interceptions: '0', fumbles_lost_total: '1',
    }),
  ];
  const result = normalize({ weeklyStats: liveRows });

  assert.deepEqual(result.rejected, []);
  const [away, home] = result.accepted;
  assert.equal(away.offensiveYardsPerPlay, 300 / 52);
  assert.equal(away.defensiveYardsPerPlay, 340 / 56);
  assert.equal(home.offensiveYardsPerPlay, 340 / 56);
  assert.equal(home.defensiveYardsPerPlay, 300 / 52);
  assert.equal(away.turnoverMargin, -2);
  assert.equal(home.turnoverMargin, 2);
  assert.equal(away.rawStats.sack_yards_lost, '-12');
  assert.equal(away.rawStats.passing_interceptions, '2');
  assert.equal(away.rawStats.fumbles_lost_total, '1');

  const laterAwayGame = {
    ...away,
    gameId: '2025_02_ARI_NYG',
    week: 2,
    kickoff: { date: '2025-09-14', time: '13:00' },
  };
  const pregame = deriveTeamPregame([...result.accepted, laterAwayGame]);
  const secondWeek = pregame.accepted.find(({ gameId }) => gameId === laterAwayGame.gameId);
  assert.equal(secondWeek.features.netYardsPerPlay, (300 / 52) - (340 / 56));
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
      passing_interceptions: '',
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
  assert.equal(away.passingEpaPerDropback, null);
  assert.equal(away.rushingEpaPerCarry, null);
  assert.equal(away.explosivePlayRate, null);
  assert.equal(away.passingCpoe, 1.5);
  assert.equal(away.interceptionRate, null);
  assert.equal(away.rushingYardsPerCarry, null);
  assert.equal(away.passingExplosiveRate, null);
  assert.equal(away.rushingExplosiveRate, null);
  assert.equal(away.penaltyYardsPerGame, 25);
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
