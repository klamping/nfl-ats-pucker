const { downloadNflverseGames } = require('./nflverse-client');
const { gatherPregame, nflverseKickoffToUtc } = require('./gather-pregame');
const { createOddsApiClient, loadTheOddsApiKey } = require('./odds-api-client');
const { normalizeNflverseGame } = require('./normalize-nflverse-game');
const { gatherLineupContext } = require('./lineup-context');
const { createNflLineupClient } = require('./nfl-lineup-client');
const { createOurladsDepthChartClient } = require('./ourlads-depth-chart-client');
const { createNflverseRosterDataClient } = require('./nflverse-roster-data-client');
const { gatherRosterImpacts } = require('./roster-impact-service');

function parseCli(argv) {
  if (argv.length !== 4) throw new Error('A valid season and week are required');
  const options = {};
  for (let index = 0; index < argv.length; index += 2) {
    const option = argv[index];
    const value = argv[index + 1];
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
  return { season, week };
}

async function runWeekDashboardCli(argv = process.argv.slice(2), output = console, dependencies = {}) {
  const { season, week } = parseCli(argv);
  const currentTime = dependencies.now ? dependencies.now() : new Date();
  if (!(currentTime instanceof Date) || !Number.isFinite(currentTime.getTime())) throw new Error('The current clock must return a valid Date');
  const nflverseClient = dependencies.nflverseClient || { downloadNflverseGames };
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
  const lineups = new Map(await Promise.all(teams.map(async (team) => {
    try {
      const context = await gatherLineup({ ...lineupDependencies, team, outputRoot: dependencies.outputRoot, now: buildClock });
      return [team, context];
    } catch {
      return [team, { team, official: { status: 'unavailable', source: 'nfl.com' },
        depthChart: { status: 'unavailable', source: 'ourlads' } }];
    }
  }))); 
  let rosterData = null;
  try {
    const client = dependencies.rosterDataClient || createNflverseRosterDataClient({ fetchImpl: dependencies.fetchImpl });
    rosterData = (await client.loadSeasons({ seasons: [season - 1, season], scheduleRows: scheduleDownload.rows, outputRoot: dependencies.outputRoot })).seasons;
  } catch {}
  let oddsClient = dependencies.oddsClient;
  const games = [];
  const failures = [];
  for (const target of targets) {
    try {
      const retrospective = Date.parse(nflverseKickoffToUtc(target.kickoff)) < currentTime.getTime();
      if (!retrospective && !oddsClient) oddsClient = createOddsApiClient({
        apiKey: dependencies.apiKey || loadTheOddsApiKey({ envPath: dependencies.envPath }), fetchImpl: dependencies.fetchImpl,
      });
      const result = await gather({ season, gameId: target.gameId, retrospective, oddsClient: retrospective ? undefined : oddsClient,
        scheduleDownload, outputRoot: dependencies.outputRoot });
       const enrich = async (team) => {
         const context = lineups.get(team);
         if (!rosterData) return context;
         try { return { ...context, impacts: await (dependencies.gatherRosterImpacts || gatherRosterImpacts)({ team,
           kickoff: nflverseKickoffToUtc(target.kickoff), targetSeason: season, lineup: context, rosterData }) }; } catch { return context; }
       };
       games.push({ ...result.snapshot, lineup: { home: await enrich(target.homeTeam), away: await enrich(target.awayTeam) } });
    } catch {
      failures.push({ gameId: target.gameId, message: 'Unable to gather game' });
    }
  }
  const createWeekDashboardServer = dependencies.createWeekDashboardServer || require('./week-dashboard-server').createWeekDashboardServer;
  const server = await createWeekDashboardServer({ season, week, games, failures, port: dependencies.port ?? 3000 });
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
