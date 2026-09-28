const METRICS = [
  'offensiveYardsPerPlay', 'defensiveYardsPerPlay',
  'offensiveEpaPerPlay', 'defensiveEpaPerPlay',
  'turnoverMargin', 'offensiveSackRate', 'defensiveSackRate',
  'passingEpaPerDropback', 'rushingEpaPerCarry', 'explosivePlayRate',
  'passingCpoe', 'interceptionRate', 'rushingYardsPerCarry',
  'passingExplosiveRate', 'rushingExplosiveRate', 'penaltyYardsPerGame',
];
const PROFILE_METRICS = METRICS.slice(7);

function deriveTeamPregame(postgameRecords) {
  if (!Array.isArray(postgameRecords)) throw new Error('postgameRecords are required');

  const accepted = [];
  const rejected = [];
  const counts = new Map();
  for (const record of postgameRecords) {
    const key = `${record?.gameId}:${record?.team}`;
    counts.set(key, (counts.get(key) || 0) + 1);
  }

  const valid = [];
  for (const record of postgameRecords) {
    if (counts.get(`${record?.gameId}:${record?.team}`) > 1) {
      rejected.push({ gameId: record?.gameId, team: record?.team, reason: 'duplicate_team_game' });
    } else if (!isValid(record)) {
      rejected.push({ gameId: record?.gameId, team: record?.team, reason: 'missing_core_field' });
    } else {
      valid.push(record);
    }
  }

  valid.sort((a, b) => a.season - b.season ||
    a.kickoff.date.localeCompare(b.kickoff.date) ||
    a.kickoff.time.localeCompare(b.kickoff.time) ||
    a.gameId.localeCompare(b.gameId) || a.team.localeCompare(b.team));

  const history = new Map();
  for (let start = 0; start < valid.length;) {
    let end = start + 1;
    while (end < valid.length && sameKickoff(valid[start], valid[end])) end++;

    // Publish all snapshots at this kickoff before recording any results from it.
    for (const record of valid.slice(start, end)) {
      const key = `${record.season}:${record.franchiseId}`;
      accepted.push({
        gameId: record.gameId, season: record.season, week: record.week,
        gameType: record.gameType, kickoff: { ...record.kickoff },
        team: record.team, opponent: record.opponent, franchiseId: record.franchiseId,
        features: featuresFor(history.get(key) || [], record.kickoff.date),
      });
    }
    for (const record of valid.slice(start, end)) {
      const key = `${record.season}:${record.franchiseId}`;
      if (!history.has(key)) history.set(key, []);
      history.get(key).push(record);
    }
    start = end;
  }
  return { accepted, rejected };
}

function isValid(record) {
  if (!record || typeof record.gameId !== 'string' || !record.gameId ||
      !Number.isInteger(record.season) || !Number.isInteger(record.week) ||
      !['REG', 'POST'].includes(record.gameType) ||
      typeof record.franchiseId !== 'string' || !record.franchiseId ||
      typeof record.team !== 'string' || !record.team ||
      typeof record.opponent !== 'string' || !record.opponent ||
      !Number.isFinite(record.pointsFor) || !Number.isFinite(record.pointsAgainst) ||
      !['win', 'loss', 'tie'].includes(record.result)) return false;
  const { date, time } = record.kickoff || {};
  const dateValue = typeof date === 'string' ? Date.parse(`${date}T00:00:00Z`) : NaN;
  if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
      !Number.isFinite(dateValue) || new Date(dateValue).toISOString().slice(0, 10) !== date ||
      typeof time !== 'string' || !/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) return false;
  return METRICS.every((metric) => record[metric] == null || Number.isFinite(record[metric]));
}

function sameKickoff(a, b) {
  return a.season === b.season && a.kickoff.date === b.kickoff.date &&
    a.kickoff.time === b.kickoff.time;
}

function average(values) {
  const numbers = values.filter(Number.isFinite);
  return numbers.length ? numbers.reduce((sum, value) => sum + value, 0) / numbers.length : null;
}

function featuresFor(history, date) {
  if (!history.length) {
    return {
      gamesPlayed: null, wins: null, losses: null, winPercentage: null,
      pointsScoredPerGame: null, pointsAllowedPerGame: null,
      netYardsPerPlay: null, netEpaPerPlay: null, turnoverMarginPerGame: null,
      offensiveSackRate: null, defensiveSackRate: null, restDays: null,
      ...Object.fromEntries(PROFILE_METRICS.map((metric) => [metric, null])),
    };
  }
  const wins = history.filter((game) => game.result === 'win').length;
  const losses = history.filter((game) => game.result === 'loss').length;
  const ties = history.length - wins - losses;
  const net = (offense, defense) => average(history.map((game) =>
    Number.isFinite(game[offense]) && Number.isFinite(game[defense])
      ? game[offense] - game[defense] : null));
  const latest = history.reduce((last, game) => game.kickoff.date > last ? game.kickoff.date : last,
    history[0].kickoff.date);
  return {
    gamesPlayed: history.length, wins, losses,
    winPercentage: (wins + ties / 2) / history.length,
    pointsScoredPerGame: average(history.map((game) => game.pointsFor)),
    pointsAllowedPerGame: average(history.map((game) => game.pointsAgainst)),
    netYardsPerPlay: net('offensiveYardsPerPlay', 'defensiveYardsPerPlay'),
    netEpaPerPlay: net('offensiveEpaPerPlay', 'defensiveEpaPerPlay'),
    turnoverMarginPerGame: average(history.map((game) => game.turnoverMargin)),
    offensiveSackRate: average(history.map((game) => game.offensiveSackRate)),
    defensiveSackRate: average(history.map((game) => game.defensiveSackRate)),
    ...Object.fromEntries(PROFILE_METRICS.map((metric) => [metric,
      average(history.map((game) => game[metric]))])),
    restDays: (Date.parse(`${date}T00:00:00Z`) - Date.parse(`${latest}T00:00:00Z`)) / 86400000,
  };
}

module.exports = { deriveTeamPregame };
