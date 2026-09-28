const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const http = require('node:http');
const fs = require('node:fs/promises');
const { compareHistorical } = require('../src/compare-historical');
const { createDashboardServer, runDashboardCli } = require('../src/dashboard-server');

const FEATURES = ['gamesPlayed', 'winPercentage', 'pointsScoredPerGame', 'pointsAllowedPerGame',
  'netYardsPerPlay', 'netEpaPerPlay', 'turnoverMarginPerGame', 'offensiveSackRate',
  'defensiveSackRate', 'restDays', 'passingEpaPerDropback', 'rushingEpaPerCarry',
  'explosivePlayRate', 'passingCpoe', 'interceptionRate', 'rushingYardsPerCarry',
  'passingExplosiveRate', 'rushingExplosiveRate', 'penaltyYardsPerGame'];
const PROFILE_FIELDS = ['passingEpaPerDropback', 'rushingEpaPerCarry', 'explosivePlayRate',
  'passingCpoe', 'interceptionRate', 'rushingYardsPerCarry', 'passingExplosiveRate',
  'rushingExplosiveRate', 'penaltyYardsPerGame', 'offensiveSackRate', 'defensiveSackRate'];
const ROOT = '/repo';
const INPUT = '/private/input.json';
const MANIFEST = path.join(ROOT, 'data/normalized/nfl/nflverse-team-matchups-2005-2025.current.json');
const ACCEPTED = path.join(ROOT, 'data/normalized/nfl/run/matchups.accepted.jsonl');

function snapshot(overrides = {}) {
  const features = Object.fromEntries(FEATURES.map((field) => [field, 1]));
  return {
    gameId: 'target-1', season: 2026, week: 3, gameType: 'REG',
    homeTeam: 'HME', awayTeam: 'AWY', kickoff: { date: '2026-09-20', time: '13:00' },
    closingSpreadHome: -3, homePregame: features, awayPregame: features,
    currentOdds: { provider: 'the-odds-api', retrievedAt: '2026-09-01T00:00:00Z',
      consensusSpreadHome: -3, contributingBooks: 2, homeSpreads: [-3, -3],
      requestUrl: 'https://secret.example/odds?apiKey=TOP_SECRET' },
    sourceUrl: 'https://secret.example/source', rawResponse: { apiKey: 'TOP_SECRET' },
    snapshotPath: INPUT,
    ...overrides,
  };
}

function historical(overrides = {}) {
  return {
    ...snapshot(), gameId: 'historical-1', season: 2020, week: 2,
    homeScore: 24, awayScore: 20, closingSpreadHome: -3,
    providerUrl: 'https://secret.example/provider', ...overrides,
  };
}

function fixture({ input = snapshot(), manifest = { accepted: 'run/matchups.accepted.jsonl' },
  inputText = JSON.stringify(input), manifestText = JSON.stringify(manifest),
  jsonl = `${JSON.stringify(historical())}\n` } = {}) {
  const reads = [];
  const writes = [];
  const files = { [INPUT]: inputText, [MANIFEST]: manifestText, [ACCEPTED]: jsonl };
  const fileSystem = {
    async readFile(file, encoding) {
      reads.push([file, encoding]);
      if (Object.hasOwn(files, file)) return files[file];
      throw new Error(`Private file not found: ${file}`);
    },
    async realpath(file) { return file; },
    writeFile(...args) { writes.push(args); throw new Error('read-only'); },
  };
  return { fileSystem, reads, writes };
}

async function response(server, route = '/api/comparison', options = {}) {
  return fetch(`http://127.0.0.1:${server.address().port}${route}`, options);
}

async function rawStatus(server, route) {
  return new Promise((resolve, reject) => {
    http.get({ hostname: '127.0.0.1', port: server.address().port, path: route }, (result) => {
      result.resume();
      result.on('end', () => resolve(result.statusCode));
    }).on('error', reject);
  });
}

test('CLI requires exactly one --input and rejects all other arguments', async () => {
  const output = { log: () => assert.fail('must not log on invalid arguments') };
  for (const args of [[], ['--input'], ['--input', '--input'], ['--input', INPUT, '--input', INPUT],
    ['--output-root', ROOT, '--input', INPUT], ['--input', INPUT, 'extra']]) {
    await assert.rejects(runDashboardCli(args, output, { fileSystem: fixture().fileSystem }), /input|option/i);
  }
});

