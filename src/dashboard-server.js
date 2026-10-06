const defaultFileSystem = require('node:fs/promises');
const http = require('node:http');
const path = require('node:path');

const { compareHistorical } = require('./compare-historical');

const STATIC_ASSETS = {
  '/': ['index.html', 'text/html; charset=utf-8'],
  '/app.js': ['app.js', 'text/javascript; charset=utf-8'],
  '/chart.js': ['../../node_modules/chart.js/dist/chart.umd.js', 'text/javascript; charset=utf-8'],
  '/styles.css': ['styles.css', 'text/css; charset=utf-8'],
};
const PROFILE_FIELDS = [
  'pointsScoredPerGame', 'pointsAllowedPerGame', 'netYardsPerPlay', 'netEpaPerPlay',
  'turnoverMarginPerGame', 'restDays',
  'passingEpaPerDropback', 'rushingEpaPerCarry', 'explosivePlayRate',
  'passingCpoe', 'interceptionRate', 'rushingYardsPerCarry',
  'passingExplosiveRate', 'rushingExplosiveRate', 'penaltyYardsPerGame',
  'offensiveSackRate', 'defensiveSackRate',
];

function buildDashboardPayload(input, comparison) {
  return {
    target: {
      gameId: input.gameId,
      season: input.season,
      week: input.week,
      gameType: input.gameType,
      homeTeam: input.homeTeam,
      awayTeam: input.awayTeam,
      kickoff: { date: input.kickoff.date, time: input.kickoff.time },
      currentOdds: projectCurrentOdds(input.currentOdds),
      homePregame: projectProfile(input.homePregame),
      awayPregame: projectProfile(input.awayPregame),
    },
    filters: {
      gameType: comparison.filters.gameType,
      weekWindow: {
        startWeek: comparison.filters.weekWindow.startWeek,
        endWeek: comparison.filters.weekWindow.endWeek,
      },
      spreadBand: comparison.filters.spreadBand,
      featureWeights: { ...comparison.filters.featureWeights },
      minimumFeatureCoverage: comparison.filters.minimumFeatureCoverage,
      maximumSimilarityDistance: comparison.filters.maximumSimilarityDistance,
      limit: comparison.filters.limit,
    },
    summary: {
      candidateCount: comparison.summary.candidateCount,
      homeCovers: comparison.summary.homeCovers,
      awayCovers: comparison.summary.awayCovers,
      pushes: comparison.summary.pushes,
      homeCoverRate: comparison.summary.homeCoverRate,
    },
    distanceGroups: comparison.distanceGroups.map((group) => ({ ...group })),
    coverMargins: { home: { ...comparison.coverMargins.home }, away: { ...comparison.coverMargins.away }, medianGap: comparison.coverMargins.medianGap },
    confidence: { ...comparison.confidence },
    candidates: comparison.candidates.map((candidate) => ({
      gameId: candidate.gameId,
      season: candidate.season,
      week: candidate.week,
      gameType: candidate.gameType,
      homeTeam: candidate.homeTeam,
      awayTeam: candidate.awayTeam,
      homeScore: candidate.homeScore,
      awayScore: candidate.awayScore,
      closingSpreadHome: candidate.closingSpreadHome,
      similarityScore: candidate.similarityScore,
      distanceContributions: { ...candidate.distanceContributions },
      featureCoverage: candidate.featureCoverage,
      omittedFeatures: [...candidate.omittedFeatures],
      homeAtsMargin: candidate.homeAtsMargin,
      outcome: candidate.outcome,
    })),
    outsideSpreadCandidates: comparison.outsideSpreadCandidates.map((candidate) => ({
      gameId: candidate.gameId,
      season: candidate.season,
      week: candidate.week,
      gameType: candidate.gameType,
      homeTeam: candidate.homeTeam,
      awayTeam: candidate.awayTeam,
      homeScore: candidate.homeScore,
      awayScore: candidate.awayScore,
      closingSpreadHome: candidate.closingSpreadHome,
      similarityScore: candidate.similarityScore,
      distanceContributions: { ...candidate.distanceContributions },
      featureCoverage: candidate.featureCoverage,
      omittedFeatures: [...candidate.omittedFeatures],
      homeAtsMargin: candidate.homeAtsMargin,
      outcome: candidate.outcome,
      spreadDifference: candidate.spreadDifference,
      spreadBandExcess: candidate.spreadBandExcess,
    })),
  };
}

function projectCurrentOdds(currentOdds) {
  const projected = {
    provider: currentOdds.provider,
    consensusSpreadHome: currentOdds.consensusSpreadHome,
  };
  if (currentOdds.provider === 'the-odds-api') {
    projected.contributingBooks = currentOdds.contributingBooks;
  }
  return projected;
}

