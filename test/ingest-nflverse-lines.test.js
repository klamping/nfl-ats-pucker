const assert = require('node:assert/strict');
const { existsSync } = require('node:fs');
const { mkdtemp, readFile, readdir } = require('node:fs/promises');
const { tmpdir } = require('node:os');
const path = require('node:path');
const test = require('node:test');

const { runNflverseIngestion, runCli } = require('../src/ingest-nflverse-lines');
const { downloadNflverseGames } = require('../src/nflverse-client');

const sourceUrl = 'https://raw.githubusercontent.com/nflverse/nfldata/master/data/games.csv';
const retrievedAt = '2026-09-26T12:34:56.000Z';

function game(gameId, season, changes = {}) {
  return {
    game_id: gameId,
    season: String(season),
    week: '1',
    game_type: 'REG',
    gameday: `${season}-09-04`,
    away_team: 'DAL',
    home_team: 'PHI',
    away_score: '24',
    home_score: '27',
    spread_line: '2.5',
    ...changes,
  };
}

function fixtureClient(rows, csv = 'game_id,season,spread_line\nfixture,2025,2.5\n') {
  return { async downloadNflverseGames() { return { rows, csv, retrievedAt, sourceUrl }; } };
}

async function tempRoot() {
  return mkdtemp(path.join(tmpdir(), 'nflverse-ingest-'));
}

async function jsonLines(file) {
  const text = await readFile(file, 'utf8');
  return text ? text.trimEnd().split('\n').map(JSON.parse) : [];
}

async function publishedPair(outputRoot, start, end) {
  const directory = path.join(outputRoot, 'data', 'normalized', 'nfl');
  const prefix = `nflverse-lines-${start}-${end}`;
  const manifestPath = path.join(directory, `${prefix}.current.json`);
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  const acceptedPath = path.join(directory, manifest.accepted);
  const rejectedPath = path.join(directory, manifest.rejected);
  assert.equal(path.dirname(acceptedPath), path.dirname(rejectedPath));
  assert.equal(path.basename(acceptedPath), `${prefix}.accepted.jsonl`);
  assert.equal(path.basename(rejectedPath), `${prefix}.rejected.jsonl`);
  return { manifestPath, acceptedPath, rejectedPath, accepted: await jsonLines(acceptedPath), rejected: await jsonLines(rejectedPath) };
}

test('ingests inclusive seasons once and stores the original CSV plus sorted, separate JSONL', async () => {
  const outputRoot = await tempRoot();
  const csv = 'game_id,season,spread_line\noriginal,2025,2.5\n';
  const rows = [
    game('out_2023', 2023),
    game('z_2025', 2025, { game_type: 'WC' }),
    game('z_rejected', 2024, { spread_line: '' }),
    game('a_rejected', 2025, { home_team: '' }),
    game('a_2024', 2024),
    game('out_2026', 2026),
  ];
  let downloads = 0;
  const client = fixtureClient(rows, csv);
  const wrappedClient = { async downloadNflverseGames() { downloads += 1; return client.downloadNflverseGames(); } };

  const result = await runNflverseIngestion({ startSeason: 2024, endSeason: 2025, outputRoot, client: wrappedClient });

  assert.equal(downloads, 1);
  assert.deepEqual({ fetchedRows: result.fetchedRows, inRangeRows: result.inRangeRows, accepted: result.accepted, rejected: result.rejected },
    { fetchedRows: 6, inRangeRows: 4, accepted: 2, rejected: 2 });
  assert.equal(path.dirname(result.rawPath), path.join(outputRoot, 'data', 'raw', 'nflverse'));
  assert.match(path.basename(result.rawPath), /^games-2026-09-26T12-34-56\.000Z-capture-001\.csv$/);
  assert.equal(await readFile(result.rawPath, 'utf8'), csv);
  assert.deepEqual(await readdir(path.dirname(result.rawPath)), [path.basename(result.rawPath)]);

  const { manifestPath, acceptedPath, rejectedPath, accepted, rejected } = await publishedPair(outputRoot, 2024, 2025);
  assert.equal(result.manifestPath, manifestPath);
  assert.equal(result.acceptedPath, acceptedPath);
  assert.equal(result.rejectedPath, rejectedPath);
  assert.deepEqual(accepted.map((record) => record.gameId), ['a_2024', 'z_2025']);
  assert.deepEqual(rejected.map((record) => record.gameId), ['a_rejected', 'z_rejected']);
  assert.deepEqual(rejected.map((record) => record.reason), ['missing_team', 'missing_spread']);
  assert.equal(accepted[0].closingSpreadHome, -2.5);
  assert.equal(accepted[0].spreadOrientation, 'home_team');
  assert.equal(accepted[1].gameType, 'POST');
  assert.equal(accepted[1].sourceGameType, 'WC');
  for (const record of [...accepted, ...rejected]) {
    assert.equal(record.sourceUrl, sourceUrl);
    assert.equal(record.retrievedAt, retrievedAt);
    assert.equal(record.source, 'nflverse');
    assert.equal(Object.hasOwn(record, 'openingSpread'), false);
    assert.equal(Object.hasOwn(record, 'lineMovement'), false);
  }
});

