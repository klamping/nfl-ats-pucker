const test = require('node:test');
const assert = require('node:assert/strict');

const { runGameDashboardCli } = require('../src/run-game-dashboard');

test('gathers a requested game and launches the dashboard with its returned snapshot path', async () => {
  const calls = [];
  const dashboard = { address: () => ({ port: 38769 }) };
  const result = await runGameDashboardCli(['--season', '2026', '--game-id', '2026_03_PHI_CHI'], { log() {} }, {
    gatherPregame: async (options) => {
      calls.push(['gather', options]);
      return { snapshotPath: '/tmp/current.json' };
    },
    runDashboardCli: async (argv, output) => {
      calls.push(['dashboard', argv, output]);
      return dashboard;
    },
  });

  assert.equal(result, dashboard);
  assert.deepEqual(calls[0], ['gather', { season: '2026', gameId: '2026_03_PHI_CHI' }]);
  assert.deepEqual(calls[1].slice(0, 2), ['dashboard', ['--input', '/tmp/current.json']]);
});

test('requires one valid season and game ID before gathering or launching', async () => {
  for (const argv of [[], ['--season', '2026'], ['--game-id', 'game'], ['--season', '2026', '--season', '2027', '--game-id', 'game']]) {
    let started = false;
    await assert.rejects(runGameDashboardCli(argv, console, {
      gatherPregame: async () => { started = true; },
      runDashboardCli: async () => { started = true; },
    }), /season and game ID/i);
    assert.equal(started, false);
  }
});

test('does not launch the dashboard when gathering fails', async () => {
  let launched = false;
  await assert.rejects(runGameDashboardCli(['--season', '2026', '--game-id', 'game'], console, {
    gatherPregame: async () => { throw new Error('odds unavailable'); },
    runDashboardCli: async () => { launched = true; },
  }), /odds unavailable/);
  assert.equal(launched, false);
});
