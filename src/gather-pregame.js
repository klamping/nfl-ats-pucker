const defaultFileSystem = require('node:fs/promises');
const path = require('node:path');

const { downloadNflverseGames } = require('./nflverse-client');
const { downloadNflverseTeams, downloadNflverseWeeklyTeamStats } = require('./nflverse-team-client');
const { loadTheOddsApiKey, createOddsApiClient, findConsensusHomeSpread } = require('./odds-api-client');
const { normalizeNflverseGame } = require('./normalize-nflverse-game');
const { buildTeamIdentity } = require('./normalize-team-identity');
const { normalizeTeamPostgame } = require('./normalize-team-postgame');
const { deriveTeamPregame } = require('./derive-team-pregame');
const { joinTeamPregameToMarkets } = require('./join-team-matchups');

async function gatherPregame({ season, gameId, outputRoot = process.cwd(),
  nflverseClient = defaultNflverseClient(), oddsClient, fileSystem = defaultFileSystem,
  now = () => new Date(), retrospective = false, scheduleDownload } = {}) {
  const targetSeason = Number(season);
  if (!Number.isInteger(targetSeason) || targetSeason < 2005 || targetSeason > 3000 ||
      typeof gameId !== 'string' || !gameId || !/^[A-Za-z0-9_-]+$/.test(gameId)) {
    throw new Error('A valid season and game ID are required');
  }
  validateClients(nflverseClient, oddsClient, retrospective);

  const schedule = scheduleDownload || await nflverseClient.downloadNflverseGames();
  validateDownload(schedule, 'schedule');
  const targetRows = schedule.rows.filter((row) => String(row.game_id ?? row.gameId ?? '') === gameId &&
    Number(row.season) === targetSeason);
  if (targetRows.length !== 1) throw new Error('Target game ID must identify exactly one schedule game');
  const targetRow = targetRows[0];
  const targetMetadata = { sourceUrl: schedule.sourceUrl, retrievedAt: schedule.retrievedAt };
  const normalizedTarget = normalizeNflverseGame(retrospective ? targetRow :
    { ...targetRow, away_score: '0', home_score: '0', spread_line: '0' }, targetMetadata);
  if (!normalizedTarget.accepted || !['REG', 'POST'].includes(normalizedTarget.accepted.gameType) ||
      !validKickoff(normalizedTarget.accepted.kickoff)) {
    throw new Error('Target must be a supported REG/POST game with a valid kickoff');
  }
  const target = normalizedTarget.accepted;
  const targetKickoff = Date.parse(nflverseKickoffToUtc(target.kickoff));
  const currentTime = now();
  if (!(currentTime instanceof Date) || !Number.isFinite(currentTime.getTime())) {
    throw new Error('The current clock must return a valid Date');
  }
  if (retrospective) {
    if (targetSeason !== currentNflSeason(currentTime)) throw new Error('Target must be in the current NFL season');
    if (targetKickoff >= currentTime.getTime()) throw new Error('Target kickoff must be in the past');
    if (!hasFinalScore(targetRow) || !hasFinalResult(targetRow) || !Number.isFinite(Number(targetRow.spread_line))) {
      throw new Error('Retrospective target must be completed with a finite closing spread');
    }
  } else if (targetKickoff <= currentTime.getTime()) {
    throw new Error('Target kickoff must be in the future');
  }

  const teams = await nflverseClient.downloadNflverseTeams();
  validateDownload(teams, 'team identity');
  const identity = buildTeamIdentity({ teamRows: teams.rows, startSeason: targetSeason, endSeason: targetSeason,
    sourceUrl: teams.sourceUrl, sourceUrls: teams.sourceUrls, retrievedAt: teams.retrievedAt });
  if (!identity.lookup.get(`${targetSeason}:${target.awayTeam}`) || !identity.lookup.get(`${targetSeason}:${target.homeTeam}`)) {
    throw new Error('Target teams could not be resolved to current-season franchise identities');
  }

  const finalGames = [];
  for (const row of schedule.rows) {
    if (row === targetRow || Number(row.season) !== targetSeason) continue;
    const kickoff = rowKickoffMillis(row);
    if (!Number.isFinite(kickoff) || kickoff >= targetKickoff || !hasFinalScore(row) || !hasFinalResult(row)) continue;
    const result = normalizeNflverseGame(row, targetMetadata);
    if (result.accepted && ['REG', 'POST'].includes(result.accepted.gameType)) finalGames.push(result.accepted);
  }
  if (new Set(finalGames.map((game) => game.gameId)).size !== finalGames.length) {
    throw new Error('Schedule contains duplicate prior final games');
  }

  const statsDownloads = await nflverseClient.downloadNflverseWeeklyTeamStats({ seasons: [targetSeason] });
  if (!Array.isArray(statsDownloads) || statsDownloads.length !== 1 ||
      statsDownloads[0]?.season !== targetSeason) throw new Error('Invalid nflverse weekly team stats download');
  const statsDownload = statsDownloads[0];
  validateDownload(statsDownload, 'weekly team stats');
  const finalGameIds = new Set(finalGames.map((game) => game.gameId));
  const relevantStats = statsDownload.rows.filter((row) => finalGameIds.has(String(row.game_id ?? '')) &&
    Number(row.season) === targetSeason);
  const postgame = normalizeTeamPostgame({ marketGames: finalGames, weeklyStats: relevantStats,
    franchiseLookup: identity.lookup, sourceMetadata: statsDownload });
  if (postgame.accepted.length !== finalGames.length * 2 || postgame.rejected.length) {
    throw new Error('Prior final games do not have valid matching team statistics');
  }

  const targetMarkers = [target.awayTeam, target.homeTeam].map((team) => ({
    gameId: target.gameId, season: target.season, week: target.week, gameType: target.gameType,
    kickoff: target.kickoff, team, opponent: team === target.homeTeam ? target.awayTeam : target.homeTeam,
    franchiseId: identity.lookup.get(`${targetSeason}:${team}`).franchiseId,
    pointsFor: 0, pointsAgainst: 0, result: 'tie',
    offensiveYardsPerPlay: null, defensiveYardsPerPlay: null, offensiveEpaPerPlay: null,
    defensiveEpaPerPlay: null, turnoverMargin: null, offensiveSackRate: null, defensiveSackRate: null,
    passingEpaPerDropback: null, rushingEpaPerCarry: null, explosivePlayRate: null,
    passingCpoe: null, interceptionRate: null, rushingYardsPerCarry: null,
    passingExplosiveRate: null, rushingExplosiveRate: null, penaltyYardsPerGame: null,
  }));
  const pregame = deriveTeamPregame([...postgame.accepted, ...targetMarkers]);
  const targetPregame = pregame.accepted.filter((record) => record.gameId === target.gameId);
  if (targetPregame.length !== 2) throw new Error('Target pregame features could not be derived');

  let currentOdds;
  let oddsDownload;
  if (retrospective) {
    currentOdds = { provider: 'nflverse', retrievedAt: schedule.retrievedAt,
      consensusSpreadHome: target.closingSpreadHome };
  } else {
    oddsDownload = await oddsClient.fetchNflSpreads();
    if (!oddsDownload || !Array.isArray(oddsDownload.response) || typeof oddsDownload.retrievedAt !== 'string' ||
        !Number.isFinite(Date.parse(oddsDownload.retrievedAt)) || typeof oddsDownload.source !== 'string') {
      throw new Error('Invalid current odds provider response');
    }
    const awayName = findFullName(teams.rows, targetSeason, target.awayTeam);
    const homeName = findFullName(teams.rows, targetSeason, target.homeTeam);
    currentOdds = findConsensusHomeSpread({ response: oddsDownload, target: {
      awayTeam: awayName, homeTeam: homeName,
      kickoff: nflverseKickoffToUtc(target.kickoff),
    } });
  }
  const targetMarket = { ...target, closingSpreadHome: currentOdds.consensusSpreadHome };
  const matchup = joinTeamPregameToMarkets({ marketGames: [targetMarket], pregameRecords: targetPregame });
  if (matchup.accepted.length !== 1 || matchup.rejected.length) throw new Error('Target matchup features failed validation');
  const snapshot = { ...matchup.accepted[0], currentOdds };

  const rawPaths = [];
  if (!retrospective) {
    rawPaths.push(await writeUniqueJson(fileSystem, path.join(outputRoot, 'data', 'raw', 'odds-api'),
      `${safeTimestamp(oddsDownload.retrievedAt)}-capture`, oddsDownload.response));
  }
  let snapshotPath;
  try {
    snapshotPath = await writeUniqueJson(fileSystem, path.join(outputRoot, 'data', 'current'),
      `${gameId}-${safeTimestamp(new Date().toISOString())}`, snapshot);
  } catch (error) {
    await Promise.all(rawPaths.map((rawPath) => fileSystem.unlink(rawPath).catch(() => {})));
    throw error;
  }
  return { snapshot, snapshotPath, rawPaths };
}

