const MARKET_SCALAR_FIELDS = {
  string: [
    'gameId', 'gameType', 'sourceGameType', 'awayTeam', 'homeTeam',
    'spreadOrientation', 'source', 'sourceUrl', 'retrievedAt',
    'stadium', 'roof', 'surface',
  ],
  number: [
    'season', 'week', 'closingSpreadHome', 'closingTotal',
    'awaySpreadOdds', 'homeSpreadOdds', 'awayRest', 'homeRest',
  ],
  boolean: ['divisionGame'],
};
const FEATURE_FIELDS = [
  'gamesPlayed', 'wins', 'losses', 'winPercentage', 'pointsScoredPerGame',
  'pointsAllowedPerGame', 'netYardsPerPlay', 'netEpaPerPlay',
  'turnoverMarginPerGame', 'offensiveSackRate', 'defensiveSackRate', 'restDays',
];

function pick(source, fields) {
  return Object.fromEntries(fields.filter((field) => Object.hasOwn(source, field))
    .map((field) => [field, source[field]]));
}

function pickMarketScalars(game) {
  const scalars = {};
  for (const [type, fields] of Object.entries(MARKET_SCALAR_FIELDS)) {
    for (const field of fields) {
      if (!Object.hasOwn(game, field)) continue;
      const value = game[field];
      if (value === null || (typeof value === type &&
          (type !== 'number' || Number.isFinite(value)))) scalars[field] = value;
    }
  }
  return scalars;
}

function validKickoff(kickoff) {
  const { date, time } = kickoff || {};
  if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
      typeof time !== 'string' || !/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) return false;
  const parsed = Date.parse(`${date}T00:00:00Z`);
  return Number.isFinite(parsed) && new Date(parsed).toISOString().slice(0, 10) === date;
}

function joinTeamPregameToMarkets({ marketGames, pregameRecords }) {
  if (!Array.isArray(marketGames) || !Array.isArray(pregameRecords)) {
    throw new Error('marketGames and pregameRecords are required');
  }
  const accepted = [];
  const rejected = [];
  const byGame = new Map();
  for (const record of pregameRecords) {
    if (!byGame.has(record?.gameId)) byGame.set(record?.gameId, []);
    byGame.get(record?.gameId).push(record);
  }
  const marketCounts = new Map();
  for (const game of marketGames) {
    marketCounts.set(game?.gameId, (marketCounts.get(game?.gameId) || 0) + 1);
  }
  for (const game of marketGames) {
    const { gameId } = game;
    const rows = byGame.get(gameId) || [];
    let reason;
    if (marketCounts.get(gameId) > 1) reason = 'duplicate_market_game';
    else if (!validKickoff(game.kickoff)) reason = 'invalid_market_kickoff';
    else if (game.gameType !== 'REG' && game.gameType !== 'POST') reason = 'missing_core_field';
    else if (rows.length > 2) reason = 'duplicate_team_row';
    else if (rows.length < 2) reason = 'incomplete_team_pair';
    else if (game.awayTeam === game.homeTeam ||
        rows.some((row) => row.team !== game.awayTeam && row.team !== game.homeTeam)) reason = 'team_mismatch';
    else if (rows[0].team === rows[1].team) reason = 'duplicate_team_row';
    else if (rows.some((row) => row.gameType !== game.gameType)) reason = 'game_type_mismatch';
    else if (rows.some((row) => row.kickoff?.date !== game.kickoff.date ||
        row.kickoff?.time !== game.kickoff.time)) reason = 'kickoff_mismatch';
    else if (rows.some((row) => row.season !== game.season || row.week !== game.week ||
        typeof row.franchiseId !== 'string' || !row.franchiseId ||
        !row.features || typeof row.features !== 'object' ||
        FEATURE_FIELDS.some((field) => !Object.hasOwn(row.features, field) ||
          (row.features[field] !== null && !Number.isFinite(row.features[field]))))) {
      reason = 'missing_core_field';
    }

    if (reason) {
      rejected.push({ gameId, season: game.season, week: game.week, reason });
      continue;
    }
    const matchup = {
      ...pickMarketScalars(game),
      homePregame: pick(rows.find((row) => row.team === game.homeTeam).features, FEATURE_FIELDS),
      awayPregame: pick(rows.find((row) => row.team === game.awayTeam).features, FEATURE_FIELDS),
    };
    matchup.kickoff = pick(game.kickoff, ['date', 'time']);
    if (typeof game.kickoff.weekday === 'string') matchup.kickoff.weekday = game.kickoff.weekday;
    if (game.weather && typeof game.weather === 'object') {
      const weather = Object.fromEntries(['temperature', 'wind']
        .filter((field) => Number.isFinite(game.weather[field]))
        .map((field) => [field, game.weather[field]]));
      if (Object.keys(weather).length) matchup.weather = weather;
    }
    accepted.push(matchup);
  }
  for (const gameId of byGame.keys()) {
    if (!marketCounts.has(gameId)) rejected.push({ gameId, reason: 'missing_market_game' });
  }
  return { accepted, rejected };
}

module.exports = { joinTeamPregameToMarkets };
