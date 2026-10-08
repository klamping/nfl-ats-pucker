const { downloadNflverseGames } = require('./nflverse-client');
const { gatherPregame, nflverseKickoffToUtc } = require('./gather-pregame');
const { createOddsApiClient, loadTheOddsApiKey } = require('./odds-api-client');
const { normalizeNflverseGame } = require('./normalize-nflverse-game');
const { gatherLineupContext } = require('./lineup-context');
const { createNflLineupClient } = require('./nfl-lineup-client');
const { createOurladsDepthChartClient } = require('./ourlads-depth-chart-client');

function parseCli(argv) {
  const options = {};
  for (let index = 0; index < argv.length; index += 2) {
    const option = argv[index];
    const value = argv[index + 1];
    if (option === '--port') {
      if (options[option] !== undefined) throw new Error('Only one --port is allowed');
      options[option] = require('./dashboard-port').parseDashboardPort(value);
      continue;
    }
    if (!['--season', '--week'].includes(option) || !value || value.startsWith('--') || options[option] !== undefined) {
      throw new Error('A valid season and week are required');
    }
    options[option] = value;
  }
  const season = Number(options['--season']);
  const week = Number(options['--week']);
  if (!Number.isInteger(season) || season < 2005 || season > 3000 || !Number.isInteger(week) || week < 1) {
    throw new Error('A valid season and week are required');
  }
  return { season, week, ...(options['--port'] !== undefined ? { port: options['--port'] } : {}) };
}

async function runWeekDashboardCli(argv = process.argv.slice(2), output = console, dependencies = {}) {
  const { season, week, port } = parseCli(argv);
  const currentTime = dependencies.now ? dependencies.now() : new Date();
  if (!(currentTime instanceof Date) || !Number.isFinite(currentTime.getTime())) throw new Error('The current clock must return a valid Date');
  const nflverseClient = dependencies.nflverseClient || { downloadNflverseGames };
  output.log(`Downloading nflverse schedule for season ${season}, week ${week}...`);
  const scheduleDownload = await nflverseClient.downloadNflverseGames();
  if (!Array.isArray(scheduleDownload?.rows)) throw new Error('Invalid nflverse schedule download');
  const targets = scheduleDownload.rows.map((row) => normalizeNflverseGame({ ...row,
    away_score: '0', home_score: '0', spread_line: '0' }, {
    sourceUrl: scheduleDownload.sourceUrl, retrievedAt: scheduleDownload.retrievedAt,
  }).accepted).filter((game) => game && game.season === season && game.week === week &&
    ['REG', 'POST'].includes(game.gameType) && hasValidKickoff(game.kickoff));
  const gather = dependencies.gatherPregame || gatherPregame;
  const gatherLineup = dependencies.gatherLineupContext || gatherLineupContext;
  const buildClock = () => new Date(currentTime.getTime());
  const lineupDependencies = {
    nflClient: createNflLineupClient({ fetchImpl: dependencies.fetchImpl, now: buildClock }),
    depthChartClient: createOurladsDepthChartClient({ fetchImpl: dependencies.fetchImpl, now: buildClock }),
    ...dependencies.lineupDependencies,
  };
  const teams = [...new Set(targets.flatMap((game) => [game.awayTeam, game.homeTeam]))];
  output.log(`Schedule loaded: ${targets.length} games.`);
  output.log(`Fetching lineups from NFL.com and Ourlads for ${teams.length} teams...`);
  const lineups = new Map(await Promise.all(teams.map(async (team) => {
    try {
      const context = await gatherLineup({ ...lineupDependencies, team, outputRoot: dependencies.outputRoot, now: buildClock });
      if (context.official.status === 'unavailable') output.log(`${team} NFL.com lineup unavailable; continuing.`);
      if (context.depthChart.status === 'unavailable') output.log(`${team} Ourlads lineup unavailable; continuing.`);
      return [team, context];
    } catch {
      output.log(`${team} lineups unavailable (NFL.com and Ourlads); continuing.`);
      return [team, { team, official: { status: 'unavailable', source: 'nfl.com' },
        depthChart: { status: 'unavailable', source: 'ourlads' } }];
    }
  })));
  let oddsClient = dependencies.oddsClient;
  const games = [];
  const failures = [];
  output.log(`Gathering pregame data for ${targets.length} games...`);
  for (const target of targets) {
    const progress = `${games.length + failures.length + 1}/${targets.length} (${target.gameId})`;
    try {
      const retrospective = Date.parse(nflverseKickoffToUtc(target.kickoff)) < currentTime.getTime();
      if (!retrospective && !oddsClient) oddsClient = createOddsApiClient({
        apiKey: dependencies.apiKey || loadTheOddsApiKey({ envPath: dependencies.envPath }), fetchImpl: dependencies.fetchImpl,
      });
      const result = await gather({ season, gameId: target.gameId, retrospective, oddsClient: retrospective ? undefined : oddsClient,
        scheduleDownload, outputRoot: dependencies.outputRoot });
      games.push({ ...result.snapshot, lineup: { home: lineups.get(target.homeTeam), away: lineups.get(target.awayTeam) } });
    } catch {
      failures.push({ gameId: target.gameId, message: 'Unable to gather game' });
      output.log(`Game ${progress} failed; continuing.`);
    }
  }
  const createWeekDashboardServer = dependencies.createWeekDashboardServer || require('./week-dashboard-server').createWeekDashboardServer;
  output.log(`Starting dashboard server: ${games.length} games ready, ${failures.length} failed...`);
  const server = await createWeekDashboardServer({ season, week, games, failures, port: port ?? dependencies.port ?? 3000 });
  output.log(`http://127.0.0.1:${server.address().port}/`);
  return server;
}

if (require.main === module) {
  runWeekDashboardCli().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}

module.exports = { parseCli, runWeekDashboardCli };

function hasValidKickoff(kickoff) {
  try {
    return Number.isFinite(Date.parse(nflverseKickoffToUtc(kickoff)));
  } catch {
    return false;
  }
}