function defaultNflverseClient() {
  return { downloadNflverseGames, downloadNflverseTeams, downloadNflverseWeeklyTeamStats };
}

async function runCli(argv = process.argv.slice(2), output = console, dependencies = {}) {
  const options = parseCliOptions(argv);
  if (options.season === undefined || options.gameId === undefined) {
    throw new Error('A valid season and game ID are required');
  }
  const nflverseClient = dependencies.nflverseClient || defaultNflverseClient();
  const oddsClient = options.retrospective ? dependencies.oddsClient : dependencies.oddsClient || createOddsApiClient({
    apiKey: dependencies.apiKey || loadTheOddsApiKey({ envPath: dependencies.envPath }),
    fetchImpl: dependencies.fetchImpl,
  });
  const result = await gatherPregame({
    season: options.season,
    gameId: options.gameId,
    outputRoot: options.outputRoot,
    nflverseClient,
    oddsClient,
    fileSystem: dependencies.fileSystem,
    now: dependencies.now,
    retrospective: options.retrospective,
  });
  const contributingBooks = options.retrospective ? 'n/a' : result.snapshot.currentOdds.contributingBooks;
  output.log(`season=${Number(options.season)} gameId=${options.gameId} snapshotPath=${result.snapshotPath} rawCaptures=${result.rawPaths.length} contributingBooks=${contributingBooks}`);
  return result;
}

