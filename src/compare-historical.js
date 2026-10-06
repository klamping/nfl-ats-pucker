const defaultFileSystem = require('node:fs/promises');
const path = require('node:path');

const FEATURE_FIELDS = [
  'pointsScoredPerGame', 'pointsAllowedPerGame',
  'netYardsPerPlay', 'netEpaPerPlay', 'turnoverMarginPerGame', 'offensiveSackRate',
  'defensiveSackRate', 'restDays', 'passingEpaPerDropback', 'rushingEpaPerCarry',
  'explosivePlayRate', 'passingCpoe', 'interceptionRate', 'rushingYardsPerCarry',
  'passingExplosiveRate', 'rushingExplosiveRate', 'penaltyYardsPerGame',
];
// Spread is an eligibility filter; each of 22 team-feature deltas contributes
// at most 1/22 of the score once a historical line is within the spread band.
const FEATURE_WEIGHTS = Object.fromEntries(FEATURE_FIELDS.flatMap((field) =>
  [[`home.${field}`, 1], [`away.${field}`, 1]]).map(([field, weight]) =>
  [field, weight / (FEATURE_FIELDS.length * 2)]));
const DEFAULT_SPREAD_BAND = 3.5;
const MINIMUM_FEATURE_COVERAGE = 0.7;
const MAXIMUM_SIMILARITY_DISTANCE = 0.2;
const DISTANCE_GROUP_MAXIMA = [0.025, 0.05, 0.075, 0.1, 0.125, 0.15, 0.175, 0.2];

function coverSplitInterval(homeCovers, decisions) {
  if (!decisions) return null;
  // Two-sided 95% Wilson score interval, converted from a proportion to PP.
  const z = 1.959963984540054;
  const rate = homeCovers / decisions;
  const adjustment = z * z / decisions;
  const center = (rate + adjustment / 2) / (1 + adjustment);
  const radius = z * Math.sqrt(rate * (1 - rate) / decisions + z * z / (4 * decisions * decisions)) / (1 + adjustment);
  return { lower: (Math.max(0, center - radius) - 0.5) * 100,
    upper: (Math.min(1, center + radius) - 0.5) * 100 };
}

