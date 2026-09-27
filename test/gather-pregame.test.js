const assert = require('node:assert/strict');
const defaultFileSystem = require('node:fs/promises');
const { mkdtemp, readdir, readFile, rm } = require('node:fs/promises');
const { tmpdir } = require('node:os');
const path = require('node:path');
const test = require('node:test');

const { gatherPregame } = require('../src/gather-pregame');

const season = 2026;
const sourceUrl = 'https://example.test/games.csv';
const retrievedAt = '2026-09-27T12:00:00.000Z';
const targetKickoff = '2026-09-27T21:00:00.000Z';

function identityRow(team, id) {
  return { season, team, nfl_team_id: id, full: team, location: team, nickname: team,
    conference: 'NFC', division: 'East', team_color: '#000000', team_color2: '#FFFFFF',
    team_logo_espn: `https://example.test/${team}.png`, team_logo_wikipedia: `https://example.test/${team}.svg` };
}

function game(gameId, date, time, awayScore, homeScore) {
  return { game_id: gameId, season: String(season), week: '3', game_type: 'REG',
    gameday: date, gametime: time, away_team: 'DAL', home_team: 'PHI',
    away_score: awayScore, home_score: homeScore, spread_line: '3.5', total_line: '45.5' };
}

function statsFor(gameId, week = '2') {
  return [
    { season: String(season), week, team: 'DAL', opponent_team: 'PHI', season_type: 'REG', game_id: gameId,
      attempts: '20', carries: '10', passing_yards: '200', rushing_yards: '50', passing_epa: '2', rushing_epa: '1',
      sacks_suffered: '1', sack_yards_lost: '5', interceptions: '0', lost_fumbles: '0' },
    { season: String(season), week, team: 'PHI', opponent_team: 'DAL', season_type: 'REG', game_id: gameId,
      attempts: '20', carries: '10', passing_yards: '180', rushing_yards: '70', passing_epa: '1', rushing_epa: '2',
      sacks_suffered: '2', sack_yards_lost: '8', interceptions: '1', lost_fumbles: '0' },
  ];
}

async function fixture(overrides = {}) {
  const outputRoot = await mkdtemp(path.join(tmpdir(), 'gather-pregame-'));
  const prior = game('prior', '2026-09-20', '17:00', '20', '24');
  prior.week = '2';
  const simultaneous = game('simultaneous', '2026-09-27', '17:00', '10', '10');
  const later = game('later', '2026-09-27', '20:00', '10', '10');
  const target = game('target-id', '2026-09-27', '17:00', '', '');
  const schedule = [prior, simultaneous, later, target];
  const stats = [...statsFor('prior', '2'), ...statsFor('simultaneous', '3'), ...statsFor('later', '3')];
  const calls = { seasons: [], odds: 0 };
  const nflverseClient = {
    async downloadNflverseGames() { return { csv: 'schedule csv', rows: overrides.schedule || schedule, sourceUrl, retrievedAt }; },
    async downloadNflverseTeams() { return { csv: 'identity csv', rows: [identityRow('DAL', '1200'), identityRow('PHI', '3700')], sourceUrl: 'https://example.test/teams.csv', retrievedAt }; },
    async downloadNflverseWeeklyTeamStats({ seasons }) {
      calls.seasons.push(...seasons);
      return seasons.map((value) => ({ season: value, csv: 'stats csv', rows: stats, sourceUrl: 'https://example.test/stats.csv', retrievedAt }));
    },
  };
  const oddsPayload = [{ id: 'event', home_team: 'PHI', away_team: 'DAL', commence_time: targetKickoff,
    bookmakers: [{ key: 'book-a', markets: [{ key: 'spreads', outcomes: [
      { name: 'PHI', point: -3 }, { name: 'DAL', point: 3 },
    ] }] }] }];
  const oddsClient = {
    async fetchNflSpreads() { calls.odds++; return { response: oddsPayload, retrievedAt, source: 'the-odds-api' }; },
  };
  const result = { outputRoot, calls, nflverseClient, oddsClient };
  if (overrides.nflverseClient) result.nflverseClient = overrides.nflverseClient;
  if (overrides.oddsClient) result.oddsClient = overrides.oddsClient;
  return result;
}

