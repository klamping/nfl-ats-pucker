const defaultFileSystem = require('node:fs/promises');
const path = require('node:path');

const FEATURE_FIELDS = [
  'gamesPlayed', 'winPercentage', 'pointsScoredPerGame', 'pointsAllowedPerGame',
  'netYardsPerPlay', 'netEpaPerPlay', 'turnoverMarginPerGame', 'offensiveSackRate',
  'defensiveSackRate', 'restDays',
];
// Equal feature weights keep the score interpretable: each of 20 team-feature
// deltas and the home spread contributes at most 1/21 of the total distance.
const FEATURE_WEIGHTS = Object.fromEntries([
  ...FEATURE_FIELDS.flatMap((field) => [[`home.${field}`, 1], [`away.${field}`, 1]]),
  ['closingSpreadHome', 1],
].map(([field, weight]) => [field, weight / (FEATURE_FIELDS.length * 2 + 1)]));
const DEFAULT_SPREAD_BAND = 3;

function compareHistorical({ input, historicalMatchups, weekWindow, spreadBand = DEFAULT_SPREAD_BAND,
  limit = 10 } = {}) {
  validateInput(input);
  if (!Array.isArray(historicalMatchups)) throw new Error('historicalMatchups must be an array');
  if (!Number.isFinite(spreadBand) || spreadBand < 0) throw new Error('spreadBand must be a non-negative number');
  if (!Number.isInteger(limit) || limit < 0) throw new Error('limit must be a non-negative integer');
  const window = resolveWeekWindow(input.week, weekWindow);
  const eligible = historicalMatchups.filter((record) => isCompleteHistorical(record) &&
    record.gameType === input.gameType && record.week >= window.startWeek && record.week <= window.endWeek &&
    Math.abs(record.closingSpreadHome - input.closingSpreadHome) <= spreadBand);
  const maximumDeltas = Object.fromEntries(Object.keys(FEATURE_WEIGHTS).map((key) => [key,
    eligible.reduce((maximum, record) => Math.max(maximum, Math.abs(deltaFor(input, record, key))), 0)]));

  const ranked = eligible.map((record) => {
    const distanceContributions = Object.fromEntries(Object.entries(FEATURE_WEIGHTS).map(([key, weight]) => {
      const maximum = maximumDeltas[key];
      const normalizedDelta = maximum === 0 ? 0 : Math.abs(deltaFor(input, record, key)) / maximum;
      return [key, normalizedDelta * weight];
    }));
    const similarityScore = Object.values(distanceContributions).reduce((sum, contribution) => sum + contribution, 0);
    const homeAtsMargin = record.homeScore - record.awayScore - record.closingSpreadHome;
    return {
      gameId: record.gameId,
      season: record.season,
      week: record.week,
      gameType: record.gameType,
      homeTeam: record.homeTeam,
      awayTeam: record.awayTeam,
      similarityScore,
      distanceContributions,
      homeAtsMargin,
      outcome: homeAtsMargin > 0 ? 'home_cover' : homeAtsMargin < 0 ? 'away_cover' : 'push',
    };
  }).sort((left, right) => left.similarityScore - right.similarityScore ||
    left.season - right.season || left.week - right.week || String(left.gameId).localeCompare(String(right.gameId)));
  const candidates = ranked.slice(0, limit);
  const homeCovers = candidates.filter((candidate) => candidate.outcome === 'home_cover').length;
  const awayCovers = candidates.filter((candidate) => candidate.outcome === 'away_cover').length;
  const pushes = candidates.filter((candidate) => candidate.outcome === 'push').length;
  const decisions = homeCovers + awayCovers;
  return {
    filters: {
      gameType: input.gameType,
      weekWindow: window,
      spreadBand,
      featureWeights: FEATURE_WEIGHTS,
      limit,
    },
    candidates,
    summary: {
      candidateCount: candidates.length,
      homeCovers,
      awayCovers,
      pushes,
      homeCoverRate: decisions ? homeCovers / decisions : null,
    },
  };
}

async function runComparisonCli({ inputPath, output = console, fileSystem = defaultFileSystem,
  outputRoot = process.cwd(), weekWindow, spreadBand, limit } = {}) {
  if (typeof inputPath !== 'string' || !inputPath) throw new Error('--input path is required');
  const input = JSON.parse(await fileSystem.readFile(path.resolve(inputPath), 'utf8'));
  const directory = path.resolve(outputRoot, 'data', 'normalized', 'nfl');
  const manifestPath = path.join(directory, 'nflverse-team-matchups-2005-2025.current.json');
  const manifest = JSON.parse(await fileSystem.readFile(manifestPath, 'utf8'));
  if (typeof manifest?.accepted !== 'string' || !manifest.accepted || path.isAbsolute(manifest.accepted)) {
    throw new Error('Invalid historical matchup manifest accepted path');
  }
  const acceptedPath = path.resolve(directory, manifest.accepted);
  if (acceptedPath !== directory && !acceptedPath.startsWith(`${directory}${path.sep}`)) {
    throw new Error('Historical matchup accepted path must remain inside the normalized data directory');
  }
  const jsonl = await fileSystem.readFile(acceptedPath, 'utf8');
  const historicalMatchups = jsonl.split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line));
  const result = compareHistorical({ input, historicalMatchups, weekWindow, spreadBand, limit });
  output.log(JSON.stringify(result, null, 2));
  return result;
}

