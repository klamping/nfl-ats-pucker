const test = require('node:test');
const assert = require('node:assert/strict');

const { parseCli, runWeekDashboardCli } = require('../src/week-dashboard');

const retrievedAt = '2026-09-27T12:00:00.000Z';

function game(gameId, gameType, date, time) {
  return { game_id: gameId, season: '2026', week: '3', game_type: gameType,
    gameday: date, gametime: time, away_team: 'AWY', home_team: 'HME',
    away_score: '', home_score: '', result: '', overtime: '', spread_line: '3.5', total_line: '45.5' };
}

function scheduleDownload(rows) {
  return { csv: 'schedule csv', rows, sourceUrl: 'https://example.test/schedule.csv', retrievedAt };
}

test('parses exactly one valid season and positive week', () => {
  assert.deepEqual(parseCli(['--season', '2026', '--week', '3']), { season: 2026, week: 3 });
  for (const argv of [[], ['--season', '2026'], ['--week', '3'], ['--season', '2004', '--week', '3'],
    ['--season', '2026', '--week', '0'], ['--season', '2026', '--week', '3.5'],
    ['--season', '2026', '--week', '3', '--week', '4'], ['--bad', 'x']]) {
    assert.throws(() => parseCli(argv), /season and week/i);
  }
});

test('orchestrates supported games with shared schedule and isolates failures', async () => {
  const rows = [
    game('past', 'REG', '2026-09-27', '13:00'),
    game('future', 'DIV', '2026-09-27', '17:00'),
    game('unsupported', 'PRE', '2026-09-27', '17:00'),
    game('other-week', 'REG', '2026-09-27', '17:00'),
    game('invalid-kickoff', 'REG', '2026-09-27', 'bad'),
  ];
  rows[3].week = '4';
  const download = scheduleDownload(rows);
  let downloads = 0;
  const gathers = [];
  const launched = [];
  const lines = [];
  const oddsClient = { fetchNflSpreads() {} };
  const server = { address: () => ({ port: 41234 }) };

  const result = await runWeekDashboardCli(['--season', '2026', '--week', '3'], { log: (line) => lines.push(line) }, {
    now: () => new Date('2026-09-27T18:00:00.000Z'),
    nflverseClient: { async downloadNflverseGames() { downloads++; return download; } },
    oddsClient,
    gatherPregame: async (options) => {
      gathers.push(options);
      if (options.gameId === 'past') throw new Error('completed target lacks a line');
      return { snapshot: { gameId: options.gameId }, snapshotPath: `/tmp/${options.gameId}.json` };
    },
    createWeekDashboardServer: async (options) => { launched.push(options); return server; },
  });

  assert.equal(result, server);
  assert.deepEqual(lines, ['http://127.0.0.1:41234/']);
  assert.equal(downloads, 1);
  assert.deepEqual(gathers.map(({ gameId, retrospective, scheduleDownload: shared, oddsClient: odds }) =>
    ({ gameId, retrospective, shared: shared === download, odds: odds === oddsClient })), [
    { gameId: 'past', retrospective: true, shared: true, odds: false },
    { gameId: 'future', retrospective: false, shared: true, odds: true },
  ]);
  assert.deepEqual(launched, [{ season: 2026, week: 3, games: [{ gameId: 'future', lineup: {
    home: { team: 'HME', official: { status: 'unavailable', source: 'nfl.com' }, depthChart: { status: 'unavailable', source: 'ourlads' } },
    away: { team: 'AWY', official: { status: 'unavailable', source: 'nfl.com' }, depthChart: { status: 'unavailable', source: 'ourlads' } },
  } }],
    failures: [{ gameId: 'past', message: 'Unable to gather game' }] }]);
});

test('gathers once per unique supported slate team before game work and shares contexts without hiding games', async () => {
  const rows = [game('first', 'REG', '2026-09-27', '17:00'), game('second', 'REG', '2026-09-27', '20:00'),
    { ...game('unsupported', 'PRE', '2026-09-27', '17:00'), home_team: 'BAD' },
    { ...game('other-week', 'REG', '2026-09-27', '17:00'), week: '4', home_team: 'OTH' },
    { ...game('bad-time', 'REG', '2026-09-27', 'invalid'), home_team: 'INV' }];
  const events = [];
  let serverOptions;
  const home = { team: 'HME', official: { source: 'nfl.com', status: 'unavailable' }, depthChart: { source: 'ourlads', status: 'ready' } };
  await runWeekDashboardCli(['--season', '2026', '--week', '3'], { log() {} }, {
    now: () => new Date('2026-09-27T18:00:00Z'), outputRoot: '/tmp/opencode/lineup-weekly',
    nflverseClient: { downloadNflverseGames: async () => scheduleDownload(rows) }, oddsClient: {},
    gatherLineupContext: async ({ team, outputRoot, now }) => {
      assert.equal(outputRoot, '/tmp/opencode/lineup-weekly');
      assert.equal(now().toISOString(), '2026-09-27T18:00:00.000Z');
      events.push(`lineup:${team}`);
      if (team === 'AWY') throw new Error('private team failure');
      return home;
    },
    gatherPregame: async ({ gameId }) => { events.push(`game:${gameId}`); return { snapshot: { gameId } }; },
    createWeekDashboardServer: async (options) => { serverOptions = options; events.push('server'); return { address: () => ({ port: 41234 }) }; },
  });
  assert.deepEqual(events, ['lineup:AWY', 'lineup:HME', 'game:first', 'game:second', 'server']);
  assert.equal(serverOptions.games.length, 2);
  assert.equal(serverOptions.games[0].lineup.home, home);
  assert.equal(serverOptions.games[1].lineup.home, home);
  assert.deepEqual(serverOptions.games[0].lineup.away, { team: 'AWY',
    official: { source: 'nfl.com', status: 'unavailable' }, depthChart: { source: 'ourlads', status: 'unavailable' } });
});

test('waits for lineup completion before gathering games, creating the server or printing its URL', async () => {
  let release;
  let reached;
  const held = new Promise(resolve => { release = resolve; });
  const started = new Promise(resolve => { reached = resolve; });
  const events = [];
  const pending = runWeekDashboardCli(['--season', '2026', '--week', '3'], { log: line => events.push(line) }, {
    now: () => new Date('2026-09-27T18:00:00Z'), oddsClient: {},
    nflverseClient: { downloadNflverseGames: async () => scheduleDownload([game('held', 'REG', '2026-09-27', '17:00')]) },
    gatherLineupContext: async ({ team }) => { reached(); await held; return { team,
      official: { status: 'unavailable', source: 'nfl.com' }, depthChart: { status: 'unavailable', source: 'ourlads' } }; },
    gatherPregame: async () => { events.push('game'); return { snapshot: { gameId: 'held' } }; },
    createWeekDashboardServer: async () => { events.push('server'); return { address: () => ({ port: 41234 }) }; },
  });
  await started;
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(events, []);
  release();
  await pending;
  assert.deepEqual(events, ['game', 'server', 'http://127.0.0.1:41234/']);
});