test('GET returns a strictly projected target and comparator result without rereading source data', async (t) => {
  const { fileSystem, reads, writes } = fixture();
  const lines = [];
  const server = await runDashboardCli(['--input', INPUT], { log: (line) => lines.push(line) },
    { fileSystem, outputRoot: ROOT, port: 0 });
  t.after(() => new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve())));
  assert.equal(server.address().address, '127.0.0.1');
  assert.deepEqual(lines, [`http://127.0.0.1:${server.address().port}/`]);

  const first = await response(server);
  assert.equal(first.status, 200);
  assert.match(first.headers.get('content-type'), /^application\/json\b/);
  const payload = await first.json();
  assert.deepEqual(Object.keys(payload).sort(), ['candidates', 'filters', 'summary', 'target']);
  assert.deepEqual(payload.target, {
    gameId: 'target-1', season: 2026, week: 3, gameType: 'REG',
    homeTeam: 'HME', awayTeam: 'AWY', kickoff: { date: '2026-09-20', time: '13:00' },
    currentOdds: { provider: 'the-odds-api', consensusSpreadHome: -3, contributingBooks: 2 },
    homePregame: Object.fromEntries(PROFILE_FIELDS.map((field) => [field, 1])),
    awayPregame: Object.fromEntries(PROFILE_FIELDS.map((field) => [field, 1])),
  });
  const expected = compareHistorical({ input: snapshot(), historicalMatchups: [historical()] });
  assert.deepEqual(payload.filters, expected.filters);
  assert.deepEqual(payload.summary, expected.summary);
  assert.deepEqual(payload.candidates, expected.candidates);
  assert.deepEqual(Object.keys(payload.candidates[0]).sort(), [
    'gameId', 'season', 'week', 'gameType', 'homeTeam', 'awayTeam', 'homeScore', 'awayScore',
    'closingSpreadHome', 'similarityScore', 'distanceContributions', 'featureCoverage',
    'omittedFeatures', 'homeAtsMargin', 'outcome',
  ].sort());
  const serialized = JSON.stringify(payload);
  for (const secret of ['TOP_SECRET', 'homeSpreads', 'requestUrl', 'sourceUrl',
    'providerUrl', 'rawResponse', INPUT, ROOT, 'retrievedAt']) {
    assert.equal(serialized.includes(secret), false, `leaked ${secret}`);
  }
  assert.equal((await response(server)).status, 200);
  assert.deepEqual(reads, [[INPUT, 'utf8'], [MANIFEST, 'utf8'], [ACCEPTED, 'utf8']]);
  assert.deepEqual(writes, []);
});

test('GET projects retrospective market metadata without live odds details', async (t) => {
  const input = snapshot({
    currentOdds: { provider: 'nflverse', retrievedAt: '2026-09-01T00:00:00Z', consensusSpreadHome: -3,
      sourceUrl: 'https://secret.example/nflverse', rawResponse: { apiKey: 'TOP_SECRET' } },
  });
  const server = await createDashboardServer({ inputPath: INPUT, outputRoot: ROOT,
    fileSystem: fixture({ input }).fileSystem, port: 0 });
  t.after(() => new Promise((resolve) => server.close(resolve)));

  const payload = await (await response(server)).json();
  assert.deepEqual(payload.target.currentOdds, { provider: 'nflverse', consensusSpreadHome: -3 });
  const serialized = JSON.stringify(payload);
  for (const sensitiveField of ['retrievedAt', 'homeSpreads', 'sourceUrl', 'rawResponse', 'TOP_SECRET']) {
    assert.equal(serialized.includes(sensitiveField), false, `leaked ${sensitiveField}`);
  }
});

test('empty comparison returns stable summary and empty candidates', async (t) => {
  const server = await createDashboardServer({ inputPath: INPUT, outputRoot: ROOT,
    fileSystem: fixture({ jsonl: '' }).fileSystem, port: 0 });
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const payload = await (await response(server)).json();
  assert.deepEqual(payload.candidates, []);
  assert.deepEqual(payload.summary, {
    candidateCount: 0, homeCovers: 0, awayCovers: 0, pushes: 0, homeCoverRate: null,
  });
});

test('serves only the three exact local dashboard routes with safe content types', async (t) => {
  const server = await createDashboardServer({ inputPath: INPUT, outputRoot: ROOT,
    fileSystem: fixture().fileSystem, port: 0 });
  t.after(() => new Promise((resolve) => server.close(resolve)));
  for (const [route, type, marker] of [
    ['/', 'text/html', '<main'],
    ['/app.js', 'text/javascript', '/api/comparison'],
    ['/styles.css', 'text/css', 'prefers-reduced-motion'],
  ]) {
    const result = await response(server, route);
    assert.equal(result.status, 200, route);
    assert.match(result.headers.get('content-type'), new RegExp(`^${type}\\b`), route);
    assert.equal(result.headers.get('x-content-type-options'), 'nosniff');
    assert.match(await result.text(), new RegExp(marker), route);
  }
  for (const route of ['/index.html', '/dashboard/', '/app.js?x=1', '/styles.css/',
    '/%61pp.js', '/%2e%2e/app.js', '/private/input.json']) {
    assert.equal(await rawStatus(server, route), 404, route);
  }
  assert.equal((await response(server, '/app.js', { method: 'HEAD' })).status, 405);
});

