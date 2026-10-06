const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { gatherLineupContext } = require('../src/lineup-context');
const time = '2026-10-06T12:00:00.000Z';
const oldTime = '2026-10-05T12:00:00.000Z';
const now = () => new Date(time);
const slot = (position, rank, player) => ({ position, rank, player });
const official = () => ({ source: 'nfl.com', retrievedAt: time, injuries: [], transactions: [],
  rawCaptures: [{ sourceUrl: 'https://www.nfl.com/injuries/', body: '<html>official</html>' }] });
const depth = (slots = [slot('QB', 1, 'Old Starter')], retrievedAt = time) => ({ source: 'ourlads', retrievedAt,
  sourceUpdatedAt: oldTime, slots, rawCapture: { sourceUrl: 'https://www.ourlads.com/nfldepthcharts/depthchart/ARZ', body: '<html>depth</html>' } });
async function setup(t) {
  const root = await fs.mkdtemp('/tmp/opencode/lineup-context-');
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  return root;
}
const collect = (root, value = depth(), extra = {}) => gatherLineupContext({ team: 'ARI', outputRoot: root, now,
  nflClient: { fetchOfficial: async () => official() }, depthChartClient: { fetchDepthChart: async () => value }, ...extra });

test('establishes an initial baseline and persists immutable local raw and normalized captures', async (t) => {
  const root = await setup(t);
  const result = await collect(root, depth([
    slot('WR', 2, 'Reserve Receiver'), slot('QB', 3, 'Third Quarterback'),
    slot('QB', 1, 'Starting Quarterback'),
  ]));
  assert.equal(result.official.status, 'ready');
  assert.equal(result.depthChart.baseline, 'unavailable');
  assert.deepEqual(result.depthChart.changes, []);
  assert.deepEqual(result.depthChart.slots, [
    slot('QB', 1, 'Starting Quarterback'),
    slot('WR', 2, 'Reserve Receiver'),
  ]);
  const raws = await fs.readdir(path.join(root, 'data/raw/lineups/ARI'));
  assert.equal(raws.length, 2);
  assert.ok((await Promise.all(raws.map(file => fs.readFile(path.join(root, 'data/raw/lineups/ARI', file), 'utf8')))).includes('<html>depth</html>'));
  const snapshots = await fs.readdir(path.join(root, 'data/current/lineups/ARI'));
  assert.equal(snapshots.length, 2);
  const saved = await Promise.all(snapshots.map(async file => JSON.parse(await fs.readFile(path.join(root, 'data/current/lineups/ARI', file), 'utf8'))));
  assert.deepEqual(saved.find(value => value.source === 'ourlads').slots, [
    slot('QB', 1, 'Starting Quarterback'),
    slot('WR', 2, 'Reserve Receiver'),
  ]);
  assert.equal(JSON.stringify(saved).includes('<html>'), false);
  await collect(root);
  assert.equal((await fs.readdir(path.join(root, 'data/current/lineups/ARI'))).length, 4, 'same-clock captures never overwrite');
});

test('diffs replacements, entrants and removals against the latest strictly earlier valid team snapshot', async (t) => {
  const root = await setup(t);
  await collect(root, depth([slot('QB', 1, 'Older Starter')], '2026-10-04T12:00:00.000Z'));
  await collect(root, depth([slot('QB', 1, 'Old Starter'), slot('RB', 2, 'Removed Reserve')], oldTime));
  await collect(root, depth([slot('QB', 1, 'Same Time')], time));
  await collect(root, depth([slot('QB', 1, 'Future Starter')], '2026-10-07T12:00:00.000Z'));
  const dir = path.join(root, 'data/current/lineups/ARI');
  await fs.writeFile(path.join(dir, 'malformed.json'), '{');
  await fs.writeFile(path.join(dir, 'wrong-team.json'), JSON.stringify({ team: 'LA', source: 'ourlads', retrievedAt: oldTime, sourceUpdatedAt: oldTime, slots: [slot('QB', 1, 'Wrong Team')] }));
  await fs.writeFile(path.join(dir, 'invalid-slots.json'), JSON.stringify({ team: 'ARI', source: 'ourlads', retrievedAt: '2026-10-06T11:00:00Z', sourceUpdatedAt: oldTime, slots: [{}] }));
  const result = await collect(root, depth([slot('QB', 1, 'New Starter'), slot('WR', 2, 'New Reserve'), slot('QB', 3, 'Ignored')]));
  assert.equal(result.depthChart.baseline, 'available');
  assert.deepEqual(result.depthChart.changes, [
    { position: 'QB', rank: 1, outgoingPlayer: 'Old Starter', incomingPlayer: 'New Starter' },
    { position: 'RB', rank: 2, outgoingPlayer: 'Removed Reserve', incomingPlayer: null },
    { position: 'WR', rank: 2, outgoingPlayer: null, incomingPlayer: 'New Reserve' },
  ]);
});

