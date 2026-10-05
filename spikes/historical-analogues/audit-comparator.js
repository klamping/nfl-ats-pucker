// Throwaway: reproduce earlier analyses without modifying published data.
const fs = require('node:fs');
const path = require('node:path');
const { parse } = require('csv-parse/sync');
const { compareHistorical } = require('../../src/compare-historical');
const root = path.resolve(__dirname, '../..');
const directory = path.join(root, 'data/normalized/nfl');
const manifest = JSON.parse(fs.readFileSync(path.join(directory, 'nflverse-team-matchups-2005-2025.current.json')));
const stored = fs.readFileSync(path.join(directory, manifest.accepted), 'utf8').trim().split('\n').map(JSON.parse);
const timestamp = stored[0].retrievedAt.replaceAll(':', '-');
const rawDirectory = path.join(root, 'data/raw/nflverse');
const file = fs.readdirSync(rawDirectory).sort().find(name => name.startsWith(`games-${timestamp}-capture-`));
const raw = new Map(parse(fs.readFileSync(path.join(rawDirectory, file), 'utf8'), { columns: true }).map(row => [row.game_id, row]));
const fixed = stored.map(game => ({ ...game, closingSpreadHome: -Number(raw.get(game.gameId).spread_line) }));
const stamp = game => `${game.kickoff.date}T${game.kickoff.time}`;
const input = game => ({ gameId: game.gameId, season: game.season, week: game.week,
  gameType: game.gameType, homeTeam: game.homeTeam, awayTeam: game.awayTeam,
  closingSpreadHome: game.closingSpreadHome, kickoff: game.kickoff,
  homePregame: game.homePregame, awayPregame: game.awayPregame,
  currentOdds: { provider: 'nflverse', retrievedAt: game.retrievedAt, consensusSpreadHome: game.closingSpreadHome } });
const results = [];
for (const season of [2024, 2025]) {
  for (const [label, all] of [['stale_wrong_sign', stored], ['correct_sign', fixed]]) {
    for (const mode of ['full_archive_leaky', 'before_kickoff', 'prior_seasons_only']) {
      const totals = { win: 0, loss: 0, push: 0, abstain: 0, games: 0 };
      for (const game of all.filter(g => g.season === season && g.gameType === 'REG' && g.week >= 4 && g.week <= 14)) {
        const history = mode === 'full_archive_leaky' ? all : all.filter(g =>
          g.season < season || (mode === 'before_kickoff' && g.season === season && stamp(g) < stamp(game)));
        const { summary } = compareHistorical({ input: input(game), historicalMatchups: history });
        const prediction = Math.sign(summary.homeCovers - summary.awayCovers);
        const actual = Math.sign(game.homeScore - game.awayScore + game.closingSpreadHome);
        totals[!prediction ? 'abstain' : !actual ? 'push' : prediction === actual ? 'win' : 'loss']++;
        totals.games++;
      }
      results.push({ season, labels: label, history: mode, ...totals,
        accuracy: totals.win / (totals.win + totals.loss) });
    }
  }
}
fs.mkdirSync(path.join(__dirname, 'results'), { recursive: true });
fs.writeFileSync(path.join(__dirname, 'results/comparator-audit.json'), JSON.stringify(results, null, 2) + '\n');
console.log(JSON.stringify(results, null, 2));
