const { mkdir, writeFile } = require('node:fs/promises');
const path = require('node:path');

const { downloadNflverseGames } = require('./nflverse-client');
const { normalizeNflverseGame } = require('./normalize-nflverse-game');

const SAMPLE_SEASONS = [2005, 2010, 2015, 2020, 2025];

async function runNflverseIngestion({ startSeason, endSeason, outputRoot = process.cwd(), client = { downloadNflverseGames } }) {
  const start = Number(startSeason);
  const end = Number(endSeason);
  if (!Number.isInteger(start) || !Number.isInteger(end) || start < 2005 || end < start || end > 3000 ||
      startSeason === undefined || endSeason === undefined) {
    throw new Error('A valid season range from 2005 onward is required');
  }
  if (typeof client?.downloadNflverseGames !== 'function') {
    throw new Error('An nflverse download client is required');
  }

  const download = await client.downloadNflverseGames();
  return ingestDownloadedRange({ start, end, outputRoot, download });
}

async function ingestDownloadedRange({ start, end, outputRoot = process.cwd(), download, rawPath }) {
  // Validate the entire source before touching any existing output.
  if (!download || typeof download.csv !== 'string' || !download.csv.trim() ||
      !Array.isArray(download.rows) || download.rows.length === 0 ||
      !download.rows.every((row) => row && typeof row === 'object' && !Array.isArray(row)) ||
      typeof download.sourceUrl !== 'string' || !download.sourceUrl ||
      typeof download.retrievedAt !== 'string' || !Number.isFinite(Date.parse(download.retrievedAt))) {
    throw new Error('invalid nflverse download');
  }

  const rows = download.rows.filter((row) => {
    const season = Number(row.season);
    return row.season !== '' && Number.isInteger(season) && season >= start && season <= end;
  });
  const accepted = [];
  const rejected = [];
  for (const row of rows) {
    const result = normalizeNflverseGame(row, { retrievedAt: download.retrievedAt, sourceUrl: download.sourceUrl });
    if (result.accepted) accepted.push(result.accepted);
    else rejected.push(result.rejected);
  }
  const sortByGameId = (left, right) => String(left.gameId ?? '').localeCompare(String(right.gameId ?? ''), 'en');
  accepted.sort(sortByGameId);
  rejected.sort(sortByGameId);

  const rawDirectory = path.join(outputRoot, 'data', 'raw', 'nflverse');
  const normalizedDirectory = path.join(outputRoot, 'data', 'normalized', 'nfl');
  if (!rawPath) {
    await mkdir(rawDirectory, { recursive: true });
    const timestamp = download.retrievedAt.replace(/:/g, '-');
    for (let capture = 1; ; capture += 1) {
      const candidate = path.join(rawDirectory, `games-${timestamp}-capture-${String(capture).padStart(3, '0')}.csv`);
      try {
        await writeFile(candidate, download.csv, { flag: 'wx' });
        rawPath = candidate;
        break;
      } catch (error) {
        if (error.code !== 'EEXIST') throw error;
      }
    }
  }

  await mkdir(normalizedDirectory, { recursive: true });
  const prefix = `nflverse-lines-${start}-${end}`;
  await writeJsonLines(path.join(normalizedDirectory, `${prefix}.accepted.jsonl`), accepted);
  await writeJsonLines(path.join(normalizedDirectory, `${prefix}.rejected.jsonl`), rejected);

  return { fetchedRows: download.rows.length, inRangeRows: rows.length, accepted: accepted.length, rejected: rejected.length, rawPath };
}

async function writeJsonLines(filename, records) {
  await writeFile(filename, records.length ? `${records.map((record) => JSON.stringify(record)).join('\n')}\n` : '');
}

async function runCli(argv = process.argv.slice(2), output = console, client = { downloadNflverseGames }) {
  const [command, ...args] = argv;
  const options = {};
  while (args.length) {
    const argument = args.shift();
    if (!['--start-season', '--end-season', '--output-root'].includes(argument)) {
      throw new Error(`Unknown option: ${argument}`);
    }
    const value = args.shift();
    if (value === undefined || value.startsWith('--')) throw new Error(`Missing value for ${argument}`);
    options[argument.slice(2).replace(/-([a-z])/g, (_, letter) => letter.toUpperCase())] = value;
  }

  if (command === 'validate') {
    if (options.startSeason !== undefined || options.endSeason !== undefined) {
      throw new Error('Validation uses exactly the five sample seasons');
    }
    if (typeof client?.downloadNflverseGames !== 'function') {
      throw new Error('An nflverse download client is required');
    }
    const download = await client.downloadNflverseGames();
    const summaries = [];
    let rawPath;
    for (const season of SAMPLE_SEASONS) {
      const summary = await ingestDownloadedRange({ start: season, end: season, outputRoot: options.outputRoot, download, rawPath });
      rawPath = summary.rawPath;
      summaries.push(summary);
      output.log(`season=${season} ${formatCounts(summary)}`);
    }
    return summaries;
  }
  if (command === 'ingest') {
    const summary = await runNflverseIngestion({ ...options, client });
    output.log(`seasons=${options.startSeason}-${options.endSeason} ${formatCounts(summary)}`);
    return summary;
  }
  throw new Error('Usage: node src/ingest-nflverse-lines.js validate [--output-root PATH] | ingest --start-season YYYY --end-season YYYY [--output-root PATH]');
}

function formatCounts(summary) {
  return `fetchedRows=${summary.fetchedRows} inRangeRows=${summary.inRangeRows} accepted=${summary.accepted} rejected=${summary.rejected}`;
}

if (require.main === module) {
  runCli().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}

module.exports = { runNflverseIngestion, runCli };