function compareHistorical({ input, historicalMatchups, weekWindow,
  limit } = {}) {
  validateInput(input);
  if (!Array.isArray(historicalMatchups)) throw new Error('historicalMatchups must be an array');
  const spreadBand = DEFAULT_SPREAD_BAND;
  if (limit !== undefined && (!Number.isInteger(limit) || limit < 0)) {
    throw new Error('limit must be a non-negative integer');
  }
  const window = resolveWeekWindow(input.week, weekWindow);
  const comparable = historicalMatchups.filter((record) => isCompleteHistorical(record) &&
    featureKeysFor(input, record).length / Object.keys(FEATURE_WEIGHTS).length >= MINIMUM_FEATURE_COVERAGE &&
    record.gameType === input.gameType && record.week >= window.startWeek && record.week <= window.endWeek);
  const eligible = comparable.filter((record) =>
    Math.abs(record.closingSpreadHome - input.closingSpreadHome) <= spreadBand);
  const outsideSpread = comparable.filter((record) =>
    Math.abs(record.closingSpreadHome - input.closingSpreadHome) > spreadBand);
  const rank = (records, normalizationRecords = records) => {
    const maximumDeltas = Object.fromEntries(Object.keys(FEATURE_WEIGHTS).map((key) => [key,
      normalizationRecords.reduce((maximum, record) => featureKeysFor(input, record).includes(key) ? Math.max(maximum, Math.abs(deltaFor(input, record, key))) : maximum, 0)]));
    return records.map((record) => {
    const featureKeys = featureKeysFor(input, record);
    const weightTotal = featureKeys.length === Object.keys(FEATURE_WEIGHTS).length ? 1 :
      featureKeys.reduce((sum, key) => sum + FEATURE_WEIGHTS[key], 0);
    const distanceContributions = Object.fromEntries(featureKeys.map((key) => {
      const weight = FEATURE_WEIGHTS[key] / weightTotal;
      const maximum = maximumDeltas[key];
      const normalizedDelta = maximum === 0 ? 0 : Math.abs(deltaFor(input, record, key)) / maximum;
      return [key, normalizedDelta * weight];
    }));
    const similarityScore = Object.values(distanceContributions).reduce((sum, contribution) => sum + contribution, 0);
    const homeAtsMargin = record.homeScore - record.awayScore + record.closingSpreadHome;
    return {
      gameId: record.gameId,
      season: record.season,
      week: record.week,
      gameType: record.gameType,
      homeTeam: record.homeTeam,
      awayTeam: record.awayTeam,
      homeScore: record.homeScore,
      awayScore: record.awayScore,
      closingSpreadHome: record.closingSpreadHome,
      similarityScore,
      distanceContributions,
      featureCoverage: featureKeys.length / Object.keys(FEATURE_WEIGHTS).length,
      omittedFeatures: Object.keys(FEATURE_WEIGHTS).filter((key) => !featureKeys.includes(key)),
      homeAtsMargin,
      outcome: homeAtsMargin > 0 ? 'home_cover' : homeAtsMargin < 0 ? 'away_cover' : 'push',
    };
  }).sort((left, right) => left.similarityScore - right.similarityScore ||
    left.season - right.season || left.week - right.week || String(left.gameId).localeCompare(String(right.gameId)));
  };
  const ranked = rank(eligible);
  const rankedOutsideSpread = rank(outsideSpread, comparable);
  const similarityEligible = ranked.filter((candidate) =>
    candidate.similarityScore <= MAXIMUM_SIMILARITY_DISTANCE + Number.EPSILON);
  const candidates = limit === undefined ? similarityEligible : similarityEligible.slice(0, limit);
  const outsideSpreadCandidates = rankedOutsideSpread.filter((candidate) =>
    candidate.similarityScore <= MAXIMUM_SIMILARITY_DISTANCE + Number.EPSILON).map((candidate) => ({
    ...candidate,
    spreadDifference: Math.abs(candidate.closingSpreadHome - input.closingSpreadHome),
    spreadBandExcess: Math.abs(candidate.closingSpreadHome - input.closingSpreadHome) - spreadBand,
  }));
  const homeCovers = candidates.filter((candidate) => candidate.outcome === 'home_cover').length;
  const awayCovers = candidates.filter((candidate) => candidate.outcome === 'away_cover').length;
  const pushes = candidates.filter((candidate) => candidate.outcome === 'push').length;
  const decisions = homeCovers + awayCovers;
  const coverMargin = (outcome) => candidates.filter((candidate) => candidate.outcome === outcome)
    .map((candidate) => Math.abs(candidate.homeAtsMargin)).sort((a, b) => a - b);
  const percentile = (values, fraction) => values.length ? values[Math.round((values.length - 1) * fraction)] : null;
  const median = (values) => !values.length ? null : values.length % 2 ? values[(values.length - 1) / 2] : (values[values.length / 2 - 1] + values[values.length / 2]) / 2;
  const profile = (values) => ({ count: values.length, median: median(values),
    lowerQuartile: percentile(values, 0.25), upperQuartile: percentile(values, 0.75) });
  const homeMargin = profile(coverMargin('home_cover'));
  const awayMargin = profile(coverMargin('away_cover'));
  const distanceGroups = DISTANCE_GROUP_MAXIMA.map((maximumDistance) => {
    const group = candidates.filter((candidate) => candidate.similarityScore <= maximumDistance + Number.EPSILON);
    const groupHomeCovers = group.filter((candidate) => candidate.outcome === 'home_cover').length;
    const groupAwayCovers = group.filter((candidate) => candidate.outcome === 'away_cover').length;
    const groupPushes = group.filter((candidate) => candidate.outcome === 'push').length;
    const groupDecisions = groupHomeCovers + groupAwayCovers;
    return { maximumDistance, candidateCount: group.length, homeCovers: groupHomeCovers,
      awayCovers: groupAwayCovers, pushes: groupPushes,
      homeCoverRate: groupDecisions ? groupHomeCovers / groupDecisions : null,
      awayCoverRate: groupDecisions ? groupAwayCovers / groupDecisions : null };
  });
  const scoredGroups = distanceGroups.map((group) => ({ ...group, decisions: group.homeCovers + group.awayCovers,
    split: group.homeCoverRate === null ? null : (group.homeCoverRate - 0.5) * 100 })).filter((group) => group.decisions);
  const weightedSplit = scoredGroups.length ? scoredGroups.reduce((sum, group) => sum + group.split * group.decisions, 0) / scoredGroups.reduce((sum, group) => sum + group.decisions, 0) : null;
  const consistency = weightedSplit === null ? null : Math.abs(weightedSplit) / (scoredGroups.reduce((sum, group) => sum + Math.abs(group.split) * group.decisions, 0) / scoredGroups.reduce((sum, group) => sum + group.decisions, 0));
  const confidence = consistency === null ? null : Math.round(100 * consistency * (1 - Math.exp(-decisions / 20)));
  return {
    filters: {
      gameType: input.gameType,
      weekWindow: window,
      spreadBand,
    featureWeights: FEATURE_WEIGHTS,
    minimumFeatureCoverage: MINIMUM_FEATURE_COVERAGE,
      maximumSimilarityDistance: MAXIMUM_SIMILARITY_DISTANCE,
       limit: limit ?? null,
    },
    candidates,
    outsideSpreadCandidates,
    distanceGroups, coverMargins: { home: homeMargin, away: awayMargin,
      medianGap: homeMargin.median === null || awayMargin.median === null ? null : homeMargin.median - awayMargin.median },
    confidence: { coverSplit: decisions ? ((homeCovers / decisions) - 0.5) * 100 : null,
      coverSplitInterval: coverSplitInterval(homeCovers, decisions), decidedGameCount: decisions,
      weightedConfidence: confidence, weightedSplit },
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
       !validKickoff(input.kickoff) || !validCurrentOdds(input.currentOdds, input.closingSpreadHome)) {
    throw new Error('Invalid input matchup snapshot');
  }
  for (const side of ['homePregame', 'awayPregame']) {
    if (!input[side] || FEATURE_FIELDS.some((field) => !Number.isFinite(input[side][field]))) {
      throw new Error(`Input ${side} requires complete finite comparison features`);
    }
  }
}

