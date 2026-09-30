const defaultFileSystem = require('node:fs/promises');
const http = require('node:http');
const path = require('node:path');
const { compareHistorical } = require('./compare-historical');
const { buildDashboardPayload, loadHistoricalMatchups } = require('./dashboard-server');

function projectSlateGame(input, comparison) {
  const currentOdds = { provider: input.currentOdds.provider, consensusSpreadHome: input.currentOdds.consensusSpreadHome };
  if (input.currentOdds.provider === 'the-odds-api') currentOdds.contributingBooks = input.currentOdds.contributingBooks;
  return { status: 'ready', gameId: input.gameId, matchup: `${input.awayTeam} at ${input.homeTeam}`,
    kickoff: { date: input.kickoff.date, time: input.kickoff.time }, currentOdds,
    candidateCount: comparison.summary.candidateCount, homeCoverRate: comparison.summary.homeCoverRate,
    awayCoverRate: comparison.summary.awayCovers + comparison.summary.homeCovers ?
      comparison.summary.awayCovers / (comparison.summary.awayCovers + comparison.summary.homeCovers) : null };
}

async function createWeekDashboardServer({ season, week, games = [], failures = [], outputRoot = process.cwd(),
  fileSystem = defaultFileSystem, port = 0 } = {}) {
  if (!Number.isInteger(season) || !Number.isInteger(week) || !Array.isArray(games) || !Array.isArray(failures) || !Number.isInteger(port) || port < 0 || port > 65535) throw new Error('Invalid weekly dashboard options');
  const historicalMatchups = await loadHistoricalMatchups({ outputRoot, fileSystem });
  const comparisons = new Map(games.map((input) => [input.gameId, buildDashboardPayload(input,
    compareHistorical({ input, historicalMatchups }))]));
  const slate = JSON.stringify({ season, week, games: [
    ...games.map((input) => projectSlateGame(input, comparisons.get(input.gameId))),
    ...failures.map((failure) => ({ status: 'unavailable', gameId: failure.gameId, message: 'Unable to gather game' })),
  ] });
  const assets = {};
  for (const [route, name, type] of [
    ['/app.js', 'app.js', 'text/javascript; charset=utf-8'], ['/styles.css', 'styles.css', 'text/css; charset=utf-8'],
  ]) assets[route] = { body: await defaultFileSystem.readFile(path.join(__dirname, '../public/dashboard', name)), type };
  const detailHtml = await defaultFileSystem.readFile(path.join(__dirname, '../public/dashboard/index.html'));
  const server = http.createServer((request, response) => {
    response.setHeader('Cache-Control', 'no-store'); response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader('Referrer-Policy', 'no-referrer'); response.setHeader('Content-Security-Policy', "default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'");
    if (request.method !== 'GET') { response.writeHead(405, { 'Content-Type': 'text/plain; charset=utf-8', Allow: 'GET' }); response.end('Method not allowed'); return; }
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
