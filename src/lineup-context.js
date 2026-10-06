const defaultFileSystem = require('node:fs/promises');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { createNflLineupClient } = require('./nfl-lineup-client');
const { createOurladsDepthChartClient } = require('./ourlads-depth-chart-client');

const validText = (value) => typeof value === 'string' && value.trim().length > 0;
const validTime = (value) => typeof value === 'string' && Number.isFinite(Date.parse(value));
const isExpectedFailure = (error) => error.code === 'LINEUP_SOURCE' ||
  ['EACCES', 'EPERM', 'ENOSPC', 'EIO', 'EROFS', 'EMFILE', 'ENFILE', 'ENOENT'].includes(error.code);

async function gatherLineupContext({ team, outputRoot = process.cwd(), fileSystem = defaultFileSystem,
  now = () => new Date(), nflClient = createNflLineupClient({ now }),
  depthChartClient = createOurladsDepthChartClient({ now }) } = {}) {
  if (typeof team !== 'string' || !/^[A-Z]{2,3}$/.test(team)) throw new TypeError('Invalid lineup team');
  if (!['mkdir', 'writeFile', 'readFile', 'readdir', 'link', 'unlink'].every((method) => typeof fileSystem[method] === 'function')) {
    throw new TypeError('Invalid lineup filesystem contract');
  }
  if (typeof nflClient.fetchOfficial !== 'function' || typeof depthChartClient.fetchDepthChart !== 'function') {
    throw new TypeError('Invalid lineup client contract');
  }
  const rawDirectory = path.join(outputRoot, 'data/raw/lineups', team);
  const snapshotDirectory = path.join(outputRoot, 'data/current/lineups', team);
  async function gatherSource(source, fetchSource, normalize) {
    try {
      const result = await fetchSource();
      if (result?.source !== source || !validTime(result.retrievedAt)) throw new TypeError('Invalid lineup source result');
      const normalized = normalize(result);
      const captures = source === 'nfl.com' ? result.rawCaptures : [result.rawCapture];
      if (!Array.isArray(captures) || !captures.length || !captures.every((capture) =>
        validText(capture?.body) && validText(capture?.sourceUrl))) throw new TypeError('Invalid lineup capture contract');
      const stem = `${result.retrievedAt.replace(/[:.]/g, '-')}-${source}`;
      for (let index = 0; index < captures.length; index += 1) {
        await writeUnique(fileSystem, rawDirectory, `${stem}-${index + 1}-capture`, 'html', captures[index].body);
      }
      let projected = normalized;
      if (source === 'ourlads') {
        const previous = await findBaseline(fileSystem, snapshotDirectory, team, result.retrievedAt);
        projected = { source, retrievedAt: normalized.retrievedAt, sourceUpdatedAt: normalized.sourceUpdatedAt,
          baseline: previous ? 'available' : 'unavailable', changes: previous ? diffSlots(previous.slots, normalized.slots) : [] };
      }
      await publishSnapshot(fileSystem, snapshotDirectory, stem, `${JSON.stringify({ team, ...normalized }, null, 2)}\n`);
      return { status: 'ready', ...projected };
    } catch (error) {
      if (!isExpectedFailure(error)) throw error;
      return { status: 'unavailable', source };
    }
  }
  const official = await gatherSource('nfl.com', () => nflClient.fetchOfficial({ team, now }), (result) => {
    if (!Array.isArray(result.injuries) || !Array.isArray(result.transactions) ||
      !result.injuries.every((row) => validText(row.player) && validText(row.position) && validText(row.status) && validTime(row.observedAt)) ||
      !result.transactions.every((row) => validTime(row.date) && validText(row.player) &&
        (row.position === null || validText(row.position)) && validText(row.detail))) throw new TypeError('Invalid official lineup contract');
    return { source: result.source, retrievedAt: result.retrievedAt,
      injuries: result.injuries.map(({ player, position, status, observedAt }) => ({ player, position, status, observedAt })),
      transactions: result.transactions.map(({ date, player, position, detail }) => ({ date, player, position, detail })) };
  });
  const depthChart = await gatherSource('ourlads', () => depthChartClient.fetchDepthChart({ team }), (result) => {
    if (!validTime(result.sourceUpdatedAt) || !validSlots(result.slots)) throw new TypeError('Invalid depth chart contract');
    return { source: result.source, retrievedAt: result.retrievedAt, sourceUpdatedAt: result.sourceUpdatedAt,
      slots: result.slots.filter(({ rank }) => rank <= 2).map(({ position, rank, player }) => ({ position, rank, player })) };
  });
  return { team, official, depthChart };
}

