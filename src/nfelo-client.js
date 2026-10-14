const { parse } = require('csv-parse/sync');

const { findFranchiseAliasAnySeason } = require('./franchise-aliases');

const ELO_SNAPSHOT_URL = 'https://raw.githubusercontent.com/greerreNFL/nfelo/main/output_data/elo_snapshot.csv';
const NFELO_GAMES_URL = 'https://raw.githubusercontent.com/greerreNFL/nfelo/main/output_data/nfelo_games.csv';
const RATING_COLUMNS = ['season', 'week', 'team', 'nfelo_base', 'qb_adj', 'nfelo', 'pts_vs_avg'];
const GAME_COLUMNS = ['game_id', 'nfelo_home_line_close', 'nfelo_home_probability_close',
  'nfelo_home_cover_prob_close', 'nfelo_away_cover_prob_close'];

async function loadNfeloData({ fetchImpl = globalThis.fetch, now = () => new Date() } = {}) {
  if (typeof fetchImpl !== 'function') throw new Error('NFLelo fetch implementation is required');
  const retrieved = now();
  if (!(retrieved instanceof Date) || !Number.isFinite(retrieved.getTime())) throw new Error('NFLelo clock must return a valid Date');

  const [ratingsResponse, gamesResponse] = await Promise.all([
    fetchImpl(ELO_SNAPSHOT_URL),
    fetchImpl(NFELO_GAMES_URL),
  ]);
  if (!ratingsResponse?.ok || !gamesResponse?.ok) throw new Error('NFLelo source unavailable');

  const [ratingsCsv, gamesCsv] = await Promise.all([ratingsResponse.text(), gamesResponse.text()]);
  const ratings = parseRatings(ratingsCsv);
  const games = parseGames(gamesCsv);
  return { retrievedAt: retrieved.toISOString(), ratings, games };
}

function buildNfeloContext({ input, nfeloData } = {}) {
  if (!validTarget(input) || !validData(nfeloData)) return unavailable('invalid_data');
  const targetHome = franchise(input.homeTeam);
  const targetAway = franchise(input.awayTeam);
  if (!targetHome || !targetAway) return unavailable('game_unavailable');

  const matches = nfeloData.games.filter((game) => game.season === input.season && game.week === input.week &&
    game.homeFranchiseId === targetHome && game.awayFranchiseId === targetAway);
  if (matches.length !== 1) return unavailable('game_unavailable');

  const homeRating = latestRating(nfeloData.ratings, input.season, input.week, targetHome);
  const awayRating = latestRating(nfeloData.ratings, input.season, input.week, targetAway);
  if (!homeRating || !awayRating) return unavailable('team_unavailable');

  const game = matches[0];
  return {
    status: 'ready',
    retrievedAt: nfeloData.retrievedAt,
    projection: {
      homeSpread: game.homeSpread,
      awaySpread: -game.homeSpread,
      homeWinProbability: game.homeWinProbability,
      homeCoverProbability: game.homeCoverProbability,
      awayCoverProbability: game.awayCoverProbability,
      marketDifference: game.homeSpread - input.currentOdds.consensusSpreadHome,
    },
    teams: {
      home: projectRating(input.homeTeam, homeRating),
      away: projectRating(input.awayTeam, awayRating),
    },
  };
}

function parseRatings(csv) {
  const rows = parseCsv(csv, RATING_COLUMNS);
  return rows.map((row) => {
    const season = integer(row.season);
    const week = integer(row.week);
    const franchiseId = franchise(row.team);
    const base = finite(row.nfelo_base);
    const qbAdjustment = finite(row.qb_adj);
    const nfelo = finite(row.nfelo);
    const pointsVsAverage = finite(row.pts_vs_avg);
    if (!season || !week || !franchiseId || [base, qbAdjustment, nfelo, pointsVsAverage].some((value) => value === null)) {
      throw new Error('Invalid NFLelo rating row');
    }
    return { season, week, franchiseId, base, qbAdjustment, nfelo, pointsVsAverage };
  });
}

function parseGames(csv) {
  const rows = parseCsv(csv, GAME_COLUMNS);
  return rows.map((row) => {
    const identity = gameIdentity(row.game_id);
    const homeSpread = finite(row.nfelo_home_line_close);
    const homeWinProbability = finite(row.nfelo_home_probability_close);
    const homeCoverProbability = finite(row.nfelo_home_cover_prob_close);
    const awayCoverProbability = finite(row.nfelo_away_cover_prob_close);
    if (!identity || [homeSpread, homeWinProbability, homeCoverProbability, awayCoverProbability].some((value) => value === null)) {
      throw new Error('Invalid NFLelo game row');
    }
    return { ...identity, homeSpread, homeWinProbability, homeCoverProbability, awayCoverProbability };
  });
}

function parseCsv(csv, columns) {
  let rows;
  try {
    rows = parse(csv, { columns: true, skip_empty_lines: true, trim: true });
  } catch {
    throw new Error('Invalid NFLelo CSV');
  }
  if (!Array.isArray(rows) || rows.length === 0 || columns.some((column) => !Object.hasOwn(rows[0], column))) {
    throw new Error('Invalid NFLelo CSV headers');
  }
  return rows;
}

function gameIdentity(gameId) {
  const match = typeof gameId === 'string' && gameId.match(/^(\d{4})_(\d+)_([A-Z]+)_([A-Z]+)$/);
  if (!match) return null;
  const season = integer(match[1]);
  const week = integer(match[2]);
  const awayFranchiseId = franchise(match[3]);
  const homeFranchiseId = franchise(match[4]);
  return season && week && awayFranchiseId && homeFranchiseId ? { season, week, awayFranchiseId, homeFranchiseId } : null;
}

function latestRating(ratings, season, week, franchiseId) {
  return ratings.filter((rating) => rating.season === season && rating.week <= week && rating.franchiseId === franchiseId)
    .sort((left, right) => right.week - left.week)[0] || null;
}

function projectRating(team, rating) {
  return { team, nfelo: rating.nfelo, base: rating.base, qbAdjustment: rating.qbAdjustment, pointsVsAverage: rating.pointsVsAverage };
}

function validTarget(input) {
  return Number.isInteger(input?.season) && Number.isInteger(input?.week) && typeof input.homeTeam === 'string' &&
    typeof input.awayTeam === 'string' && Number.isFinite(input.currentOdds?.consensusSpreadHome);
}

function validData(nfeloData) {
  return typeof nfeloData?.retrievedAt === 'string' && Number.isFinite(Date.parse(nfeloData.retrievedAt)) &&
    Array.isArray(nfeloData.games) && Array.isArray(nfeloData.ratings);
}

function franchise(team) {
  return typeof team === 'string' ? findFranchiseAliasAnySeason(team.trim())?.franchiseDefinition.franchiseId || null : null;
}

function finite(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function integer(value) {
  return /^\d+$/.test(String(value)) && Number.isSafeInteger(Number(value)) ? Number(value) : null;
}

function unavailable(reason) {
  return { status: 'unavailable', reason };
}

module.exports = { buildNfeloContext, ELO_SNAPSHOT_URL, loadNfeloData, NFELO_GAMES_URL };
