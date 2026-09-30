(() => {
  'use strict';
  const byId = (id) => document.getElementById(id);
  const element = (tag, text) => { const node = document.createElement(tag); if (text !== undefined) node.textContent = text; return node; };
  const percent = (value) => value === null ? '—' : `${Math.round(value * 100)}%`;
  const line = (value) => `${value > 0 ? '+' : ''}${value} · ${value < 0 ? 'home favored' : value > 0 ? 'home underdog' : 'even'}`;
  const source = (odds) => odds.provider === 'nflverse' ? 'closing line' : `${odds.contributingBooks} books`;
  function render(data) {
    byId('status').textContent = `${data.season} · Week ${data.week}`;
    byId('slate-body').replaceChildren(...data.games.map((game) => {
      const row = element('tr');
      if (game.status !== 'ready') { row.append(element('td', game.gameId), element('td', game.message)); return row; }
      const matchup = element('td'); const link = element('a', game.matchup);
      link.setAttribute('href', `/games/${encodeURIComponent(game.gameId)}/`); matchup.append(link);
      row.append(matchup, element('td', `${game.kickoff.date} ${game.kickoff.time}`), element('td', line(game.currentOdds.consensusSpreadHome)),
        element('td', source(game.currentOdds)), element('td', game.candidateCount), element('td', percent(game.homeCoverRate)), element('td', percent(game.awayCoverRate)));
      return row;
    }));
  }
  fetch('/api/slate', { cache: 'no-store' }).then((response) => {
    if (!response.ok) throw new Error('Slate unavailable'); return response.json();
  }).then(render).catch(() => { byId('status').textContent = 'Unable to load.'; byId('slate-body').replaceChildren(); });
})();