function validCurrentOdds(currentOdds, closingSpreadHome) {
  if (!currentOdds || typeof currentOdds !== 'object' || Array.isArray(currentOdds) ||
      !['the-odds-api', 'nflverse'].includes(currentOdds.provider) ||
      typeof currentOdds.retrievedAt !== 'string' || !Number.isFinite(Date.parse(currentOdds.retrievedAt)) ||
      !Number.isFinite(currentOdds.consensusSpreadHome) ||
      currentOdds.consensusSpreadHome !== closingSpreadHome) return false;
  if (currentOdds.provider === 'nflverse') return true;
  return Number.isInteger(currentOdds.contributingBooks) && currentOdds.contributingBooks > 0 &&
    Array.isArray(currentOdds.homeSpreads) && currentOdds.homeSpreads.length > 0 &&
    currentOdds.homeSpreads.every(Number.isFinite);
}

function isCompleteHistorical(record) {
  return record && typeof record === 'object' && !Array.isArray(record) &&
    Number.isInteger(record.season) && Number.isInteger(record.week) && record.week >= 1 &&
    ['REG', 'POST'].includes(record.gameType) && nonEmpty(record.gameId) &&
    nonEmpty(record.homeTeam) && nonEmpty(record.awayTeam) &&
    Number.isFinite(record.homeScore) && Number.isFinite(record.awayScore) &&
    Number.isFinite(record.closingSpreadHome) &&
    ['homePregame', 'awayPregame'].every((side) => record[side] && typeof record[side] === 'object');
}

function featureKeysFor(input, record) {
  return Object.keys(FEATURE_WEIGHTS).filter((key) => key === 'closingSpreadHome' || Number.isFinite(record[`${key.split('.')[0]}Pregame`]?.[key.split('.')[1]]));
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
