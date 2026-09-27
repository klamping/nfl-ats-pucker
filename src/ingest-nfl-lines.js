const crypto = require('node:crypto');
const { mkdir, writeFile } = require('node:fs/promises');
const path = require('node:path');

const { loadSportsGameOddsKey } = require('./config');
const { normalizePinnacleEvent } = require('./normalize-pinnacle');
const { createSportsGameOddsClient } = require('./sportsgameodds-client');

const SAMPLE_SEASONS = [2005, 2010, 2015, 2020, 2025];

async function runIngestion({ season, startsAfter, startsBefore, outputRoot = process.cwd(), client }) {
  const boundedSeason = normalizeSeason(season);
  if (!client || typeof client.fetchFinalizedNflEvents !== 'function') {
    throw new Error('A SportsGameOdds client is required');
  }

  const dateRange = seasonDateRange(boundedSeason, startsAfter, startsBefore);
  const rawDirectory = path.join(outputRoot, 'data', 'raw', 'sportsgameodds', 'nfl', String(boundedSeason));
  const normalizedDirectory = path.join(outputRoot, 'data', 'normalized', 'nfl');
  const rawResponses = [];
  const events = [];
  let cursor;
  let page = 1;

  do {
    const filters = {
      startsAfter: dateRange.startsAfter,
      startsBefore: dateRange.startsBefore,
      ...(cursor ? { cursor } : {}),
    };
    const response = await client.fetchFinalizedNflEvents(filters);
    const responseEvents = extractEvents(response);
    const rawPath = path.join(rawDirectory, rawResponseFilename({ season: boundedSeason, page, filters }));

    rawResponses.push({ response, rawPath });
    events.push(...responseEvents);

    cursor = nextCursor(response);
    page += 1;
  } while (cursor);

  await mkdir(rawDirectory, { recursive: true });
  for (const { response, rawPath } of rawResponses) {
    await writeFile(rawPath, `${JSON.stringify(response, null, 2)}\n`);
  }

  const accepted = [];
  const rejected = [];
  for (const event of events) {
    const result = normalizePinnacleEvent(event);
    if (result.accepted) {
      accepted.push(result.accepted);
    } else {
      rejected.push(result.rejected);
    }
  }

  await mkdir(normalizedDirectory, { recursive: true });
  await writeJsonLines(path.join(normalizedDirectory, `pinnacle-lines-${boundedSeason}.accepted.jsonl`), accepted);
  await writeJsonLines(path.join(normalizedDirectory, `pinnacle-lines-${boundedSeason}.rejected.jsonl`), rejected);

  return {
    season: boundedSeason,
    startsAfter: dateRange.startsAfter,
    startsBefore: dateRange.startsBefore,
    fetched: events.length,
    accepted: accepted.length,
    rejected: rejected.length,
    rawResponseFiles: rawResponses.length,
  };
}

function extractEvents(response) {
  if (Array.isArray(response)) {
    return response;
  }
  if (!response || typeof response !== 'object') {
    throw new Error('SportsGameOdds response must be an object or array');
  }
  if (Array.isArray(response.events)) {
    return response.events;
  }
  if (Array.isArray(response.data)) {
    return response.data;
  }
  throw new Error('SportsGameOdds response did not include an events array');
}

function nextCursor(response) {
  if (!response || typeof response !== 'object' || Array.isArray(response)) {
    return undefined;
  }
  return firstPresent(
    response.nextCursor,
    response.next_cursor,
    response.cursor && response.cursor.next,
    response.pagination && response.pagination.nextCursor,
    response.meta && response.meta.nextCursor,
  );
}

function rawResponseFilename({ season, page, filters }) {
  const requestHash = crypto
    .createHash('sha256')
    .update(JSON.stringify({ season, filters }))
    .digest('hex')
    .slice(0, 12);
  return `season-${season}-page-${String(page).padStart(3, '0')}-${requestHash}.json`;
}

function seasonDateRange(season, startsAfter, startsBefore) {
  return {
    startsAfter: startsAfter || `${season}-07-01T00:00:00.000Z`,
    startsBefore: startsBefore || `${season + 1}-03-01T00:00:00.000Z`,
  };
}

function normalizeSeason(season) {
  const number = Number(season);
  if (!Number.isInteger(number) || number < 1900 || number > 3000) {
    throw new Error('A four-digit NFL season is required');
  }
  return number;
}

async function writeJsonLines(filePath, records) {
  const body = records.map((record) => JSON.stringify(record)).join('\n');
  await writeFile(filePath, body ? `${body}\n` : '');
}

function firstPresent(...values) {
  return values.find((value) => value !== undefined && value !== null && value !== '');
}

async function runCli(argv = process.argv.slice(2), output = console) {
  const { command, options } = parseArgs(argv);
  const apiKey = loadSportsGameOddsKey();
  const client = createSportsGameOddsClient(apiKey);

  if (command === 'validate') {
    const summaries = [];
    for (const season of SAMPLE_SEASONS) {
      const summary = await runIngestion({ season, outputRoot: options.outputRoot || process.cwd(), client });
      summaries.push(summary);
      output.log(formatSummary(summary));
    }

    const failedSamples = summaries.filter((summary) => summary.accepted === 0 || summary.rejected > 0);
    if (failedSamples.length > 0) {
      throw new Error('Sample validation found missing Pinnacle opening or closing spreads; inspect rejected JSONL before full ingestion.');
    }
    return summaries;
  }

  if (command === 'ingest') {
    const summary = await runIngestion({
      season: options.season,
      startsAfter: options.startsAfter,
      startsBefore: options.startsBefore,
      outputRoot: options.outputRoot || process.cwd(),
      client,
    });
    output.log(formatSummary(summary));
    return summary;
  }

  throw new Error(usage());
}

function parseArgs(argv) {
  const args = [...argv];
  const command = args.shift();
  const options = {};

  while (args.length > 0) {
    const arg = args.shift();
    if (!arg.startsWith('--')) {
      throw new Error(`Unexpected argument: ${arg}`);
    }
    const [name, inlineValue] = arg.slice(2).split('=', 2);
    const value = inlineValue === undefined ? args.shift() : inlineValue;
    if (value === undefined || value.startsWith('--')) {
      throw new Error(`Missing value for --${name}`);
    }

    if (name === 'season') {
      options.season = normalizeSeason(value);
    } else if (name === 'starts-after') {
      options.startsAfter = value;
    } else if (name === 'starts-before') {
      options.startsBefore = value;
    } else if (name === 'output-root') {
      options.outputRoot = value;
    } else {
      throw new Error(`Unknown option: --${name}`);
    }
  }

  if (!['validate', 'ingest'].includes(command)) {
    throw new Error(usage());
  }
  if (command === 'ingest' && options.season === undefined) {
    throw new Error('The ingest command requires --season YYYY');
  }

  return { command, options };
}

function formatSummary(summary) {
  return [
    `season ${summary.season}`,
    `fetched=${summary.fetched}`,
    `accepted=${summary.accepted}`,
    `rejected=${summary.rejected}`,
    `rawResponseFiles=${summary.rawResponseFiles}`,
  ].join(' ');
}

function usage() {
  return 'Usage: node src/ingest-nfl-lines.js validate [--output-root PATH] | ingest --season YYYY [--starts-after ISO] [--starts-before ISO] [--output-root PATH]';
}

if (require.main === module) {
  runCli().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}

module.exports = { runIngestion, runCli };