test('ignores third string and reports unchanged first and second strings as no changes', async (t) => {
  const root = await setup(t);
  await collect(root, depth([slot('QB', 1, 'Starter'), slot('QB', 2, 'Backup'), slot('QB', 3, 'Old Third')], oldTime));
  const result = await collect(root, depth([slot('QB', 1, 'Starter'), slot('QB', 2, 'Backup'), slot('QB', 3, 'New Third')]));
  assert.equal(result.depthChart.baseline, 'available');
  assert.deepEqual(result.depthChart.changes, []);
});

test('isolates each source request failure without hiding the other source', async (t) => {
  const root = await setup(t);
  const failure = async () => { throw Object.assign(new Error('private upstream detail'), { code: 'LINEUP_SOURCE' }); };
  const first = await collect(root, depth(), { nflClient: { fetchOfficial: failure } });
  assert.deepEqual(first.official, { status: 'unavailable', source: 'nfl.com' });
  assert.equal(first.depthChart.status, 'ready');
  const second = await collect(root, depth(), { depthChartClient: { fetchDepthChart: failure } });
  assert.equal(second.official.status, 'ready');
  assert.deepEqual(second.depthChart, { status: 'unavailable', source: 'ourlads' });
});

test('a snapshot write failure preserves the previous valid snapshot and the other source', async (t) => {
  const root = await setup(t);
  await collect(root, depth([slot('QB', 1, 'Old Starter')], oldTime));
  const directory = path.join(root, 'data/current/lineups/ARI');
  const before = await fs.readdir(directory);
  const failingFs = { ...fs, writeFile: async (file, ...args) => {
    if (file.includes('current/lineups') && file.includes('ourlads')) throw Object.assign(new Error('disk full'), { code: 'ENOSPC' });
    return fs.writeFile(file, ...args);
  } };
  const result = await collect(root, depth([slot('QB', 1, 'Failed Starter')]), { fileSystem: failingFs });
  assert.equal(result.depthChart.status, 'unavailable');
  assert.equal(result.official.status, 'ready');
  for (const file of before) assert.ok((await fs.readdir(directory)).includes(file));
  const next = await collect(root, depth([slot('QB', 1, 'New Starter')]));
  assert.equal(next.depthChart.changes[0].outgoingPlayer, 'Old Starter');
});

test('a write that saves complete snapshot content then fails cannot advance the next baseline', async (t) => {
  const root = await setup(t);
  await collect(root, depth([slot('QB', 1, 'Successful Starter')], oldTime));
  const failingFs = { ...fs, writeFile: async (file, ...args) => {
    await fs.writeFile(file, ...args);
    if (file.includes('current/lineups') && file.includes('ourlads')) throw Object.assign(new Error('close failed'), { code: 'EIO' });
  } };
  const failed = await collect(root, depth([slot('QB', 1, 'Failed Starter')]), { fileSystem: failingFs });
  assert.equal(failed.depthChart.status, 'unavailable');
  const next = await collect(root, depth([slot('QB', 1, 'Next Starter')], '2026-10-07T12:00:00.000Z'));
  assert.deepEqual(next.depthChart.changes, [{ position: 'QB', rank: 1,
    outgoingPlayer: 'Successful Starter', incomingPlayer: 'Next Starter' }]);
});

test('does not swallow programmer errors or accept unsafe team paths', async (t) => {
  const root = await setup(t);
  await assert.rejects(collect(root, depth(), { nflClient: { fetchOfficial: async () => { throw new TypeError('bug'); } } }), /bug/);
  await assert.rejects(collect(root, depth(), { fileSystem: {} }), /filesystem/i);
  await assert.rejects(collect(root, depth(), { team: '../escape' }), /team/i);
});