function parseCliOptions(argv) {
  const args = [...argv];
  const options = {};
  while (args.length) {
    const argument = args.shift();
    if (argument === '--retrospective') {
      if (options.retrospective) throw new Error('--retrospective may be specified only once');
      if (args[0] !== undefined && !args[0].startsWith('--')) throw new Error('--retrospective does not accept a value');
      options.retrospective = true;
      continue;
    }
    if (!['--season', '--game-id', '--output-root'].includes(argument)) throw new Error(`Unknown option: ${argument}`);
    const value = args.shift();
    if (value === undefined || value.startsWith('--')) throw new Error(`Missing value for ${argument}`);
    const key = argument.slice(2).replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
    if (options[key] !== undefined) throw new Error(`Duplicate option: ${argument}`);
    options[key] = value;
  }
  return options;
}

function validateClients(nflverseClient, oddsClient, retrospective) {
  if (typeof nflverseClient?.downloadNflverseGames !== 'function' ||
      typeof nflverseClient?.downloadNflverseTeams !== 'function' ||
      typeof nflverseClient?.downloadNflverseWeeklyTeamStats !== 'function') {
    throw new Error('nflverse schedule, identity, and team-stat clients are required');
  }
  if (!retrospective && typeof oddsClient?.fetchNflSpreads !== 'function') throw new Error('current odds client is required');
}

