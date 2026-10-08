const { nflverseKickoffToUtc } = require('./gather-pregame');

const BASE = 'https://site.api.espn.com/apis/site/v2/sports/football/nfl';
const TEAMS = new Set('ARI ATL BAL BUF CAR CHI CIN CLE DAL DEN DET GB HOU IND JAX KC LAC LAR LV MIA MIN NE NO NYG NYJ PHI PIT SEA SF TB TEN WSH'.split(' '));
const canonical = (team) => ({ LA: 'LAR', OAK: 'LV', SD: 'LAC', STL: 'LAR', WAS: 'WSH' }[team] || team);

function createPreviousGameLoader({ fetchImpl = globalThis.fetch } = {}) {
  const requests = new Map();
  function download(url) {
    if (!requests.has(url)) requests.set(url, (async () => {
      const response = await fetchImpl(url, { signal: AbortSignal.timeout(15000), headers: { accept: 'application/json' } });
      if (!response.ok) throw new Error('Previous-game source unavailable');
      return response.json();
    })());
    return requests.get(url);
  }
  async function loadTeam(target, team) {
    try {
      const key = canonical(team);
      const cutoff = Date.parse(nflverseKickoffToUtc(target.kickoff));
      if (!TEAMS.has(key) || !Number.isInteger(target.season) || !Number.isFinite(cutoff)) throw new Error('Invalid target');
      const schedules = await Promise.all([2, 3].map(type => download(
        `${BASE}/teams/${key.toLowerCase()}/schedule?season=${target.season}&seasontype=${type}`)));
      if (schedules.some(schedule => !Array.isArray(schedule.events))) throw new Error('Invalid schedule');
      const events = schedules.flatMap(schedule => schedule.events).filter(event => {
        const date = Date.parse(event.date);
        return event.season?.year === target.season && [2, 3].includes(event.seasonType?.type) &&
          date >= Date.UTC(target.season, 6, 1) && date < cutoff &&
          event.competitions?.[0]?.status?.type?.completed === true &&
          event.competitions[0].competitors?.some(entry => canonical(entry.team?.abbreviation) === key);
      }).sort((a, b) => Date.parse(b.date) - Date.parse(a.date));
      if (!events.length) return { team, status: 'empty' };
      const event = events[0];
      if (!/^\d+$/.test(event.id)) throw new Error('Invalid event');
      return normalizePreviousGame(await download(`${BASE}/summary?event=${event.id}`), event, team);
    } catch {
      return { team, status: 'unavailable' };
    }
  }
  return async (target) => {
    const [home, away] = await Promise.all([loadTeam(target, target.homeTeam), loadTeam(target, target.awayTeam)]);
    return { home, away };
  };
}

function normalizePreviousGame(summary, event, team) {
  const competition = summary.header?.competitions?.[0];
  const competitors = competition?.competitors;
  if (summary.header?.id !== event.id || competition?.status?.type?.completed !== true || competitors?.length !== 2) throw new Error('Invalid game');
  const own = competitors.find(entry => canonical(entry.team?.abbreviation) === canonical(team));
  const opponent = competitors.find(entry => entry !== own);
  if (!own || !TEAMS.has(canonical(opponent?.team?.abbreviation)) || !['home', 'away'].includes(own.homeAway) ||
      opponent.homeAway === own.homeAway) throw new Error('Invalid teams');
  const score = (value) => {
    if (value === null || value === undefined || value === '' || !Number.isInteger(Number(value)) || Number(value) < 0) throw new Error('Invalid score');
    return Number(value);
  };
  const teamScore = score(own.score);
  const opponentScore = score(opponent.score);
  const drives = summary.drives?.previous;
  const scoringPlays = summary.scoringPlays;
  if (!Array.isArray(drives) || !Array.isArray(scoringPlays)) throw new Error('Play-by-play unavailable');
  const plays = drives.flatMap(drive => drive.plays || []);
  if (!plays.length) throw new Error('Play-by-play unavailable');
  const overtimeLength = event.seasonType.type === 3 || event.season.year < 2017 ? 900 : 600;
  const points = [{ seconds: 0, margin: 0, period: 1, clock: '15:00', teamScore: 0, opponentScore: 0 }];
  let last = points[0];
  let scoringIndex = 0;
  for (const play of plays) {
    const period = play.period?.number;
    const clock = play.clock?.displayValue;
    const match = typeof clock === 'string' && clock.match(/^(\d{1,2}):([0-5]\d)$/);
    if (!Number.isInteger(period) || period < 1 || !match) throw new Error('Invalid play clock');
    const remaining = Number(match[1]) * 60 + Number(match[2]);
    const length = period <= 4 ? 900 : overtimeLength;
    if (remaining > length) throw new Error('Invalid play clock');
    const seconds = period <= 4 ? period * 900 - remaining : 3600 + (period - 4) * length - remaining;
    const home = score(play.homeScore);
    const away = score(play.awayScore);
    const ownScore = own.homeAway === 'home' ? home : away;
    const otherScore = own.homeAway === 'home' ? away : home;
    if (seconds < last.seconds || ownScore < last.teamScore || otherScore < last.opponentScore) throw new Error('Inconsistent play-by-play');
    const point = { seconds, margin: ownScore - otherScore, period, clock, teamScore: ownScore, opponentScore: otherScore };
    if (ownScore !== last.teamScore || otherScore !== last.opponentScore) {
      // Cumulative scores on ordinary plays cannot establish when a missing score occurred.
      const scoring = scoringPlays[scoringIndex++];
      if (play.scoringPlay !== true || !scoring || !play.id || scoring.id !== play.id ||
          scoring.period?.number !== period || scoring.clock?.displayValue !== clock ||
          score(scoring.homeScore) !== home || score(scoring.awayScore) !== away) {
        throw new Error('Missing or inconsistent scoring history');
      }
      points.push(point);
    }
    last = point;
  }
  if (scoringIndex !== scoringPlays.length || last.teamScore !== teamScore || last.opponentScore !== opponentScore) throw new Error('Incomplete play-by-play');
  // Regulation ends at 60 minutes; sudden-death overtime ends at the last recorded play.
  const duration = Math.max(3600, last.seconds);
  if (points.at(-1).seconds !== duration) points.push({ ...last, seconds: duration });
  const boundaries = [0, 900, 1800, 2700, 3600];
  for (let end = 3600 + overtimeLength; end <= duration; end += overtimeLength) boundaries.push(end);
  return { status: 'ready', source: 'ESPN', team, opponent: opponent.team.abbreviation,
    eventId: event.id, date: event.date, teamScore, opponentScore, duration, boundaries, points };
}

module.exports = { createPreviousGameLoader };
