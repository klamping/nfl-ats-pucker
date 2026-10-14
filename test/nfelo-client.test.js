const test = require('node:test');
const assert = require('node:assert/strict');

const { loadNfeloData, buildNfeloContext } = require('../src/nfelo-client');

const ELO_SNAPSHOT = `season,week,team,nfelo_base,qb_adj,nfelo,pts_vs_avg
2026,2,CHI,1500,4,1504,0.4
2026,3,CHI,1510,5,1515,1.2
2026,3,PHI,1600,-3,1597,3.5
`;
const NFELO_GAMES = `game_id,starting_nfelo_home,starting_nfelo_away,nfelo_home_line_close,nfelo_home_probability_close,nfelo_home_cover_prob_close,nfelo_away_cover_prob_close
2026_03_CHI_PHI,1515,1597,-2.5,0.61,0.52,0.48
`;

function input(overrides = {}) {
  return {
    gameId: '2026_03_CHI_PHI', season: 2026, week: 3, homeTeam: 'PHI', awayTeam: 'CHI',
    currentOdds: { consensusSpreadHome: -3 },
    ...overrides,
  };
}

test('loads both NFLelo files concurrently and builds a safe target context', async () => {
  const calls = [];
  let releaseGames;
  const gamesStarted = new Promise((resolve) => { releaseGames = resolve; });
  const fetchImpl = async (url) => {
    calls.push(url);
    if (url.endsWith('elo_snapshot.csv')) return { ok: true, text: async () => ELO_SNAPSHOT };
    await gamesStarted;
    return { ok: true, text: async () => NFELO_GAMES };
  };

  const loading = loadNfeloData({ fetchImpl, now: () => new Date('2026-10-14T12:00:00.000Z') });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(calls.length, 2);
  releaseGames();
  const nfeloData = await loading;

  assert.equal(nfeloData.retrievedAt, '2026-10-14T12:00:00.000Z');
  assert.deepEqual(buildNfeloContext({ input: input(), nfeloData }), {
    status: 'ready', retrievedAt: '2026-10-14T12:00:00.000Z',
    projection: {
      homeSpread: -2.5, awaySpread: 2.5, homeWinProbability: 0.61,
      homeCoverProbability: 0.52, awayCoverProbability: 0.48, marketDifference: 0.5,
    },
    teams: {
      home: { team: 'PHI', nfelo: 1597, base: 1600, qbAdjustment: -3, pointsVsAverage: 3.5 },
      away: { team: 'CHI', nfelo: 1515, base: 1510, qbAdjustment: 5, pointsVsAverage: 1.2 },
    },
  });
});

test('rejects unavailable, malformed, and non-finite NFLelo source data', async () => {
  const source = (ratings, games) => async (url) => ({ ok: !url.endsWith('elo_snapshot.csv'), text: async () =>
    url.endsWith('elo_snapshot.csv') ? ratings : games });
  await assert.rejects(loadNfeloData({ fetchImpl: source(ELO_SNAPSHOT, NFELO_GAMES) }), /unavailable/);
  await assert.rejects(loadNfeloData({ fetchImpl: async () => { throw new Error('network'); } }), /network/);
  await assert.rejects(loadNfeloData({ fetchImpl: async (url) => ({ ok: true, text: async () =>
    url.endsWith('elo_snapshot.csv') ? 'season,team\n2026,CHI\n' : NFELO_GAMES }) }), /headers/);
  await assert.rejects(loadNfeloData({ fetchImpl: async (url) => ({ ok: true, text: async () =>
    url.endsWith('elo_snapshot.csv') ? ELO_SNAPSHOT.replace('1510', 'not-a-number') : NFELO_GAMES }) }), /rating row/);
});

test('matches known aliases but rejects ambiguous games and unavailable ratings', () => {
  const data = {
    retrievedAt: '2026-10-14T12:00:00.000Z',
    games: [{ season: 2026, week: 3, homeFranchiseId: 'nflverse-2520', awayFranchiseId: 'nflverse-4400',
      homeSpread: -1, homeWinProbability: 0.55, homeCoverProbability: 0.51, awayCoverProbability: 0.49 }],
    ratings: [
      { season: 2026, week: 2, franchiseId: 'nflverse-2520', nfelo: 1400, base: 1390, qbAdjustment: 10, pointsVsAverage: -2 },
      { season: 2026, week: 3, franchiseId: 'nflverse-2520', nfelo: 1500, base: 1490, qbAdjustment: 10, pointsVsAverage: 0 },
      { season: 2026, week: 3, franchiseId: 'nflverse-4400', nfelo: 1500, base: 1490, qbAdjustment: 10, pointsVsAverage: 0 },
    ],
  };
  const target = input({ gameId: '2026_03_SD_OAK', homeTeam: 'LV', awayTeam: 'LAC' });
  assert.deepEqual(buildNfeloContext({ input: target, nfeloData: data }).teams.home,
    { team: 'LV', nfelo: 1500, base: 1490, qbAdjustment: 10, pointsVsAverage: 0 });
  assert.deepEqual(buildNfeloContext({ input: target, nfeloData: { ...data, games: [...data.games, data.games[0]] } }),
    { status: 'unavailable', reason: 'game_unavailable' });
  assert.deepEqual(buildNfeloContext({ input: target, nfeloData: { ...data,
    ratings: data.ratings.map((rating) => ({ ...rating, week: 4 })) } }),
  { status: 'unavailable', reason: 'team_unavailable' });
  assert.deepEqual(buildNfeloContext({ input: target, nfeloData: { ...data,
    ratings: data.ratings.map((rating) => ({ ...rating, season: 2025 })) } }),
  { status: 'unavailable', reason: 'team_unavailable' });
});

test('projects no raw NFLelo fields into a ready context', async () => {
  const nfeloData = await loadNfeloData({ fetchImpl: async (url) => ({ ok: true, text: async () =>
    url.endsWith('elo_snapshot.csv') ? ELO_SNAPSHOT : NFELO_GAMES }), now: () => new Date('2026-10-14T12:00:00.000Z') });
  const context = buildNfeloContext({ input: input(), nfeloData });
  assert.deepEqual(Object.keys(context).sort(), ['projection', 'retrievedAt', 'status', 'teams']);
  assert.deepEqual(Object.keys(context.projection).sort(), ['awayCoverProbability', 'awaySpread', 'homeCoverProbability',
    'homeSpread', 'homeWinProbability', 'marketDifference']);
  assert.deepEqual(Object.keys(context.teams.home).sort(), ['base', 'nfelo', 'pointsVsAverage', 'qbAdjustment', 'team']);
  assert.equal(JSON.stringify(context).includes('raw.githubusercontent.com'), false);
});