test('invalid inputs and manifest paths fail before listening without leaking file errors', async () => {
  for (const options of [
    { input: snapshot({ gameId: '' }) },
    { inputText: '{TOP_SECRET' },
    { manifestText: '{TOP_SECRET' },
    { manifest: { accepted: '../outside.jsonl' } },
    { manifest: { accepted: '/private/outside.jsonl' } },
    { manifest: { accepted: 'run/../../../outside.jsonl' } },
    { manifest: { accepted: 'run/../run/matchups.accepted.jsonl' } },
    { manifest: { accepted: '' } },
    { jsonl: '{bad-json}\n' },
  ]) {
    const source = fixture(options);
    await assert.rejects(createDashboardServer({ inputPath: INPUT, outputRoot: ROOT,
      fileSystem: source.fileSystem, port: 0 }), (error) => {
      assert.equal(/private|outside|bad-json|TOP_SECRET|https?:\/\//.test(error.message), false);
      return true;
    });
    assert.deepEqual(source.writes, []);
  }
  const missing = fixture();
  await assert.rejects(createDashboardServer({ inputPath: '/private/missing.json', outputRoot: ROOT,
    fileSystem: missing.fileSystem }), /snapshot|input/i);
  const missingManifest = fixture();
  missingManifest.fileSystem.readFile = async (file) => {
    if (file === INPUT) return JSON.stringify(snapshot());
    throw new Error(`Secret provider URL https://secret.example?apiKey=TOP_SECRET ${file}`);
  };
  await assert.rejects(createDashboardServer({ inputPath: INPUT, outputRoot: ROOT,
    fileSystem: missingManifest.fileSystem }), (error) => !/TOP_SECRET|https?:\/\/|\/repo/.test(error.message));
  const unavailable = fixture();
  unavailable.fileSystem.readFile = async () => { throw new Error('Private file /repo TOP_SECRET'); };
  await assert.rejects(createDashboardServer({ inputPath: INPUT, outputRoot: ROOT,
    fileSystem: unavailable.fileSystem }), (error) => !/Private|TOP_SECRET|\/repo/.test(error.message));
});

test('rejects an accepted JSONL symlink that escapes the normalized directory', async (t) => {
  const root = await fs.mkdtemp('/tmp/opencode/dashboard-symlink-');
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const directory = path.join(root, 'data/normalized/nfl');
  const inputPath = path.join(root, 'input.json');
  const outsidePath = path.join(root, 'outside.jsonl');
  await fs.mkdir(path.join(directory, 'run'), { recursive: true });
  await fs.writeFile(inputPath, JSON.stringify(snapshot()));
  await fs.writeFile(path.join(directory, 'nflverse-team-matchups-2005-2025.current.json'),
    JSON.stringify({ accepted: 'run/matchups.accepted.jsonl' }));
  await fs.writeFile(outsidePath, `${JSON.stringify(historical())}\n`);
  await fs.symlink(outsidePath, path.join(directory, 'run/matchups.accepted.jsonl'));

  let server;
  try {
    server = await createDashboardServer({ inputPath, outputRoot: root, port: 0 });
    assert.fail('server started with an accepted path outside normalized data');
  } catch (error) {
    assert.match(error.message, /invalid historical matchup manifest accepted path/i);
    assert.equal(error.message.includes(root), false);
  } finally {
    if (server) await new Promise((resolve) => server.close(resolve));
  }
});

test('unknown GET is 404 and non-GET is 405, without exposing private data', async (t) => {
  const server = await createDashboardServer({ inputPath: INPUT, outputRoot: ROOT,
    fileSystem: fixture().fileSystem, port: 0 });
  t.after(() => new Promise((resolve) => server.close(resolve)));
  for (const [method, route, status] of [
    ['GET', '/missing', 404], ['GET', '/api/comparison/../missing', 404],
    ['GET', '/api/comparison?secret=TOP_SECRET', 404], ['POST', '/api/comparison', 405],
    ['DELETE', '/missing', 405],
  ]) {
    const result = await response(server, route, { method });
    assert.equal(result.status, status);
    const body = await result.text();
    assert.equal(/TOP_SECRET|\/repo|\/private|https?:\/\//.test(body), false);
  }
});
