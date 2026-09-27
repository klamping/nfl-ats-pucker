const assert = require('node:assert/strict');
const defaultFileSystem = require('node:fs/promises');
const { mkdtemp, readdir, readFile, rm } = require('node:fs/promises');
const { tmpdir } = require('node:os');
const path = require('node:path');
const test = require('node:test');

const packageJson = require('../package.json');
const { gatherPregame, runCli } = require('../src/gather-pregame');

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
    away_score: awayScore, home_score: homeScore, result: awayScore === '' || homeScore === '' ? '' : String(Number(homeScore) - Number(awayScore)),
    overtime: awayScore === '' || homeScore === '' ? '' : '0', spread_line: '3.5', total_line: '45.5' };
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
  const targetDate = overrides.targetDate || '2026-09-27';
  const targetTime = overrides.targetTime || '17:00';
  const simultaneous = game('simultaneous', targetDate, targetTime, '10', '10');
  const later = game('later', targetDate, '20:00', '10', '10');
  const inProgress = game('in-progress', targetDate, '15:00', '10', '14');
  inProgress.result = '';
  inProgress.overtime = '';
  const target = game(overrides.gameId || 'target-id', targetDate, targetTime, '', '');
  const schedule = [prior, simultaneous, later, inProgress, target];
  const stats = [...statsFor('prior', '2'), ...statsFor('simultaneous', '3'), ...statsFor('later', '3'), ...statsFor('in-progress', '3')];
  const calls = { seasons: [], odds: 0 };
  const nflverseClient = {
    async downloadNflverseGames() { return { csv: 'schedule csv', rows: overrides.schedule || schedule, sourceUrl, retrievedAt }; },
    async downloadNflverseTeams() { return { csv: 'identity csv', rows: [identityRow('DAL', '1200'), identityRow('PHI', '3700')], sourceUrl: 'https://example.test/teams.csv', retrievedAt }; },
    async downloadNflverseWeeklyTeamStats({ seasons }) {
      calls.seasons.push(...seasons);
      return seasons.map((value) => ({ season: value, csv: 'stats csv', rows: stats, sourceUrl: 'https://example.test/stats.csv', retrievedAt }));
    },
  };
  const oddsPayload = [{ id: 'event', home_team: 'PHI', away_team: 'DAL', commence_time: overrides.oddsCommenceTime || targetKickoff,
    bookmakers: [{ key: 'book-a', markets: [{ key: 'spreads', outcomes: [
      { name: 'PHI', point: -3 }, { name: 'DAL', point: 3 },
    ] }] }] }];
  const oddsClient = {
    async fetchNflSpreads() { calls.odds++; return { response: oddsPayload, retrievedAt, source: 'the-odds-api' }; },
  };
  const result = { outputRoot, calls, nflverseClient, oddsClient,
    now: overrides.now || (() => new Date('2026-09-27T12:00:00.000Z')) };
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
  assert.equal(result.snapshot.homePregame.pointsScoredPerGame, 24);
  assert.equal(context.calls.odds, 1);
  assert.deepEqual(context.calls.seasons, [season]);
  assert.equal(result.rawPaths.length, 1);
  assert.match(result.snapshotPath, /data[\/]current[\/]target-id-.*\.json$/);
  assert.deepEqual(JSON.parse(await readFile(result.snapshotPath, 'utf8')), result.snapshot);
  assert.equal((await readdir(path.join(context.outputRoot, 'data', 'raw', 'odds-api'))).length, 1);
});

test('rejects targets that have started or are no longer upcoming using the injected clock', async (t) => {
  const context = await fixture({ now: () => new Date('2026-09-27T21:00:00.000Z') });
  t.after(() => rm(context.outputRoot, { recursive: true, force: true }));

  await assert.rejects(gatherPregame({ season, gameId: 'target-id', ...context }), /target kickoff must be in the future/i);
  assert.equal(context.calls.odds, 0);
  await assert.rejects(readdir(path.join(context.outputRoot, 'data', 'current')));
  await assert.rejects(readdir(path.join(context.outputRoot, 'data', 'raw')));
});

test('matches Eastern kickoff to UTC correctly on both sides of DST transitions', async (t) => {
  for (const example of [
    { targetDate: '2026-03-08', targetTime: '13:00', oddsCommenceTime: '2026-03-08T17:00:00.000Z', now: '2026-03-07T12:00:00Z' },
    { targetDate: '2026-11-01', targetTime: '13:00', oddsCommenceTime: '2026-11-01T18:00:00.000Z', now: '2026-10-31T12:00:00Z' },
  ]) {
    const context = await fixture({ ...example, now: () => new Date(example.now) });
    t.after(() => rm(context.outputRoot, { recursive: true, force: true }));
    const result = await gatherPregame({ season, gameId: 'target-id', ...context });
    assert.equal(result.snapshot.currentOdds.consensusSpreadHome, -3);
  }
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

test('package exposes the pregame gather script', () => {
  assert.equal(packageJson.scripts['gather:pregame'], 'node src/gather-pregame.js');
});

test('pregame gather CLI requires season and game ID before downloading data', async () => {
  const calls = { nflverse: 0, odds: 0 };
  const nflverseClient = {
    async downloadNflverseGames() { calls.nflverse++; throw new Error('should not download without required options'); },
    async downloadNflverseTeams() { calls.nflverse++; throw new Error('should not download without required options'); },
    async downloadNflverseWeeklyTeamStats() { calls.nflverse++; throw new Error('should not download without required options'); },
  };
  const oddsClient = {
    async fetchNflSpreads() { calls.odds++; throw new Error('should not fetch odds without required options'); },
  };

  await assert.rejects(runCli(['--season', String(season)], { log() {} }, { nflverseClient, oddsClient }), /season.*game id/i);
  await assert.rejects(runCli(['--game-id', '2026_03_DAL_PHI'], { log() {} }, { nflverseClient, oddsClient }), /season.*game id/i);
  assert.deepEqual(calls, { nflverse: 0, odds: 0 });
});

test('pregame gather CLI writes count/path-only output without exposing provider details or secrets', async (t) => {
  const context = await fixture({ gameId: '2026_03_DAL_PHI' });
  t.after(() => rm(context.outputRoot, { recursive: true, force: true }));
  const logs = [];
  const secret = 'mock-secret-that-must-not-print';
  const result = await runCli([
    '--season', String(season), '--game-id', '2026_03_DAL_PHI', '--output-root', context.outputRoot,
  ], { log: (line) => logs.push(line) }, { ...context, oddsClient: {
    async fetchNflSpreads() {
      context.calls.odds++;
      return { response: [{ id: `provider-echo-${secret}`, home_team: 'PHI', away_team: 'DAL', commence_time: targetKickoff,
        bookmakers: [{ key: 'book-a', markets: [{ key: 'spreads', outcomes: [
          { name: 'PHI', point: -3 }, { name: 'DAL', point: 3 },
        ] }] }] }], retrievedAt, source: 'the-odds-api' };
    },
  } });

  assert.deepEqual(logs, [`season=2026 gameId=2026_03_DAL_PHI snapshotPath=${result.snapshotPath} rawCaptures=1 contributingBooks=1`]);
  assert.equal(logs.join('\n').includes(secret), false);
  assert.equal(logs.join('\n').includes('homeSpreads'), false);
  assert.equal(logs.join('\n').includes('book-a'), false);
  assert.equal(logs.join('\n').includes('{'), false);
  assert.equal(context.calls.odds, 1);
});
