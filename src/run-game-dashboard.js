const { gatherPregame } = require('./gather-pregame');
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
  if (!options['--season'] || !options['--game-id'] || argv.length !== 4) {
    throw new Error('A valid season and game ID are required');
  }
  return { season: options['--season'], gameId: options['--game-id'] };
}

async function runGameDashboardCli(argv = process.argv.slice(2), output = console, dependencies = {}) {
  const { season, gameId } = parseCli(argv);
  const gather = dependencies.gatherPregame || gatherPregame;
  const launch = dependencies.runDashboardCli || runDashboardCli;
  const result = await gather({ season, gameId });
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