function validateInput(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input) ||
      !nonEmpty(input.gameId) || !Number.isInteger(input.season) || !Number.isInteger(input.week) || input.week < 1 ||
      !['REG', 'POST'].includes(input.gameType) || !nonEmpty(input.homeTeam) || !nonEmpty(input.awayTeam) ||
      input.homeTeam === input.awayTeam || !Number.isFinite(input.closingSpreadHome) ||
      !validKickoff(input.kickoff) || !input.currentOdds || input.currentOdds.provider !== 'the-odds-api' ||
      typeof input.currentOdds.retrievedAt !== 'string' || !Number.isFinite(Date.parse(input.currentOdds.retrievedAt)) ||
      !Number.isInteger(input.currentOdds.contributingBooks) || input.currentOdds.contributingBooks < 1 ||
      !Array.isArray(input.currentOdds.homeSpreads) || !input.currentOdds.homeSpreads.length ||
      !input.currentOdds.homeSpreads.every(Number.isFinite) ||
      !Number.isFinite(input.currentOdds.consensusSpreadHome) ||
      input.currentOdds.consensusSpreadHome !== input.closingSpreadHome) {
    throw new Error('Invalid input matchup snapshot');
  }
  for (const side of ['homePregame', 'awayPregame']) {
    if (!input[side] || FEATURE_FIELDS.some((field) => !Number.isFinite(input[side][field]))) {
      throw new Error(`Input ${side} requires complete finite comparison features`);
    }
  }
}

function isCompleteHistorical(record) {
  return record && typeof record === 'object' && !Array.isArray(record) &&
    Number.isInteger(record.season) && Number.isInteger(record.week) && record.week >= 1 &&
    ['REG', 'POST'].includes(record.gameType) && nonEmpty(record.gameId) &&
    nonEmpty(record.homeTeam) && nonEmpty(record.awayTeam) &&
    Number.isFinite(record.homeScore) && Number.isFinite(record.awayScore) &&
    Number.isFinite(record.closingSpreadHome) &&
    ['homePregame', 'awayPregame'].every((side) => record[side] &&
      FEATURE_FIELDS.every((field) => Number.isFinite(record[side][field])));
}

function resolveWeekWindow(week, weekWindow) {
  const offsets = weekWindow ?? { startOffset: -1, endOffset: 2 };
  if (!offsets || !Number.isInteger(offsets.startOffset) || !Number.isInteger(offsets.endOffset) ||
      offsets.startOffset > offsets.endOffset) throw new Error('weekWindow requires ordered integer startOffset and endOffset');
  return { startWeek: Math.max(1, week + offsets.startOffset), endWeek: Math.max(1, week + offsets.endOffset) };
}

function deltaFor(input, record, key) {
  if (key === 'closingSpreadHome') return record.closingSpreadHome - input.closingSpreadHome;
  const [side, field] = key.split('.');
  return record[`${side}Pregame`][field] - input[`${side}Pregame`][field];
}

function validKickoff(kickoff) {
  if (!kickoff || typeof kickoff.date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(kickoff.date) ||
      typeof kickoff.time !== 'string' || !/^([01]\d|2[0-3]):[0-5]\d$/.test(kickoff.time)) return false;
  const parsed = Date.parse(`${kickoff.date}T00:00:00Z`);
  return Number.isFinite(parsed) && new Date(parsed).toISOString().slice(0, 10) === kickoff.date;
}

function nonEmpty(value) {
  return typeof value === 'string' && Boolean(value.trim());
}

function parseCli(argv) {
  const options = {};
  for (let index = 0; index < argv.length; index += 2) {
    const option = argv[index];
    const value = argv[index + 1];
    if (option !== '--input' || value === undefined || value.startsWith('--') || options.inputPath) {
      throw new Error(`Invalid comparison CLI option: ${option || ''}`.trim());
    }
    options.inputPath = value;
  }
  if (!options.inputPath) throw new Error('A valid --input path is required');
  return options;
}

if (require.main === module) {
  runComparisonCli(parseCli(process.argv.slice(2))).catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}

module.exports = { compareHistorical, runComparisonCli };
