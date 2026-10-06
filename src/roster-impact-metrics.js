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
      const rowKickoff = season.kickoffsByTeamWeek?.[`${team}:${season.season}:${row.week}`];
      if (row.player_id !== player.player_id || !rowKickoff || Date.parse(rowKickoff) >= Date.parse(kickoff) || ![targetSeason, targetSeason - 1].includes(season.season) || !['REG', 'POST'].includes(row.season_type)) continue;
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
  if (!/^(C|G|T|OT|OG|OC|LT|RT|LG|RG|OL)$/.test(position)) return null;
  const summary = (player) => {
    let epa = 0; let plays = 0; let games = 0;
    for (const season of seasons) for (const snap of season.snapCounts || []) {
      const time = season.kickoffsByTeamWeek?.[`${team}:${season.season}:${snap.week}`];
      if (snap.player !== player.player || snap.team !== team || !time || Date.parse(time) >= Date.parse(kickoff)) continue;
      const stats = (season.teamStats || []).find((row) => row.team === team && String(row.week) === String(snap.week));
      if (!stats) continue; const denominator = Number(stats.attempts) + Number(stats.carries) + Number(stats.sacks_suffered);
      if (!Number.isFinite(denominator) || denominator <= 0) continue;
      epa += Number(stats.passing_epa) + Number(stats.rushing_epa); plays += denominator; games++;
    }
    return games >= 3 ? { value: epa / plays, sample: games, games } : null;
  };
  const unavailable = summary(unavailablePlayer); const replacement = summary(replacementPlayer); if (!unavailable || !replacement) return null;
  const metric = { key: 'offensiveEpaPerPlay', label: 'Team offensive EPA / play (proxy)', unavailableValue: unavailable.value, replacementValue: replacement.value, delta: unavailable.value - replacement.value, direction: 'higher', unavailableSample: unavailable.sample, replacementSample: replacement.sample };
  return { evidenceType: 'unit-proxy', metrics: [metric], teamContext: null, sample: { unavailable, replacement }, confidence: 'medium' };
}
module.exports = { summarizeComparison, CURRENT_SEASON_WEIGHT, PRIOR_SEASON_WEIGHT };
