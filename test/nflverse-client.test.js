const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const { downloadNflverseGames } = require('../src/nflverse-client');

const sourceUrl = 'https://raw.githubusercontent.com/nflverse/nfldata/master/data/games.csv';
const fixtureCsv = readFileSync(path.join(__dirname, 'fixtures', 'nflverse-games.csv'), 'utf8');

function getHeader(headers, name) {
  return Object.entries(headers || {}).find(([key]) => key.toLowerCase() === name.toLowerCase())?.[1];
}

test('downloads nflverse games CSV without authentication and returns parsed rows with source metadata', async () => {
  const previousKey = process.env.sportsgameodds;
  process.env.sportsgameodds = 'must-not-be-sent';
  let capturedUrl;
  let capturedOptions;

  try {
    const result = await downloadNflverseGames(async (url, options) => {
      capturedUrl = url;
      capturedOptions = options;
      return {
        ok: true,
        status: 200,
        text: async () => fixtureCsv,
      };
    });

    assert.equal(capturedUrl, sourceUrl);
    assert.equal(getHeader(capturedOptions.headers, 'accept'), 'text/csv');
    assert.equal(getHeader(capturedOptions.headers, 'authorization'), undefined);
    assert.equal(getHeader(capturedOptions.headers, 'x-api-key'), undefined);
    assert.equal(result.csv, fixtureCsv);
    assert.equal(result.sourceUrl, sourceUrl);
    assert.match(result.retrievedAt, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    assert.deepEqual(result.rows, [
      {
        game_id: '2025_01_DAL_PHI',
        season: '2025',
        week: '1',
        game_type: 'REG',
        gameday: '2025-09-04',
        weekday: 'Thursday',
        gametime: '20:20',
        away_team: 'DAL',
        home_team: 'PHI',
        away_score: '24',
        home_score: '27',
        spread_line: '-2.5',
        total_line: '47.5',
        roof: 'outdoors',
        surface: 'grass',
        stadium: 'Lincoln Financial Field',
      },
      {
        game_id: '2025_02_KC_LAC',
        season: '2025',
        week: '2',
        game_type: 'REG',
        gameday: '2025-09-14',
        weekday: 'Sunday',
        gametime: '16:25',
        away_team: 'KC',
        home_team: 'LAC',
        away_score: '21',
        home_score: '20',
        spread_line: '1.5',
        total_line: '45.0',
        roof: 'dome',
        surface: 'fieldturf',
        stadium: 'SoFi Stadium',
      },
    ]);
  } finally {
    if (previousKey === undefined) {
      delete process.env.sportsgameodds;
    } else {
      process.env.sportsgameodds = previousKey;
    }
  }
});

test('rejects non-success nflverse responses before reading CSV rows', async () => {
  let textCalled = false;

  await assert.rejects(
    downloadNflverseGames(async () => ({
      ok: false,
      status: 503,
      text: async () => {
        textCalled = true;
        return fixtureCsv;
      },
    })),
    /nflverse.*503/i,
  );
  assert.equal(textCalled, false);
});

test('rejects malformed nflverse CSV', async () => {
  await assert.rejects(
    downloadNflverseGames(async () => ({
      ok: true,
      status: 200,
      text: async () => 'game_id,season\n"unterminated,2025\n',
    })),
    /nflverse.*csv/i,
  );
});
