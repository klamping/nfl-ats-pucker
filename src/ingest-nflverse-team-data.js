const defaultFileSystem = require('node:fs/promises');
const path = require('node:path');

const { downloadNflverseTeams, downloadNflverseWeeklyTeamStats } = require('./nflverse-team-client');
const { buildTeamIdentity } = require('./normalize-team-identity');
const { normalizeTeamPostgame } = require('./normalize-team-postgame');
const { deriveTeamPregame } = require('./derive-team-pregame');
const { joinTeamPregameToMarkets } = require('./join-team-matchups');

const SAMPLE_SEASONS = [2005, 2010, 2015, 2020, 2025];
const NORMALIZED_DIRECTORY = path.join('data', 'normalized', 'nfl');

async function runNflverseTeamIngestion({ startSeason, endSeason, outputRoot = process.cwd(), client = defaultClient(), fileSystem = defaultFileSystem }) {
  const { start, end } = validateRange(startSeason, endSeason);
  validateClient(client);
  const marketGames = await readMarketGames({ start, end, outputRoot, fileSystem });
  const teams = await client.downloadNflverseTeams();
  const seasons = Array.from({ length: end - start + 1 }, (_, index) => start + index);
  const stats = await client.downloadNflverseWeeklyTeamStats({ seasons });
  validateDownload(teams, 'team metadata');
  if (!Array.isArray(stats) || stats.length !== seasons.length || stats.some((download, index) =>
    download?.season !== seasons[index] || !validDownload(download))) {
    throw new Error('invalid nflverse weekly team stats downloads');
  }
  return processRange({ start, end, outputRoot, fileSystem, teams, stats, marketGames });
}

function defaultClient() {
  return { downloadNflverseTeams, downloadNflverseWeeklyTeamStats };
}

function validateRange(startSeason, endSeason) {
  const start = Number(startSeason);
  const end = Number(endSeason);
  if (startSeason === undefined || endSeason === undefined || !Number.isInteger(start) || !Number.isInteger(end) || start < 2005 || end < start || end > 3000) {
    throw new Error('A valid season range from 2005 onward is required');
  }
  return { start, end };
}

function validateClient(client) {
  if (typeof client?.downloadNflverseTeams !== 'function' || typeof client?.downloadNflverseWeeklyTeamStats !== 'function') {
    throw new Error('nflverse team download client is required');
  }
}

function validDownload(download) {
  return download && typeof download.csv === 'string' && download.csv.trim() && Array.isArray(download.rows) &&
    download.rows.every((row) => row && typeof row === 'object' && !Array.isArray(row)) &&
    typeof download.sourceUrl === 'string' && download.sourceUrl && typeof download.retrievedAt === 'string' &&
    Number.isFinite(Date.parse(download.retrievedAt));
}

function validateDownload(download, name) {
  if (!validDownload(download)) throw new Error(`invalid nflverse ${name} download`);
}

async function readMarketGames({ start, end, outputRoot, fileSystem }) {
  const directory = path.join(outputRoot, NORMALIZED_DIRECTORY);
  const prefix = `nflverse-lines-${start}-${end}`;
  const manifestPath = path.join(directory, `${prefix}.current.json`);
  let manifest;
  try {
    manifest = JSON.parse(await fileSystem.readFile(manifestPath, 'utf8'));
  } catch (error) {
    throw new Error(`Published market manifest is required: ${manifestPath}`);
  }
  if (typeof manifest?.accepted !== 'string' || typeof manifest?.rejected !== 'string') throw new Error('invalid published market manifest');
  const acceptedPath = path.resolve(directory, manifest.accepted);
  const rejectedPath = path.resolve(directory, manifest.rejected);
  if (!acceptedPath.startsWith(`${path.resolve(directory)}${path.sep}`) || !rejectedPath.startsWith(`${path.resolve(directory)}${path.sep}`)) {
    throw new Error('published market manifest paths must remain inside the normalized data directory');
  }
  const [acceptedText, rejectedText] = await Promise.all([fileSystem.readFile(acceptedPath, 'utf8'), fileSystem.readFile(rejectedPath, 'utf8')]);
  const rows = [...parseJsonLines(acceptedText), ...parseJsonLines(rejectedText)];
  return rows.filter((row) => Number.isInteger(row.season) && row.season >= start && row.season <= end);
}

