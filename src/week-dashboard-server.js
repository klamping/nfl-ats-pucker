const defaultFileSystem = require('node:fs/promises');
const http = require('node:http');
const path = require('node:path');
const { compareHistorical } = require('./compare-historical');
const { buildDashboardPayload, loadHistoricalMatchups } = require('./dashboard-server');
const { nflverseKickoffToUtc } = require('./gather-pregame');

function projectSlateGame(input, comparison) {
  const currentOdds = { provider: input.currentOdds.provider, consensusSpreadHome: input.currentOdds.consensusSpreadHome };
  if (input.currentOdds.provider === 'the-odds-api') currentOdds.contributingBooks = input.currentOdds.contributingBooks;
  const recommendedPick = comparison.confidence.coverSplit > 0 ? input.homeTeam : comparison.confidence.coverSplit < 0 ? input.awayTeam : null;
  return { status: 'ready', gameId: input.gameId, matchup: `${input.awayTeam} at ${input.homeTeam}`, recommendedPick,
    kickoff: { date: input.kickoff.date, time: input.kickoff.time, utc: nflverseKickoffToUtc(input.kickoff) }, currentOdds,
    candidateCount: comparison.summary.candidateCount, coverSplit: comparison.confidence.coverSplit,
    coverSplitInterval: comparison.confidence.coverSplitInterval, decidedGameCount: comparison.confidence.decidedGameCount,
    weightedConfidence: comparison.confidence.weightedConfidence,
    lineup: { home: projectLineupContext(input.lineup?.home, input.homeTeam),
      away: projectLineupContext(input.lineup?.away, input.awayTeam) } };
}

function projectLineupContext(context, team) {
  const unavailable = (source) => ({ status: 'unavailable', source });
  const result = { team, official: unavailable('nfl.com'), depthChart: unavailable('ourlads') };
  if (context?.team !== team) return result;
  const text = (value) => typeof value === 'string' && value.trim().length > 0;
  const timestamp = (value) => text(value) && Number.isFinite(Date.parse(value));
  const official = context.official;
  if (official?.status === 'ready' && official.source === 'nfl.com' && timestamp(official.retrievedAt) &&
    Array.isArray(official.injuries) && Array.isArray(official.transactions) &&
    official.injuries.every((row) => row && text(row.player) && text(row.position) && text(row.status) && timestamp(row.observedAt)) &&
    official.transactions.every((row) => row && text(row.player) && (row.position === null || text(row.position)) &&
      /^\d{4}-\d{2}-\d{2}$/.test(row.date) && timestamp(row.date) && text(row.detail))) {
    result.official = { status: 'ready', source: 'nfl.com', retrievedAt: official.retrievedAt,
      injuries: official.injuries.map(({ player, position, status, observedAt }) => ({ player, position, status, observedAt })),
      transactions: official.transactions.map(({ date, player, position, detail }) => ({ date, player, position, detail })) };
  }
  const depth = context.depthChart;
  if (depth?.status === 'ready' && depth.source === 'ourlads' && timestamp(depth.retrievedAt) && timestamp(depth.sourceUpdatedAt) &&
    ['available', 'unavailable'].includes(depth.baseline) && Array.isArray(depth.changes) &&
    (depth.baseline === 'available' || depth.changes.length === 0) && depth.changes.every((row) => row && text(row.position) &&
      [1, 2].includes(row.rank) && (row.outgoingPlayer === null || text(row.outgoingPlayer)) &&
      (row.incomingPlayer === null || text(row.incomingPlayer)) && row.incomingPlayer !== row.outgoingPlayer)) {
    result.depthChart = { status: 'ready', source: 'ourlads', retrievedAt: depth.retrievedAt,
      sourceUpdatedAt: depth.sourceUpdatedAt, baseline: depth.baseline,
      changes: depth.changes.map(({ position, rank, outgoingPlayer, incomingPlayer }) => ({ position, rank, outgoingPlayer, incomingPlayer })) };
  }
  const impacts = context.impacts;
  if (impacts?.status === 'ready' && Array.isArray(impacts.playerImpacts) && impacts.playerImpacts.every(validImpact)) {
    result.playerImpacts = impacts.playerImpacts.map(projectImpact);
  }
  return result;
}

function validImpact(impact) {
  const text = (value) => typeof value === 'string' && value.trim().length > 0;
  const finite = (value) => Number.isFinite(value);
  const timestamp = (value) => text(value) && Number.isFinite(Date.parse(value));
  const verdicts = ['material downgrade', 'possible downgrade', 'roughly neutral', 'possible upgrade'];
  if (!impact || !text(impact.player) || !text(impact.position) || impact.status !== 'Out' || !timestamp(impact.observedAt)) return false;
  if (impact.verdict === 'insufficient evidence') return text(impact.reason);
  return verdicts.includes(impact.verdict) && Number.isInteger(impact.depthRole) && impact.depthRole > 0 && text(impact.replacement) &&
    ['low', 'medium', 'high'].includes(impact.confidence) && ['direct', 'unit-proxy'].includes(impact.evidenceType) &&
    Array.isArray(impact.metrics) && impact.metrics.every((metric) => metric && text(metric.key) && text(metric.label) && text(metric.direction) &&
      ['higher', 'lower'].includes(metric.direction) && finite(metric.unavailableValue) && finite(metric.replacementValue) && finite(metric.delta) &&
      finite(metric.unavailableSample) && finite(metric.replacementSample)) &&
    (impact.teamContext === null || text(impact.teamContext)) && impact.sample && finite(impact.sample.unavailable?.value) &&
    finite(impact.sample.unavailable?.sample) && finite(impact.sample.unavailable?.games) && finite(impact.sample.replacement?.value) &&
    finite(impact.sample.replacement?.sample) && finite(impact.sample.replacement?.games) && Array.isArray(impact.caveats) && impact.caveats.every(text);
}

