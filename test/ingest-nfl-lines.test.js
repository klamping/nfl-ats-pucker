const assert = require('node:assert/strict');
const { existsSync } = require('node:fs');
const { mkdtemp, readFile, readdir } = require('node:fs/promises');
const { tmpdir } = require('node:os');
const path = require('node:path');
const test = require('node:test');

const fixtureEvent = require('./fixtures/sportsgameodds-event.json');
const { runIngestion } = require('../src/ingest-nfl-lines');

async function makeTempDir() {
  return mkdtemp(path.join(tmpdir(), 'nfl-lines-ingest-'));
}

function withoutPinnacleSpread(event) {
  const rejected = structuredClone(event);
  delete rejected.odds['points-away-game-sp-away'].byBookmaker.pinnacle;
  rejected.eventID = 'sgo-nfl-2025-week-01-rejected';
  return rejected;
}

test('writes a uniquely named raw response and JSONL accepted/rejected outputs', async () => {
  const tempDir = await makeTempDir();
  const fixtureClient = {
    async fetchFinalizedNflEvents() {
      return { events: [fixtureEvent, withoutPinnacleSpread(fixtureEvent)] };
    },
  };

  const summary = await runIngestion({ season: 2025, outputRoot: tempDir, client: fixtureClient });

  const rawDirectory = path.join(tempDir, 'data', 'raw', 'sportsgameodds', 'nfl', '2025');
  const rawFiles = await readdir(rawDirectory);
  const normalizedDirectory = path.join(tempDir, 'data', 'normalized', 'nfl');
  const acceptedPath = path.join(normalizedDirectory, 'pinnacle-lines-2025.accepted.jsonl');
  const rejectedPath = path.join(normalizedDirectory, 'pinnacle-lines-2025.rejected.jsonl');
  const acceptedLines = (await readFile(acceptedPath, 'utf8')).trim().split('\n');
  const rejectedLines = (await readFile(rejectedPath, 'utf8')).trim().split('\n');

  assert.equal(summary.fetched, 2);
  assert.equal(summary.accepted, 1);
  assert.equal(summary.rejected, 1);
  assert.equal(summary.rawResponseFiles, 1);
  assert.equal(rawFiles.length, 1);
  assert.match(await readFile(path.join(rawDirectory, rawFiles[0]), 'utf8'), /eventID/);
  assert.equal(JSON.parse(acceptedLines[0]).providerEventID, 'sgo-nfl-2025-week-01-dal-sea');
  assert.equal(JSON.parse(rejectedLines[0]).reason, 'missing_pinnacle_spread');
});

test('writes separate raw files for paginated requests without mixing normalized records', async () => {
  const tempDir = await makeTempDir();
  const fixtureClient = {
    async fetchFinalizedNflEvents(filters) {
      if (!filters.cursor) {
        return { events: [fixtureEvent], nextCursor: 'page-2' };
      }
      return { events: [withoutPinnacleSpread(fixtureEvent)] };
    },
  };

  const summary = await runIngestion({ season: 2025, outputRoot: tempDir, client: fixtureClient });

  const rawDirectory = path.join(tempDir, 'data', 'raw', 'sportsgameodds', 'nfl', '2025');
  const rawFiles = await readdir(rawDirectory);
  const acceptedPath = path.join(tempDir, 'data', 'normalized', 'nfl', 'pinnacle-lines-2025.accepted.jsonl');

  assert.equal(summary.fetched, 2);
  assert.equal(summary.rawResponseFiles, 2);
  assert.equal(rawFiles.length, 2);
  assert.notEqual(rawFiles[0], rawFiles[1]);
  assert.equal((await readFile(acceptedPath, 'utf8')).trim().split('\n').length, 1);
});

test('does not create normalized output when the provider client rejects', async () => {
  const tempDir = await makeTempDir();
  const normalizedPath = path.join(tempDir, 'data', 'normalized', 'nfl', 'pinnacle-lines-2025.accepted.jsonl');
  const failingClient = {
    async fetchFinalizedNflEvents() {
      throw new Error('provider unavailable');
    },
  };

  await assert.rejects(runIngestion({ season: 2025, outputRoot: tempDir, client: failingClient }), /provider unavailable/);
  assert.equal(existsSync(normalizedPath), false);
});
