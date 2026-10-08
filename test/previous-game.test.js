const test = require('node:test');
const assert = require('node:assert/strict');

const { createPreviousGameLoader } = require('../src/previous-game');

const competitor = (team, homeAway, score) => ({ team: { abbreviation: team }, homeAway, score: { value: score } });
function event(id, date, { completed = true, type = 2 } = {}) {
  return { id, date, season: { year: 2025 }, seasonType: { type }, competitions: [{
    status: { type: { completed } }, competitors: [competitor('PHI', 'home', 10), competitor('DAL', 'away', 7)],
  }] };
}
const play = (period, clock, homeScore, awayScore, scoringPlay = true) => ({ id: `${period}-${clock}-${homeScore}-${awayScore}`,
  period: { number: period }, clock: { displayValue: clock }, homeScore, awayScore, scoringPlay });
function summary(plays = [play(1, '10:00', 0, 7), play(2, '5:00', 7, 7), play(4, '0:10', 10, 7), play(4, '0:00', 10, 7)]) {
  return { header: { id: '2', competitions: [{ status: { type: { completed: true } },
    competitors: [{ ...competitor('PHI', 'home', 10), score: '10' }, { ...competitor('DAL', 'away', 7), score: '7' }] }] },
  scoringPlays: plays.filter((entry, index) => entry.scoringPlay &&
    (entry.homeScore !== (plays[index - 1]?.homeScore ?? 0) || entry.awayScore !== (plays[index - 1]?.awayScore ?? 0))),
  drives: { previous: [{ plays }] } };
}
const target = { season: 2025, homeTeam: 'PHI', awayTeam: 'DAL', kickoff: { date: '2025-09-20', time: '13:00' } };
function loader({ events = [event('2', '2025-09-14T17:00Z')], data = summary(), failTeam } = {}) {
  return createPreviousGameLoader({ fetchImpl: async (url) => {
    if (url.includes(`/teams/${failTeam}/`)) throw new Error('private provider error');
    if (url.includes('/summary?')) return { ok: true, json: async () => data };
    const parsed = new URL(url);
    return { ok: true, json: async () => ({ events: parsed.searchParams.get('seasontype') === '2' ? events : [] }) };
  } });
}

test('selects only the most recent completed current-season game strictly before kickoff', async () => {
  assert.equal(typeof createPreviousGameLoader, 'function');
  const load = loader({ events: [event('1', '2025-09-07T17:00Z'), event('2', '2025-09-14T17:00Z'),
    event('3', '2025-09-21T17:00Z'), event('4', '2025-09-19T17:00Z', { completed: false }),
    event('5', '2025-08-19T17:00Z', { type: 1 }), event('6', '2024-09-19T17:00Z')] });
  const result = await load(target);
  assert.equal(result.home.eventId, '2');
  assert.equal(result.home.opponent, 'DAL');
  assert.equal(result.home.status, 'ready');
  assert.deepEqual(result.home.points.map(({ seconds, margin }) => [seconds, margin]),
    [[0, 0], [300, -7], [1500, 0], [3590, 3], [3600, 3]]);
  assert.deepEqual(result.away.points.map(({ margin }) => margin), [0, 7, 0, -3, -3]);
  assert.deepEqual(result.home.boundaries, [0, 900, 1800, 2700, 3600]);
});

test('handles early-ending regular-season overtime at its actual game-clock time', async () => {
  const data = summary([play(1, '10:00', 0, 7), play(2, '5:00', 7, 7), play(4, '0:00', 7, 7), play(5, '6:20', 10, 7)]);
  const result = await loader({ data })(target);
  assert.equal(result.home.duration, 3820);
  assert.deepEqual(result.home.points.at(-1), { seconds: 3820, margin: 3, period: 5, clock: '6:20', teamScore: 10, opponentScore: 7 });
  assert.deepEqual(result.home.boundaries, [0, 900, 1800, 2700, 3600]);
});

test('uses 15-minute postseason overtime and preserves separate scores at the same clock time', async () => {
  const data = summary([play(1, '10:00', 6, 0), play(1, '10:00', 7, 0), play(4, '0:00', 7, 7), play(5, '12:00', 10, 7)]);
  const result = await loader({ events: [event('2', '2025-09-14T17:00Z', { type: 3 })], data })(target);
  assert.equal(result.home.duration, 3780);
  assert.deepEqual(result.home.points.slice(1, 3).map(({ seconds, margin }) => [seconds, margin]), [[300, 6], [300, 7]]);
});

test('normalizes nflverse team aliases when matching ESPN opponents', async () => {
  const events = [event('2', '2025-09-14T17:00Z')];
  events[0].competitions[0].competitors[0].team.abbreviation = 'LAR';
  const data = summary();
  data.header.competitions[0].competitors[0].team.abbreviation = 'LAR';
  const result = await loader({ events, data })({ ...target, homeTeam: 'LA' });
  assert.equal(result.home.team, 'LA');
  assert.equal(result.home.status, 'ready');
  assert.equal(result.home.points.at(-1).margin, 3);
});

test('returns no previous game rather than falling back to another season', async () => {
  const result = await loader({ events: [] })(target);
  assert.equal(result.home.status, 'empty');
  assert.equal(result.away.status, 'empty');
});

test('fails only the affected team and does not expose provider errors', async () => {
  const result = await loader({ failTeam: 'phi' })(target);
  assert.equal(result.home.status, 'unavailable');
  assert.equal(result.away.status, 'ready');
  assert.doesNotMatch(JSON.stringify(result), /private provider/);
});

test('rejects missing or inconsistent play-by-play instead of inventing scoring times', async () => {
  for (const data of [summary([]), summary([play(4, '0:00', 7, 7)]), summary([play(4, 'bad', 10, 7)]),
    summary([play(1, '10:00', 10, 7), play(2, '5:00', 7, 7), play(4, '0:00', 10, 7)])]) {
    const result = await loader({ data })(target);
    assert.equal(result.home.status, 'unavailable');
  }
});

test('rejects a partial feed that first reveals an earlier score on a non-scoring play', async () => {
  const data = summary([play(1, '0:46', 7, 0), play(2, '15:00', 7, 0, false),
    play(2, '11:42', 7, 7), play(4, '0:10', 10, 7), play(4, '0:00', 10, 7, false)]);
  data.drives.previous[0].plays.shift();
  const result = await loader({ data })(target);
  assert.equal(result.home.status, 'unavailable');
});

test('rejects missing scoring records even when the remaining plays reach the final score', async () => {
  const data = summary();
  data.scoringPlays.shift();
  const result = await loader({ data })(target);
  assert.equal(result.home.status, 'unavailable');
});