test('repeated downloads preserve each raw CSV without overwriting earlier captures', async () => {
  const outputRoot = await tempRoot();
  const args = { startSeason: 2025, endSeason: 2025, outputRoot };
  const first = await runNflverseIngestion({ ...args, client: fixtureClient([game('a', 2025)], 'first\n') });
  const second = await runNflverseIngestion({ ...args, client: fixtureClient([game('b', 2025)], 'second\n') });

  assert.notEqual(first.rawPath, second.rawPath);
  assert.match(path.basename(second.rawPath), /-capture-002\.csv$/);
  assert.equal(await readFile(first.rawPath, 'utf8'), 'first\n');
  assert.equal(await readFile(second.rawPath, 'utf8'), 'second\n');
  assert.notEqual(first.acceptedPath, second.acceptedPath);
  assert.deepEqual((await publishedPair(outputRoot, 2025, 2025)).accepted.map((row) => row.gameId), ['b']);
  assert.deepEqual((await jsonLines(first.acceptedPath)).map((row) => row.gameId), ['a']);
});

test('failed download or malformed response leaves existing normalized files untouched', async () => {
  const outputRoot = await tempRoot();
  const args = { startSeason: 2025, endSeason: 2025, outputRoot };
  await runNflverseIngestion({ ...args, client: fixtureClient([game('a', 2025)]) });
  const first = await publishedPair(outputRoot, 2025, 2025);
  const before = await readFile(first.manifestPath, 'utf8');
  const rawDirectory = path.join(outputRoot, 'data', 'raw', 'nflverse');

  await assert.rejects(runNflverseIngestion({ ...args, client: { async downloadNflverseGames() { throw new Error('download failed'); } } }), /download failed/);
  await assert.rejects(runNflverseIngestion({ ...args, client: fixtureClient(undefined, 'malformed') }), /invalid nflverse download/);
  assert.equal(await readFile(first.manifestPath, 'utf8'), before);
  assert.deepEqual((await publishedPair(outputRoot, 2025, 2025)).accepted, first.accepted);
  assert.equal((await readdir(rawDirectory)).length, 1);

  const emptyRoot = await tempRoot();
  await assert.rejects(runNflverseIngestion({ ...args, outputRoot: emptyRoot, client: { async downloadNflverseGames() { throw new Error('offline'); } } }), /offline/);
  assert.equal(existsSync(path.join(emptyRoot, 'data')), false);
});

test('a parseable CSV without required schedule columns cannot replace normalized data or create a raw capture', async () => {
  const outputRoot = await tempRoot();
  const args = { startSeason: 2025, endSeason: 2025, outputRoot };
  const first = await runNflverseIngestion({ ...args, client: fixtureClient([game('safe', 2025)]) });
  const { manifestPath, acceptedPath, rejectedPath } = await publishedPair(outputRoot, 2025, 2025);
  const manifestBefore = await readFile(manifestPath, 'utf8');
  const acceptedBefore = await readFile(acceptedPath, 'utf8');
  const rejectedBefore = await readFile(rejectedPath, 'utf8');
  const rawBefore = await readdir(path.dirname(first.rawPath));
  const client = { downloadNflverseGames: () => downloadNflverseGames(async () => ({
    ok: true,
    status: 200,
    text: async () => 'game_id,season,week,game_type\n2025_01_DAL_PHI,2025,1,REG\n',
  })) };

  await assert.rejects(runNflverseIngestion({ ...args, client }), /nflverse.*(csv|column)/i);
  assert.equal(await readFile(manifestPath, 'utf8'), manifestBefore);
  assert.equal(await readFile(acceptedPath, 'utf8'), acceptedBefore);
  assert.equal(await readFile(rejectedPath, 'utf8'), rejectedBefore);
  assert.deepEqual(await readdir(path.dirname(first.rawPath)), rawBefore);

  const emptyRoot = await tempRoot();
  await assert.rejects(runNflverseIngestion({ ...args, outputRoot: emptyRoot, client }), /nflverse.*(csv|column)/i);
  assert.equal(existsSync(path.join(emptyRoot, 'data')), false);
});