function projectProfile(features) {
  return Object.fromEntries(PROFILE_FIELDS.map((field) => [field,
    Number.isFinite(features?.[field]) ? features[field] : null]));
}

async function loadPayload({ inputPath, fileSystem, outputRoot }) {
  if (typeof inputPath !== 'string' || !inputPath) throw new Error('A valid --input path is required');
  let input;
  try {
    input = JSON.parse(await fileSystem.readFile(path.resolve(inputPath), 'utf8'));
  } catch {
    throw new Error('Unable to load input snapshot');
  }

  const historicalMatchups = await loadHistoricalMatchups({ outputRoot, fileSystem });
  try {
    return buildDashboardPayload(input, compareHistorical({ input, historicalMatchups }));
  } catch {
    throw new Error('Invalid comparison input');
  }
}

async function loadHistoricalMatchups({ outputRoot, fileSystem }) {
  const directory = path.resolve(outputRoot, 'data', 'normalized', 'nfl');
  let manifest;
  try {
    manifest = JSON.parse(await fileSystem.readFile(
      path.join(directory, 'nflverse-team-matchups-2005-2025.current.json'), 'utf8'));
  } catch {
    throw new Error('Unable to load historical matchup manifest');
  }
  if (typeof manifest?.accepted !== 'string' || !manifest.accepted || path.isAbsolute(manifest.accepted) ||
      manifest.accepted.split(/[\\/]/).includes('..')) {
    throw new Error('Invalid historical matchup manifest accepted path');
  }
  const acceptedPath = path.resolve(directory, manifest.accepted);
  if (acceptedPath !== directory && !acceptedPath.startsWith(`${directory}${path.sep}`)) {
    throw new Error('Invalid historical matchup manifest accepted path');
  }
  let realDirectory;
  let realAcceptedPath;
  try {
    realDirectory = await fileSystem.realpath(directory);
    realAcceptedPath = await fileSystem.realpath(acceptedPath);
  } catch {
    throw new Error('Invalid historical matchup manifest accepted path');
  }
  if (realAcceptedPath !== realDirectory && !realAcceptedPath.startsWith(`${realDirectory}${path.sep}`)) {
    throw new Error('Invalid historical matchup manifest accepted path');
  }

  let historicalMatchups;
  try {
    const jsonl = await fileSystem.readFile(realAcceptedPath, 'utf8');
    historicalMatchups = jsonl.split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line));
  } catch {
    throw new Error('Unable to load accepted historical matchups');
  }

  return historicalMatchups;
}

async function createDashboardServer({ inputPath, outputRoot = process.cwd(),
  fileSystem = defaultFileSystem, port = 0 } = {}) {
  if (!Number.isInteger(port) || port < 0 || port > 65535) throw new Error('Invalid dashboard port');
  const payload = JSON.stringify(await loadPayload({ inputPath, outputRoot, fileSystem }));
  const assets = {};
  try {
    for (const [route, [name, contentType]] of Object.entries(STATIC_ASSETS)) {
      assets[route] = { body: await defaultFileSystem.readFile(path.join(__dirname, '../public/dashboard', name)), contentType };
    }
  } catch {
    throw new Error('Unable to load dashboard assets');
  }
  const server = http.createServer((request, response) => {
    response.setHeader('Cache-Control', 'no-store');
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader('Referrer-Policy', 'no-referrer');
    response.setHeader('Content-Security-Policy', "default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'");
    if (request.method !== 'GET') {
      response.writeHead(405, { 'Content-Type': 'text/plain; charset=utf-8', Allow: 'GET' });
      response.end('Method not allowed');
    } else if (request.url === '/api/comparison') {
      response.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      response.end(payload);
    } else if (Object.hasOwn(assets, request.url)) {
      response.writeHead(200, { 'Content-Type': assets[request.url].contentType });
      response.end(assets[request.url].body);
    } else {
      response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      response.end('Not found');
    }
  });
  try {
    await new Promise((resolve, reject) => {
      server.once('error', reject);
      server.listen(port, '127.0.0.1', () => {
        server.removeListener('error', reject);
        resolve();
      });
    });
  } catch {
    throw new Error('Unable to start local dashboard server');
  }
  return server;
}

function parseCli(argv) {
  if (argv.length !== 2 || argv[0] !== '--input' || !argv[1] || argv[1].startsWith('--')) {
    throw new Error('A single --input path is required');
  }
  return argv[1];
}

async function runDashboardCli(argv = process.argv.slice(2), output = console, dependencies = {}) {
  const inputPath = parseCli(argv);
  const server = await createDashboardServer({ port: 3000, ...dependencies, inputPath });
  output.log(`http://127.0.0.1:${server.address().port}/`);
  return server;
}

if (require.main === module) {
  runDashboardCli().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}

module.exports = { buildDashboardPayload, createDashboardServer, loadHistoricalMatchups, runDashboardCli };