function validSlots(slots) {
  const seen = new Set();
  return Array.isArray(slots) && slots.length > 0 && slots.every((slot) => {
    if (!slot || !validText(slot.position) || !validText(slot.player) || !Number.isInteger(slot.rank) || slot.rank < 1) return false;
    const key = `${slot.position}:${slot.rank}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

async function findBaseline(fileSystem, directory, team, retrievedAt) {
  let files;
  try { files = await fileSystem.readdir(directory); } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw error;
  }
  const candidates = [];
  for (const file of files.filter((name) => name.endsWith('.json'))) {
    let snapshot;
    try { snapshot = JSON.parse(await fileSystem.readFile(path.join(directory, file), 'utf8')); } catch (error) {
      if (error instanceof SyntaxError || error.code === 'ENOENT') continue;
      throw error;
    }
    if (snapshot?.team === team && snapshot.source === 'ourlads' && validTime(snapshot.retrievedAt) &&
      validTime(snapshot.sourceUpdatedAt) && validSlots(snapshot.slots) && Date.parse(snapshot.retrievedAt) < Date.parse(retrievedAt)) {
      candidates.push(snapshot);
    }
  }
  candidates.sort((a, b) => Date.parse(b.retrievedAt) - Date.parse(a.retrievedAt));
  return candidates[0] || null;
}

function diffSlots(previous, current) {
  const index = (slots) => new Map(slots.filter(({ rank }) => rank <= 2).map((slot) => [`${slot.position}:${slot.rank}`, slot]));
  const before = index(previous);
  const after = index(current);
  const changes = [];
  for (const key of new Set([...before.keys(), ...after.keys()])) {
    const outgoingPlayer = before.get(key)?.player || null;
    const incomingPlayer = after.get(key)?.player || null;
    if (outgoingPlayer === incomingPlayer) continue;
    const { position, rank } = after.get(key) || before.get(key);
    changes.push({ position, rank, outgoingPlayer, incomingPlayer });
  }
  return changes.sort((a, b) => a.position.localeCompare(b.position) || a.rank - b.rank);
}

async function writeUnique(fileSystem, directory, stem, extension, body) {
  await fileSystem.mkdir(directory, { recursive: true });
  for (let index = 1; ; index += 1) {
    const suffix = index === 1 ? '' : `-${String(index).padStart(3, '0')}`;
    const filename = path.join(directory, `${stem}${suffix}.${extension}`);
    try { await fileSystem.writeFile(filename, body, { flag: 'wx' }); return; } catch (error) {
      if (error.code !== 'EEXIST') throw error;
    }
  }
}

async function publishSnapshot(fileSystem, directory, stem, body) {
  await fileSystem.mkdir(directory, { recursive: true });
  // Baseline discovery ignores staging files, even if a write/close fails after
  // producing complete JSON. Hard-link publication is atomic and never replaces
  // an existing capture (unlike rename on POSIX).
  const staging = path.join(directory, `${stem}-${randomUUID()}.pending`);
  try {
    await fileSystem.writeFile(staging, body, { flag: 'wx' });
    for (let index = 1; ; index += 1) {
      const suffix = index === 1 ? '' : `-${String(index).padStart(3, '0')}`;
      try { await fileSystem.link(staging, path.join(directory, `${stem}${suffix}.json`)); break; } catch (error) {
        if (error.code !== 'EEXIST') throw error;
      }
    }
  } finally {
    await fileSystem.unlink(staging).catch(() => {});
  }
}

module.exports = { gatherLineupContext };
