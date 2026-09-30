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
  const server = { address: () => ({ port: 41234 }) };

  const result = await runWeekDashboardCli(['--season', '2026', '--week', '3'], { log: (line) => lines.push(line) }, {
    now: () => new Date('2026-09-27T18:00:00.000Z'),
    nflverseClient: { async downloadNflverseGames() { downloads++; return download; } },
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
  assert.deepEqual(gathers.map(({ gameId, retrospective, scheduleDownload: shared }) =>
    ({ gameId, retrospective, shared: shared === download })), [
    { gameId: 'past', retrospective: true, shared: true },
    { gameId: 'future', retrospective: false, shared: true },
  ]);
  assert.deepEqual(launched, [{ season: 2026, week: 3, games: [{ gameId: 'future' }],
    failures: [{ gameId: 'past', message: 'Unable to gather game' }] }]);
});
