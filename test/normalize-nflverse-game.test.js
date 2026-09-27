const assert = require('node:assert/strict');
const test = require('node:test');

const { normalizeNflverseGame } = require('../src/normalize-nflverse-game');

const metadata = {
  retrievedAt: '2026-09-26T12:34:56.000Z',
  sourceUrl: 'https://raw.githubusercontent.com/nflverse/nfldata/master/data/games.csv',
};

function fixtureRow(overrides = {}) {
  return {
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
    spread_line: '2.5',
    total_line: '47.5',
    away_spread_odds: '-105',
    home_spread_odds: '-115',
    away_rest: '7',
    home_rest: '6',
    stadium: 'Lincoln Financial Field',
    roof: 'outdoors',
    surface: 'grass',
    div_game: '1',
    temp: '72',
    wind: '8',
    ...overrides,
  };
}

test('normalizes nflverse spread_line as the home-team closing spread without sign inversion', () => {
  const result = normalizeNflverseGame(fixtureRow(), metadata);

  assert.equal(result.rejected, undefined);
  assert.deepEqual(result.accepted, {
    gameId: '2025_01_DAL_PHI',
    season: 2025,
    week: 1,
    gameType: 'REG',
    sourceGameType: 'REG',
    kickoff: {
      date: '2025-09-04',
      time: '20:20',
      weekday: 'Thursday',
    },
    awayTeam: 'DAL',
    homeTeam: 'PHI',
    awayScore: 24,
    homeScore: 27,
    closingSpreadHome: 2.5,
    spreadOrientation: 'home_team',
    closingTotal: 47.5,
    awaySpreadOdds: -105,
    homeSpreadOdds: -115,
    awayRest: 7,
    homeRest: 6,
    stadium: 'Lincoln Financial Field',
    roof: 'outdoors',
    surface: 'grass',
    divisionGame: true,
    weather: {
      temperature: 72,
      wind: 8,
    },
    source: 'nflverse',
    sourceUrl: metadata.sourceUrl,
    retrievedAt: metadata.retrievedAt,
  });
  assert.equal(Object.hasOwn(result.accepted, 'openingSpread'), false);
  assert.equal(Object.hasOwn(result.accepted, 'lineMovement'), false);
});

test('accepts each nflverse postseason round as POST while preserving the source round', () => {
  for (const gameType of ['WC', 'DIV', 'CON', 'SB']) {
    const result = normalizeNflverseGame(fixtureRow({ game_type: gameType }), metadata);

    assert.equal(result.rejected, undefined);
    assert.equal(result.accepted.gameType, 'POST');
    assert.equal(result.accepted.sourceGameType, gameType);
  }
});

test('preserves both positive and negative nflverse spread signs for the home-team orientation', () => {
  for (const [spreadLine, expected] of [['2.5', 2.5], ['-3.5', -3.5]]) {
    const result = normalizeNflverseGame(fixtureRow({ spread_line: spreadLine }), metadata);
    assert.equal(result.accepted.closingSpreadHome, expected);
    assert.equal(result.accepted.spreadOrientation, 'home_team');
  }
});

test('rejects preseason and other unsupported game types', () => {
  for (const gameType of ['PRE', 'PRO', 'OFF', 'POST']) {
    const result = normalizeNflverseGame(fixtureRow({ game_type: gameType }), metadata);

    assert.equal(result.accepted, undefined);
    assert.equal(result.rejected.gameId, '2025_01_DAL_PHI');
    assert.equal(result.rejected.gameType, gameType);
    assert.equal(result.rejected.reason, 'unsupported_game_type');
  }
});

test('rejects missing required nflverse fields with machine-readable reasons', () => {
  const cases = [
    ['game_id', '', 'missing_game_id'],
    ['away_team', '', 'missing_team'],
    ['home_team', '', 'missing_team'],
    ['away_score', '', 'missing_score'],
    ['home_score', '', 'missing_score'],
    ['season', '', 'missing_season'],
    ['spread_line', '', 'missing_spread'],
    ['spread_line', 'not-a-number', 'missing_spread'],
  ];

  for (const [field, value, reason] of cases) {
    const result = normalizeNflverseGame(fixtureRow({ [field]: value }), metadata);

    assert.equal(result.accepted, undefined, `${field} should reject`);
    assert.equal(result.rejected.reason, reason, `${field} reason`);
    assert.equal(result.rejected.sourceUrl, metadata.sourceUrl);
    assert.equal(result.rejected.retrievedAt, metadata.retrievedAt);
  }
});

test('rejects missing spread_line even when a closingSpreadHome fallback is supplied', () => {
  const result = normalizeNflverseGame(fixtureRow({
    spread_line: '',
    closingSpreadHome: '-3.5',
  }), metadata);

  assert.equal(result.accepted, undefined);
  assert.equal(result.rejected.reason, 'missing_spread');
});
