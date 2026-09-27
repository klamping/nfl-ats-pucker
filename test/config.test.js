const assert = require('node:assert/strict');
const { mkdtempSync, writeFileSync } = require('node:fs');
const { tmpdir } = require('node:os');
const path = require('node:path');
const test = require('node:test');

const { loadSportsGameOddsKey } = require('../src/config');

function writeEnvFixture(contents) {
  const directory = mkdtempSync(path.join(tmpdir(), 'sportsgameodds-config-'));
  const fixturePath = path.join(directory, '.env');
  writeFileSync(fixturePath, contents);
  return fixturePath;
}

test('loads the sportsgameodds key without returning other .env values', () => {
  const fixturePath = writeEnvFixture([
    'OTHER_SECRET=do-not-return',
    'sportsgameodds=test-key',
    'ANOTHER_VALUE=ignored',
  ].join('\n'));

  assert.equal(loadSportsGameOddsKey(fixturePath), 'test-key');
});

test('rejects a missing or blank sportsgameodds variable', () => {
  const missingKeyFixture = writeEnvFixture('sportsgameodds=   \n');

  assert.throws(() => loadSportsGameOddsKey(missingKeyFixture), /sportsgameodds/);
});