test('rejects invalid season ranges before downloading or writing', async () => {
  const outputRoot = await tempRoot();
  const client = { async downloadNflverseGames() { throw new Error('should not download'); } };
  for (const [startSeason, endSeason] of [[2026, 2025], [2004, 2005], ['x', 2025]]) {
    await assert.rejects(runNflverseIngestion({ startSeason, endSeason, outputRoot, client }), /season range/);
  }
  assert.equal(existsSync(path.join(outputRoot, 'data')), false);
});

test('validate downloads once and writes one raw capture with outputs for exactly the five sample seasons', async () => {
  const outputRoot = await tempRoot();
  const calls = [];
  const logs = [];
  const client = { async downloadNflverseGames() {
    calls.push('download');
    return fixtureClient([2005, 2010, 2015, 2020, 2025, 2012].map((year) => game(`g_${year}`, year))).downloadNflverseGames();
  } };

  const summaries = await runCli(['validate', '--output-root', outputRoot], { log: (line) => logs.push(line) }, client);

  assert.equal(calls.length, 1);
  assert.deepEqual(summaries.map((summary) => summary.inRangeRows), [1, 1, 1, 1, 1]);
  assert.deepEqual(summaries.map((summary) => summary.fetchedRows), [6, 6, 6, 6, 6]);
  assert.equal(new Set(summaries.map((summary) => summary.rawPath)).size, 1);
  assert.deepEqual(await readdir(path.join(outputRoot, 'data', 'raw', 'nflverse')), [path.basename(summaries[0].rawPath)]);
  assert.equal(logs.length, 5);
  assert.deepEqual(logs.map((line) => Number(line.match(/^season=(\d+)/)[1])), [2005, 2010, 2015, 2020, 2025]);
  for (const [index, season] of [2005, 2010, 2015, 2020, 2025].entries()) {
    assert.match(logs[index], new RegExp(`^season=${season} .*accepted=1 rejected=0$`));
    const pair = await publishedPair(outputRoot, season, season);
    assert.equal(pair.accepted.length, 1);
    assert.equal(summaries[index].manifestPath, pair.manifestPath);
  }
  assert.equal(existsSync(path.join(outputRoot, 'data', 'normalized', 'nfl', 'nflverse-lines-2012-2012.current.json')), false);
  assert.equal((await readdir(path.join(outputRoot, 'data', 'normalized', 'nfl'))).length, 10);
});

for (const failure of ['output write', 'publish']) {
  test(`${failure} failure preserves prior published accepted/rejected pair`, async () => {
    const outputRoot = await tempRoot();
    const args = { startSeason: 2025, endSeason: 2025, outputRoot };
    const first = await runNflverseIngestion({ ...args, client: fixtureClient([game('old', 2025), game('old_bad', 2025, { spread_line: '' })]) });
    const pointerBefore = await readFile(first.manifestPath, 'utf8');
    const fileSystem = {
      ...require('node:fs/promises'),
      async writeFile(file, contents, options) {
        if (failure === 'output write' && file.endsWith('.rejected.jsonl')) throw new Error('injected output write failure');
        return require('node:fs/promises').writeFile(file, contents, options);
      },
      async rename(from, to) {
        if (failure === 'publish') throw new Error('injected publish failure');
        return require('node:fs/promises').rename(from, to);
      },
    };

    await assert.rejects(runNflverseIngestion({ ...args, fileSystem,
      client: fixtureClient([game('new', 2025), game('new_bad', 2025, { spread_line: '' })]),
    }), new RegExp(`injected ${failure} failure`));

    assert.equal(await readFile(first.manifestPath, 'utf8'), pointerBefore);
    const current = await publishedPair(outputRoot, 2025, 2025);
    assert.equal(current.acceptedPath, first.acceptedPath);
    assert.equal(current.rejectedPath, first.rejectedPath);
    assert.deepEqual(current.accepted.map((row) => row.gameId), ['old']);
    assert.deepEqual(current.rejected.map((row) => row.gameId), ['old_bad']);
    const normalizedDirectory = path.dirname(first.manifestPath);
    assert.equal((await readdir(normalizedDirectory)).filter((name) => name.endsWith('.current.json')).length, 1);
  });
}

test('ingest CLI requires and applies an inclusive start/end season', async () => {
  const outputRoot = await tempRoot();
  const logs = [];
  const client = fixtureClient([game('in', 2025), game('out', 2024)]);

  const summary = await runCli(['ingest', '--start-season', '2025', '--end-season', '2025', '--output-root', outputRoot], { log: (line) => logs.push(line) }, client);

  assert.equal(summary.inRangeRows, 1);
  assert.match(logs[0], /^seasons=2025-2025 fetchedRows=2 inRangeRows=1 accepted=1 rejected=0$/);
  await assert.rejects(runCli(['ingest', '--start-season', '2025'], console, client), /season range/);
});
