const MARKET_FIELDS = [
  'gameId', 'season', 'week', 'gameType', 'sourceGameType', 'kickoff',
  'awayTeam', 'homeTeam', 'closingSpreadHome', 'spreadOrientation',
  'source', 'sourceUrl', 'retrievedAt', 'closingTotal', 'awaySpreadOdds',
  'homeSpreadOdds', 'awayRest', 'homeRest', 'stadium', 'roof', 'surface',
  'divisionGame', 'weather',
];
const FEATURE_FIELDS = [
  'gamesPlayed', 'wins', 'losses', 'winPercentage', 'pointsScoredPerGame',
  'pointsAllowedPerGame', 'netYardsPerPlay', 'netEpaPerPlay',
  'turnoverMarginPerGame', 'offensiveSackRate', 'defensiveSackRate', 'restDays',
];

function pick(source, fields) {
  return Object.fromEntries(fields.filter((field) => Object.hasOwn(source, field))
    .map((field) => [field, source[field]]));
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
    else if (rows.length > 2) reason = 'duplicate_team_row';
    else if (rows.length < 2) reason = 'incomplete_team_pair';
    else if (game.awayTeam === game.homeTeam ||
        rows.some((row) => row.team !== game.awayTeam && row.team !== game.homeTeam)) reason = 'team_mismatch';
    else if (rows[0].team === rows[1].team) reason = 'duplicate_team_row';
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
    accepted.push({
      ...pick(game, MARKET_FIELDS),
      homePregame: pick(rows.find((row) => row.team === game.homeTeam).features, FEATURE_FIELDS),
      awayPregame: pick(rows.find((row) => row.team === game.awayTeam).features, FEATURE_FIELDS),
    });
  }
  for (const gameId of byGame.keys()) {
    if (!marketCounts.has(gameId)) rejected.push({ gameId, reason: 'missing_market_game' });
  }
  return { accepted, rejected };
}

module.exports = { joinTeamPregameToMarkets };
