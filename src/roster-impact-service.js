const { summarizeComparison } = require('./roster-impact-metrics');
const key = (value) => String(value || '').toLowerCase().replace(/[^a-z]/g, '');

async function gatherRosterImpacts({ team, kickoff, targetSeason, lineup, rosterData, summarize = summarizeComparison } = {}) {
  const injuries = lineup?.official?.injuries || []; const slots = lineup?.depthChart?.slots || [];
  const outs = injuries.filter((row) => String(row.status).trim().toLowerCase() === 'out');
  const unavailable = new Set(outs.map((row) => key(row.player)));
  const players = (rosterData || []).flatMap((season) => season.playerStats || []);
  const playerImpacts = outs.map((injury) => {
    const slot = slots.find((entry) => entry.position === injury.position && key(entry.player) === key(injury.player));
    const replacementSlot = slot && slots.filter((entry) => entry.position === injury.position && entry.rank > slot.rank && !unavailable.has(key(entry.player))).sort((a, b) => a.rank - b.rank)[0];
    if (!slot || !replacementSlot) return insufficient(injury, 'No available projected replacement');
    const resolve = (name) => players.filter((player) => player.recent_team === team && player.position === injury.position && key(player.player_display_name) === key(name));
    const [out] = resolve(injury.player); const replacements = resolve(replacementSlot.player);
    if (!out || replacements.length !== 1) return insufficient(injury, 'Insufficient unambiguous player data');
    const evidence = summarize({ unavailablePlayer: out, replacementPlayer: replacements[0], position: injury.position, team, kickoff, targetSeason, seasons: rosterData });
    if (!evidence) return insufficient(injury, 'Insufficient performance evidence');
    const metric = evidence.metrics[0] || {};
    const delta = metric.direction === 'lower' ? -metric.delta : metric.delta;
    const verdict = delta >= .1 ? 'material downgrade' : delta >= .03 ? 'possible downgrade' : delta <= -.03 ? 'possible upgrade' : 'roughly neutral';
    return { player: injury.player, position: injury.position, status: 'Out', observedAt: injury.observedAt, depthRole: slot.rank, replacement: replacementSlot.player, verdict, confidence: evidence.confidence, evidenceType: evidence.evidenceType, metrics: evidence.metrics, teamContext: evidence.teamContext, sample: evidence.sample, caveats: evidence.evidenceType === 'direct' ? ['Direct EPA evidence'] : ['Unit-proxy evidence'] };
  });
  return { status: 'ready', playerImpacts };
}
function insufficient(injury, reason) { return { player: injury.player, position: injury.position, status: 'Out', observedAt: injury.observedAt, verdict: 'insufficient evidence', reason }; }
module.exports = { gatherRosterImpacts };