function currentNflSeason(currentTime) {
  return currentTime.getUTCFullYear() - (currentTime.getUTCMonth() < 2 ? 1 : 0);
}

function validateDownload(download, name) {
  if (!download || typeof download.csv !== 'string' || !download.csv.trim() ||
      !Array.isArray(download.rows) || !download.rows.length ||
      !download.rows.every((row) => row && typeof row === 'object' && !Array.isArray(row)) ||
      typeof download.sourceUrl !== 'string' || !download.sourceUrl ||
      typeof download.retrievedAt !== 'string' || !Number.isFinite(Date.parse(download.retrievedAt))) {
    throw new Error(`Invalid nflverse ${name} download`);
  }
}

function findFullName(teamRows, season, alias) {
  const row = teamRows.find((team) => Number(team.season) === season && team.team === alias);
  if (typeof row?.full !== 'string' || !row.full.trim()) throw new Error('Target team has no canonical odds name');
  return row.full;
}

function hasFinalScore(row) {
  return row.away_score !== '' && row.home_score !== '' && row.away_score != null && row.home_score != null &&
    Number.isFinite(Number(row.away_score)) && Number.isFinite(Number(row.home_score));
}

function hasFinalResult(row) {
  return row.result !== '' && row.result != null && Number.isFinite(Number(row.result));
}

function validKickoff(kickoff) {
  return Number.isFinite(kickoffMillis(kickoff));
}

function kickoffMillis(kickoff) {
  if (!kickoff || typeof kickoff.date !== 'string' || typeof kickoff.time !== 'string' ||
      !/^\d{4}-\d{2}-\d{2}$/.test(kickoff.date) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(kickoff.time)) return NaN;
  const day = Date.parse(`${kickoff.date}T00:00:00Z`);
  if (!Number.isFinite(day) || new Date(day).toISOString().slice(0, 10) !== kickoff.date) return NaN;
  return Date.parse(`${kickoff.date}T${kickoff.time}:00Z`);
}

function rowKickoffMillis(row) {
  const kickoff = { date: row.gameday, time: row.gametime };
  return validKickoff(kickoff) ? Date.parse(nflverseKickoffToUtc(kickoff)) : NaN;
}

function nflverseKickoffToUtc(kickoff) {
  // nflverse gameday/gametime are Eastern wall-clock values; odds commence_time is UTC.
  const [year, month, day] = kickoff.date.split('-').map(Number);
  const [hour, minute] = kickoff.time.split(':').map(Number);
  const expectedWallTime = Date.UTC(year, month - 1, day, hour, minute);
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
  });
  let candidate = expectedWallTime;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const parts = Object.fromEntries(formatter.formatToParts(new Date(candidate))
      .filter((part) => part.type !== 'literal').map((part) => [part.type, Number(part.value)]));
    const observedWallTime = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second);
    const difference = expectedWallTime - observedWallTime;
    candidate += difference;
    if (difference === 0) return new Date(candidate).toISOString();
  }
  throw new Error('Target kickoff cannot be converted from nflverse Eastern time');
}

function safeTimestamp(value) {
  return value.replace(/[:.]/g, '-');
}

async function writeUniqueJson(fileSystem, directory, stem, value) {
  await fileSystem.mkdir(directory, { recursive: true });
  for (let index = 1; ; index += 1) {
    const suffix = index === 1 ? '' : `-${String(index).padStart(3, '0')}`;
    const filename = path.join(directory, `${stem}${suffix}.json`);
    try {
      await fileSystem.writeFile(filename, `${JSON.stringify(value, null, 2)}\n`, { flag: 'wx' });
      return filename;
    } catch (error) {
      if (error.code === 'EEXIST') continue;
      await fileSystem.unlink(filename).catch(() => {});
      throw error;
    }
  }
}

if (require.main === module) {
  runCli().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}

module.exports = { gatherPregame, runCli, nflverseKickoffToUtc };