test('resolves target by ID and builds a historical-schema snapshot using only earlier finals', async (t) => {
  const context = await fixture();
  t.after(() => rm(context.outputRoot, { recursive: true, force: true }));
  const result = await gatherPregame({ season, gameId: 'target-id', ...context });

  assert.equal(result.snapshot.gameId, 'target-id');
  assert.equal(result.snapshot.closingSpreadHome, -3);
  assert.deepEqual(result.snapshot.currentOdds, {
    provider: 'the-odds-api', retrievedAt, contributingBooks: 1, homeSpreads: [-3], consensusSpreadHome: -3,
  });
  assert.deepEqual(Object.keys(result.snapshot).sort(), [
    'awayPregame', 'awayTeam', 'closingSpreadHome', 'closingTotal', 'currentOdds', 'gameId', 'gameType', 'homePregame', 'homeTeam',
    'kickoff', 'retrievedAt', 'season', 'source', 'sourceGameType', 'sourceUrl', 'spreadOrientation', 'week',
  ].sort());
  const featureFields = [
    'gamesPlayed', 'wins', 'losses', 'winPercentage', 'pointsScoredPerGame', 'pointsAllowedPerGame',
    'netYardsPerPlay', 'netEpaPerPlay', 'turnoverMarginPerGame', 'offensiveSackRate', 'defensiveSackRate', 'restDays',
  ].sort();
  assert.deepEqual(Object.keys(result.snapshot.homePregame).sort(), featureFields);
  assert.deepEqual(Object.keys(result.snapshot.awayPregame).sort(), featureFields);
  assert.equal(result.snapshot.homePregame.gamesPlayed, 1);
  assert.equal(result.snapshot.awayPregame.gamesPlayed, 1);
  assert.equal(context.calls.odds, 1);
  assert.deepEqual(context.calls.seasons, [season]);
  assert.equal(result.rawPaths.length, 1);
  assert.match(result.snapshotPath, /data[\/]current[\/]target-id-.*\.json$/);
  assert.deepEqual(JSON.parse(await readFile(result.snapshotPath, 'utf8')), result.snapshot);
  assert.equal((await readdir(path.join(context.outputRoot, 'data', 'raw', 'odds-api'))).length, 1);
});

for (const scenario of ['missing target', 'invalid target kickoff', 'odds mismatch', 'missing final stats']) {
  test(`${scenario} failure writes neither snapshot nor provider raw data`, async (t) => {
    const context = await fixture();
    t.after(() => rm(context.outputRoot, { recursive: true, force: true }));
    if (scenario === 'invalid target kickoff') {
      context.nflverseClient.downloadNflverseGames = async () => ({ csv: 'schedule csv', sourceUrl, retrievedAt,
        rows: [game('target-id', '2026-09-27', '', '', '')] });
    }
    if (scenario === 'odds mismatch') {
      context.oddsClient.fetchNflSpreads = async () => ({ response: [], retrievedAt, source: 'the-odds-api' });
    }
    if (scenario === 'missing final stats') {
      context.nflverseClient.downloadNflverseWeeklyTeamStats = async ({ seasons }) => seasons.map((value) => ({ season: value,
        csv: 'stats csv', rows: [], sourceUrl: 'https://example.test/stats.csv', retrievedAt }));
    }
    await assert.rejects(gatherPregame({ season, gameId: scenario === 'missing target' ? 'absent' : 'target-id', ...context }));
    await assert.rejects(readdir(path.join(context.outputRoot, 'data', 'current')));
    await assert.rejects(readdir(path.join(context.outputRoot, 'data', 'raw')));
  });
}

test('snapshot write failure removes the already staged odds provider capture', async (t) => {
  const context = await fixture();
  t.after(() => rm(context.outputRoot, { recursive: true, force: true }));
  const fileSystem = {
    ...defaultFileSystem,
    async writeFile(filename, contents, options) {
      if (String(filename).includes(`${path.sep}data${path.sep}current${path.sep}`)) {
        throw new Error('injected snapshot write failure');
      }
      return defaultFileSystem.writeFile(filename, contents, options);
    },
  };

  await assert.rejects(gatherPregame({ season, gameId: 'target-id', ...context, fileSystem }), /injected snapshot write failure/);
  assert.deepEqual(await readdir(path.join(context.outputRoot, 'data', 'raw', 'odds-api')), []);
  assert.deepEqual(await readdir(path.join(context.outputRoot, 'data', 'current')), []);
});
