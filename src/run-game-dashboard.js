const { runCli: runGatherCli } = require('./gather-pregame');
const { runDashboardCli } = require('./dashboard-server');

function parseCli(argv) {
  const options = {};
  for (let index = 0; index < argv.length; index += 2) {
    const option = argv[index];
    const value = argv[index + 1];
    if (!['--season', '--game-id'].includes(option) || !value || value.startsWith('--') ||
        options[option] !== undefined) throw new Error('A valid season and game ID are required');
    options[option] = value;
  }
  const season = Number(options['--season']);
  if (!options['--season'] || !options['--game-id'] || argv.length !== 4 ||
      !Number.isInteger(season) || season < 2005 || season > 3000 ||
      !/^[A-Za-z0-9_-]+$/.test(options['--game-id'])) {
    throw new Error('A valid season and game ID are required');
  }
  return { season: options['--season'], gameId: options['--game-id'] };
}

async function runGameDashboardCli(argv = process.argv.slice(2), output = console, dependencies = {}) {
  const { season, gameId } = parseCli(argv);
  const gather = dependencies.runGatherCli || runGatherCli;
  const launch = dependencies.runDashboardCli || runDashboardCli;
  const result = await gather(['--season', season, '--game-id', gameId], output);
  if (typeof result?.snapshotPath !== 'string' || !result.snapshotPath) {
    throw new Error('Gathering did not return a snapshot path');
  }
  return launch(['--input', result.snapshotPath], output);
}

if (require.main === module) {
  runGameDashboardCli().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}

module.exports = { runGameDashboardCli };
