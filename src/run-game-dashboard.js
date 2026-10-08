const { runCli: runGatherCli } = require('./gather-pregame');
const { runDashboardCli } = require('./dashboard-server');

function parseCli(argv) {
  const options = {};
  for (let index = 0; index < argv.length;) {
    const option = argv[index];
    if (option === '--retrospective') {
      if (options[option] || (argv[index + 1] && !argv[index + 1].startsWith('--'))) {
        throw new Error('A valid season and game ID are required');
      }
      options[option] = true;
      index++;
      continue;
    }
    const value = argv[index + 1];
    if (option === '--port') {
      if (options[option] !== undefined) throw new Error('Only one --port is allowed');
      options[option] = require('./dashboard-port').parseDashboardPort(value);
      index += 2;
      continue;
    }
    if (!['--season', '--game-id'].includes(option) || !value || value.startsWith('--') || options[option] !== undefined) {
      throw new Error('A valid season and game ID are required');
    }
    options[option] = value;
    index += 2;
  }
  const season = Number(options['--season']);
  if (!options['--season'] || !options['--game-id'] ||
      !Number.isInteger(season) || season < 2005 || season > 3000 ||
      !/^[A-Za-z0-9_-]+$/.test(options['--game-id'])) {
    throw new Error('A valid season and game ID are required');
  }
  return { season: options['--season'], gameId: options['--game-id'], retrospective: options['--retrospective'] === true,
    port: options['--port'] };
}

async function runGameDashboardCli(argv = process.argv.slice(2), output = console, dependencies = {}) {
  const { season, gameId, retrospective, port } = parseCli(argv);
  const gather = dependencies.runGatherCli || runGatherCli;
  const launch = dependencies.runDashboardCli || runDashboardCli;
  const gatherArgv = ['--season', season, '--game-id', gameId];
  if (retrospective) gatherArgv.push('--retrospective');
  const result = await gather(gatherArgv, output);
  if (typeof result?.snapshotPath !== 'string' || !result.snapshotPath) {
    throw new Error('Gathering did not return a snapshot path');
  }
  const dashboardArgv = ['--input', result.snapshotPath];
  if (port !== undefined) dashboardArgv.push('--port', String(port));
  return launch(dashboardArgv, output);
}

if (require.main === module) {
  runGameDashboardCli().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}

module.exports = { runGameDashboardCli };