function projectImpact({ player, position, status, observedAt, depthRole, replacement, verdict, confidence, evidenceType, metrics, teamContext, sample, caveats, reason }) {
  if (verdict === 'insufficient evidence') return { player, position, status, observedAt, verdict, reason };
  return { player, position, status, observedAt, depthRole, replacement, verdict, confidence, evidenceType,
    metrics: metrics.map(({ key, label, unavailableValue, replacementValue, delta, direction, unavailableSample, replacementSample }) => ({ key, label, unavailableValue, replacementValue, delta, direction, unavailableSample, replacementSample })),
    teamContext, sample: { unavailable: { value: sample.unavailable.value, sample: sample.unavailable.sample, games: sample.unavailable.games }, replacement: { value: sample.replacement.value, sample: sample.replacement.sample, games: sample.replacement.games } }, caveats };
}

async function createWeekDashboardServer({ season, week, games = [], failures = [], outputRoot = process.cwd(),
  fileSystem = defaultFileSystem, port = 0 } = {}) {
  if (!Number.isInteger(season) || !Number.isInteger(week) || !Array.isArray(games) || !Array.isArray(failures) || !Number.isInteger(port) || port < 0 || port > 65535) throw new Error('Invalid weekly dashboard options');
  const historicalMatchups = await loadHistoricalMatchups({ outputRoot, fileSystem });
  const comparisons = new Map();
  const readyGames = [];
  const unavailable = [...failures];
  for (const input of games) {
    try {
      comparisons.set(input.gameId, buildDashboardPayload(input, compareHistorical({ input, historicalMatchups })));
      readyGames.push(input);
    } catch {
      unavailable.push({ gameId: input.gameId, message: 'Unable to gather game' });
    }
  }
  const slate = JSON.stringify({ season, week, games: [
    ...readyGames.map((input) => projectSlateGame(input, comparisons.get(input.gameId))),
    ...unavailable.map((failure) => ({ status: 'unavailable', gameId: failure.gameId, message: 'Unable to gather game' })),
  ] });
  const assets = {};
  for (const [route, name, type] of [
    ['/app.js', 'app.js', 'text/javascript; charset=utf-8'], ['/chart.js', '../../node_modules/chart.js/dist/chart.umd.js', 'text/javascript; charset=utf-8'], ['/styles.css', 'styles.css', 'text/css; charset=utf-8'],
  ]) assets[route] = { body: await defaultFileSystem.readFile(path.join(__dirname, '../public/dashboard', name)), type };
  assets['/week-app.js'] = { body: await defaultFileSystem.readFile(path.join(__dirname, '../public/week-dashboard/app.js')), type: 'text/javascript; charset=utf-8' };
  const slateHtml = await defaultFileSystem.readFile(path.join(__dirname, '../public/week-dashboard/index.html'));
  const detailHtml = await defaultFileSystem.readFile(path.join(__dirname, '../public/dashboard/index.html'));
  const server = http.createServer((request, response) => {
    response.setHeader('Cache-Control', 'no-store'); response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader('Referrer-Policy', 'no-referrer'); response.setHeader('Content-Security-Policy', "default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'");
    if (!/^((127\.0\.0\.1|localhost)(:\d+)?|\[::1\](?::\d+)?)$/i.test(request.headers.host || '')) { response.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' }); response.end('Forbidden'); return; }
    if (request.method !== 'GET') { response.writeHead(405, { 'Content-Type': 'text/plain; charset=utf-8', Allow: 'GET' }); response.end('Method not allowed'); return; }
    if (request.url === '/') { response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); response.end(slateHtml); return; }
    if (request.url === '/api/slate') { response.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' }); response.end(slate); return; }
    const detail = request.url && request.url.match(/^\/api\/comparison\/([A-Za-z0-9_-]+)$/);
    const page = request.url && request.url.match(/^\/games\/([A-Za-z0-9_-]+)\/$/);
    if (detail && comparisons.has(detail[1])) { response.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' }); response.end(JSON.stringify(comparisons.get(detail[1]))); return; }
    if (page && comparisons.has(page[1])) { response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); response.end(detailHtml); return; }
    if (Object.hasOwn(assets, request.url)) { response.writeHead(200, { 'Content-Type': assets[request.url].type }); response.end(assets[request.url].body); return; }
    response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }); response.end('Not found');
  });
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(port, '127.0.0.1', () => { server.removeListener('error', reject); resolve(); }); });
  return server;
}

module.exports = { createWeekDashboardServer };
