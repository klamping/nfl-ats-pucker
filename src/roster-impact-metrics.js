const CURRENT_SEASON_WEIGHT = 2;
const PRIOR_SEASON_WEIGHT = 1;

function summarizeComparison({ unavailablePlayer, replacementPlayer, position, team, kickoff, targetSeason, seasons } = {}) {
  const direct = { QB: ['passing_epa', 'attempts', 'sacks', 'passingEpaPerDropback', 'Passing EPA / dropback'], RB: ['rushing_epa', 'carries', null, 'rushingEpaPerCarry', 'Rushing EPA / carry'], WR: ['receiving_epa', 'targets', null, 'receivingEpaPerTarget', 'Receiving EPA / target'], TE: ['receiving_epa', 'targets', null, 'receivingEpaPerTarget', 'Receiving EPA / target'] }[position];
  if (!Array.isArray(seasons) || !Number.isFinite(Date.parse(kickoff))) return null;
  if (!direct) return summarizeProxy({ unavailablePlayer, replacementPlayer, position, team, kickoff, targetSeason, seasons });
  const [epaKey, attemptsKey, extraKey, key, label] = direct;
  const value = (player) => {
    let epa = 0; let weightedAttempts = 0; let attempts = 0; let games = 0;
    for (const season of seasons) for (const row of season.playerStats || []) {
      const rowKickoff = season.kickoffsByTeamWeek?.[`${row.recent_team || row.team || team}:${season.season}:${row.week}`];
      if (row.player_id !== player.player_id || !eligible({ rowKickoff, targetKickoff: kickoff, season: season.season, targetSeason, gameType: row.season_type })) continue;
      const denominator = Number(row[attemptsKey]) + (extraKey ? Number(row[extraKey]) : 0); if (!Number.isFinite(denominator) || denominator <= 0 || !Number.isFinite(Number(row[epaKey]))) continue;
      const weight = season.season === targetSeason ? CURRENT_SEASON_WEIGHT : PRIOR_SEASON_WEIGHT;
      epa += Number(row[epaKey]) * weight; weightedAttempts += denominator * weight; attempts += denominator; games++;
    }
    return games >= 2 && attempts >= 10 ? { value: epa / weightedAttempts, sample: attempts, games } : null;
  };
  const unavailable = value(unavailablePlayer); const replacement = value(replacementPlayer);
  if (!unavailable || !replacement) return null;
  const metric = { key, label, unavailableValue: unavailable.value, replacementValue: replacement.value, delta: unavailable.value - replacement.value, direction: 'higher', unavailableSample: unavailable.sample, replacementSample: replacement.sample };
  return { evidenceType: 'direct', metrics: [metric], teamContext: null, sample: { unavailable, replacement }, confidence: unavailable.games >= 3 && replacement.games >= 3 ? 'medium' : 'low' };
}
function summarizeProxy({ unavailablePlayer, replacementPlayer, position, team, kickoff, targetSeason, seasons }) {
  const defensive = /^(DL|DE|DT|NT|LB|ILB|OLB|DB|CB|S|FS|SS)$/.test(position);
  if (!defensive && !/^(C|G|T|OT|OG|OC|LT|RT|LG|RG|OL)$/.test(position)) return null;
  const summary = (player) => {
    let epa = 0; let plays = 0; const games = new Set();
    for (const season of seasons) for (const snap of season.snapCounts || []) {
      const time = season.kickoffsByTeamWeek?.[`${snap.team}:${season.season}:${snap.week}`];
      const snapCount = Number(defensive ? snap.defense_snaps : snap.offense_snaps);
      if (snap.player !== player.player || snap.team !== team || !Number.isFinite(snapCount) || snapCount <= 0 || !eligible({ rowKickoff: time, targetKickoff: kickoff, season: season.season, targetSeason, gameType: snap.game_type })) continue;
      const stats = (season.teamStats || []).find((row) => row.team === (defensive ? snap.opponent : team) && String(row.week) === String(snap.week));
      if (!stats) continue; const denominator = Number(stats.attempts) + Number(stats.carries) + Number(stats.sacks_suffered);
      if (!Number.isFinite(denominator) || denominator <= 0) continue;
      const weight = season.season === targetSeason ? CURRENT_SEASON_WEIGHT : PRIOR_SEASON_WEIGHT;
      epa += (Number(stats.passing_epa) + Number(stats.rushing_epa)) * weight; plays += denominator * weight; games.add(`${season.season}:${snap.game_id || snap.week}`);
    }
    return games.size >= 3 ? { value: epa / plays, sample: games.size, games: games.size } : null;
  };
  const unavailable = summary(unavailablePlayer); const replacement = summary(replacementPlayer); if (!unavailable || !replacement) return null;
  const metric = { key: defensive ? 'opponentOffensiveEpaPerPlay' : 'offensiveEpaPerPlay', label: defensive ? 'Opponent offensive EPA / play (defensive unit proxy)' : 'Team offensive EPA / play (proxy)', unavailableValue: unavailable.value, replacementValue: replacement.value, delta: unavailable.value - replacement.value, direction: defensive ? 'lower' : 'higher', unavailableSample: unavailable.sample, replacementSample: replacement.sample };
  return { evidenceType: 'unit-proxy', metrics: [metric], teamContext: null, sample: { unavailable, replacement }, confidence: 'medium' };
}
function eligible({ rowKickoff, targetKickoff, season, targetSeason, gameType }) {
  if (!rowKickoff || ![targetSeason, targetSeason - 1].includes(season) || !['REG', 'POST'].includes(gameType)) return false;
  const rowTime = Date.parse(rowKickoff); const targetTime = Date.parse(targetKickoff);
  return Number.isFinite(rowTime) && Number.isFinite(targetTime) && rowTime < targetTime && new Date(rowTime).toISOString().slice(0, 10) !== new Date(targetTime).toISOString().slice(0, 10);
}
module.exports = { summarizeComparison, CURRENT_SEASON_WEIGHT, PRIOR_SEASON_WEIGHT };
