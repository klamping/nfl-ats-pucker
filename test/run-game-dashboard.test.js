const test = require('node:test');
const assert = require('node:assert/strict');

const { runGameDashboardCli } = require('../src/run-game-dashboard');

test('gathers a requested game and launches the dashboard with its returned snapshot path', async () => {
  const calls = [];
  const dashboard = { address: () => ({ port: 38769 }) };
  const result = await runGameDashboardCli(['--season', '2026', '--game-id', '2026_03_PHI_CHI'], { log() {} }, {
    runGatherCli: async (argv, output) => {
      calls.push(['gather', argv, output]);
      return { snapshotPath: '/tmp/current.json' };
    },
    runDashboardCli: async (argv, output) => {
      calls.push(['dashboard', argv, output]);
      return dashboard;
    },
  });

  assert.equal(result, dashboard);
  assert.deepEqual(calls[0].slice(0, 2), ['gather', ['--season', '2026', '--game-id', '2026_03_PHI_CHI']]);
  assert.deepEqual(calls[1].slice(0, 2), ['dashboard', ['--input', '/tmp/current.json']]);
});

test('forwards the retrospective flag to gathering before launching the dashboard', async () => {
  const calls = [];
  await runGameDashboardCli(['--season', '2026', '--game-id', '2026_03_PHI_CHI', '--retrospective'], { log() {} }, {
    runGatherCli: async (argv) => {
      calls.push(argv);
      return { snapshotPath: '/tmp/current.json' };
    },
    runDashboardCli: async () => { calls.push('dashboard'); },
  });

  assert.deepEqual(calls, [['--season', '2026', '--game-id', '2026_03_PHI_CHI', '--retrospective'], 'dashboard']);
});

test('requires one valid season and game ID before gathering or launching', async () => {
  for (const argv of [[], ['--season', '2026'], ['--game-id', 'game'], ['--season', '2026', '--season', '2027', '--game-id', 'game'], ['--season', 'not-a-year', '--game-id', 'game'], ['--season', '2004', '--game-id', 'game'], ['--season', '2026', '--game-id', 'not a game id'], ['--season', '2026', '--game-id', 'game', '--retrospective', '--retrospective'], ['--season', '2026', '--game-id', 'game', '--retrospective', 'true']]) {
    let started = false;
    await assert.rejects(runGameDashboardCli(argv, console, {
      runGatherCli: async () => { started = true; },
      runDashboardCli: async () => { started = true; },
    }), /season and game ID/i);
    assert.equal(started, false);
  }
});

test('does not launch the dashboard when gathering fails', async () => {
  let launched = false;
  await assert.rejects(runGameDashboardCli(['--season', '2026', '--game-id', 'game', '--retrospective'], console, {
    runGatherCli: async (argv) => {
      assert.deepEqual(argv, ['--season', '2026', '--game-id', 'game', '--retrospective']);
      throw new Error('retrospective gathering failed');
    },
    runDashboardCli: async () => { launched = true; },
  }), /retrospective gathering failed/);
  assert.equal(launched, false);
});

test('forwards a custom port only to the dashboard, including ephemeral port zero', async () => {
  for (const port of ['3001', '0', '65535']) {
    await runGameDashboardCli(['--port', port, '--season', '2026', '--game-id', 'game', '--retrospective'], { log() {} }, {
      runGatherCli: async (argv) => {
        assert.deepEqual(argv, ['--season', '2026', '--game-id', 'game', '--retrospective']);
        return { snapshotPath: '/tmp/current.json' };
      },
      runDashboardCli: async (argv) => {
        assert.deepEqual(argv, ['--input', '/tmp/current.json', '--port', port]);
      },
    });
  }
});

test('rejects invalid game dashboard ports before gathering', async () => {
  for (const extra of [['--port'], ['--port', ''], ['--port', '-1'], ['--port', '65536'],
    ['--port', '1.5'], ['--port', 'abc'], ['--port', '1e3'], ['--port', '0', '--port', '1']]) {
    await assert.rejects(runGameDashboardCli(['--season', '2026', '--game-id', 'game', ...extra], console, {
      runGatherCli: async () => assert.fail('must validate before gathering'),
    }), /port/i);
  }
});