function parseJsonLines(text) {
  return text.split(/\r?\n/).filter((line) => line.trim()).map((line) => JSON.parse(line));
}

async function processRange({ start, end, outputRoot, fileSystem, teams, stats, marketGames, rawCaptures }) {
  const identityBuild = buildTeamIdentity({ teamRows: teams.rows, startSeason: start, endSeason: end,
    sourceUrl: teams.sourceUrl, retrievedAt: teams.retrievedAt });
  const bySeason = new Map(stats.map((download) => [download.season, download]));
  const weeklyStats = stats.flatMap((download) => download.rows.filter((row) => {
    const season = Number(row.season);
    return Number.isInteger(season) && season >= start && season <= end;
  }));
  const postgameBuild = { accepted: [], rejected: [] };
  for (const download of stats) {
    const season = download.season;
    const seasonBuild = normalizeTeamPostgame({
      marketGames: marketGames.filter((game) => game.season === season),
      weeklyStats: weeklyStats.filter((row) => Number(row.season) === season),
      franchiseLookup: identityBuild.lookup,
      sourceMetadata: download,
    });
    postgameBuild.accepted.push(...seasonBuild.accepted);
    postgameBuild.rejected.push(...seasonBuild.rejected);
  }
  const pregameBuild = deriveTeamPregame(postgameBuild.accepted);
  const matchupBuild = joinTeamPregameToMarkets({ marketGames, pregameRecords: pregameBuild.accepted });

  const rawPaths = rawCaptures || [await writeRawCapture(fileSystem, outputRoot, 'teams', teams)];
  if (!rawCaptures) {
    for (const download of stats) rawPaths.push(await writeRawCapture(fileSystem, outputRoot, `stats_team_week_${download.season}`, download));
  }
  const suffix = `${start}-${end}`;
  const identity = await publishPair({ fileSystem, outputRoot, prefix: `nflverse-team-identity-${suffix}`,
    accepted: identityBuild.accepted, rejected: identityBuild.rejected, rawPaths: [rawPaths[0]] });
  const postgame = await publishPair({ fileSystem, outputRoot, prefix: `nflverse-team-postgame-${suffix}`,
    accepted: postgameBuild.accepted, rejected: postgameBuild.rejected, rawPaths: rawPaths.slice(1) });
  const pregame = await publishPair({ fileSystem, outputRoot, prefix: `nflverse-team-pregame-${suffix}`,
    accepted: pregameBuild.accepted, rejected: pregameBuild.rejected, rawPaths: rawPaths.slice(1) });
  const matchup = await publishPair({ fileSystem, outputRoot, prefix: `nflverse-team-matchups-${suffix}`,
    accepted: matchupBuild.accepted, rejected: matchupBuild.rejected, rawPaths: rawPaths.slice(1) });
  return { identity, postgame, pregame, matchup };
}

async function writeRawCapture(fileSystem, outputRoot, stem, download) {
  const directory = path.join(outputRoot, 'data', 'raw', 'nflverse');
  await fileSystem.mkdir(directory, { recursive: true });
  const timestamp = download.retrievedAt.replace(/:/g, '-');
  for (let capture = 1; ; capture += 1) {
    const filename = path.join(directory, `${stem}-${timestamp}-capture-${String(capture).padStart(3, '0')}.csv`);
    try {
      await fileSystem.writeFile(filename, download.csv, { flag: 'wx' });
      return filename;
    } catch (error) {
      if (error.code !== 'EEXIST') throw error;
    }
  }
}

async function publishPair({ fileSystem, outputRoot, prefix, accepted, rejected, rawPaths }) {
  const directory = path.join(outputRoot, NORMALIZED_DIRECTORY);
  await fileSystem.mkdir(directory, { recursive: true });
  const runDirectory = await fileSystem.mkdtemp(path.join(directory, `${prefix}-run-`));
  const acceptedPath = path.join(runDirectory, `${prefix}.accepted.jsonl`);
  const rejectedPath = path.join(runDirectory, `${prefix}.rejected.jsonl`);
  const manifestPath = path.join(directory, `${prefix}.current.json`);
  await writeJsonLines(fileSystem, acceptedPath, accepted);
  await writeJsonLines(fileSystem, rejectedPath, rejected);
  await fileSystem.writeFile(path.join(runDirectory, 'publication.json'), `${JSON.stringify({
    accepted: path.relative(directory, acceptedPath), rejected: path.relative(directory, rejectedPath),
  })}\n`);
  await fileSystem.rename(path.join(runDirectory, 'publication.json'), manifestPath);
  return { accepted: accepted.length, rejected: rejected.length, rawPaths, manifestPath, acceptedPath, rejectedPath };
}

async function writeJsonLines(fileSystem, filename, records) {
  await fileSystem.writeFile(filename, records.length ? `${records.map((record) => JSON.stringify(record)).join('\n')}\n` : '');
}

async function runCli(argv = process.argv.slice(2), output = console, client = defaultClient()) {
  const [command, ...args] = argv;
  const options = {};
  while (args.length) {
    const argument = args.shift();
    if (!['--start-season', '--end-season', '--output-root'].includes(argument)) throw new Error(`Unknown option: ${argument}`);
    const value = args.shift();
    if (value === undefined || value.startsWith('--')) throw new Error(`Missing value for ${argument}`);
    options[argument.slice(2).replace(/-([a-z])/g, (_, letter) => letter.toUpperCase())] = value;
  }
  if (command === 'ingest') {
    const result = await runNflverseTeamIngestion({ ...options, client });
    for (const [name, summary] of Object.entries(result)) output.log(`${name} accepted=${summary.accepted} rejected=${summary.rejected}`);
    return result;
  }
  if (command === 'validate') {
    if (options.startSeason !== undefined || options.endSeason !== undefined) throw new Error('Validation uses exactly the five sample seasons');
    const root = options.outputRoot || process.cwd();
    validateClient(client);
    const marketGames = await readMarketGames({ start: 2005, end: 2025, outputRoot: root, fileSystem: defaultFileSystem });
    const teams = await client.downloadNflverseTeams();
    const downloads = await client.downloadNflverseWeeklyTeamStats({ seasons: SAMPLE_SEASONS });
    validateDownload(teams, 'team metadata');
    if (!Array.isArray(downloads) || downloads.length !== SAMPLE_SEASONS.length || downloads.some((download, index) => download?.season !== SAMPLE_SEASONS[index] || !validDownload(download))) {
      throw new Error('invalid nflverse weekly team stats downloads');
    }
    const rawCaptures = [await writeRawCapture(defaultFileSystem, root, 'teams', teams)];
    for (const download of downloads) rawCaptures.push(await writeRawCapture(defaultFileSystem, root, `stats_team_week_${download.season}`, download));
    const summaries = [];
    for (const [index, season] of SAMPLE_SEASONS.entries()) {
      const sampleStats = downloads.find((download) => download.season === season);
      const result = await processRange({ start: season, end: season, outputRoot: root, fileSystem: defaultFileSystem,
        teams, stats: [sampleStats], marketGames: marketGames.filter((game) => game.season === season),
        rawCaptures: [rawCaptures[0], rawCaptures[index + 1]] });
      summaries.push(result);
      output.log(`season=${season} ${Object.entries(result).map(([name, value]) => `${name}=${value.accepted}/${value.rejected}`).join(' ')}`);
    }
    return summaries;
  }
  throw new Error('Usage: node src/ingest-nflverse-team-data.js validate [--output-root PATH] | ingest --start-season YYYY --end-season YYYY [--output-root PATH]');
}

if (require.main === module) runCli().catch((error) => { console.error(error.message); process.exitCode = 1; });

module.exports = { runNflverseTeamIngestion, runCli };
