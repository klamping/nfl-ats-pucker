(() => {
  'use strict';
  const byId = (id) => document.getElementById(id);
  const element = (tag, text) => { const node = document.createElement(tag); if (text !== undefined) node.textContent = text; return node; };
  const percent = (value) => value === null ? '—' : `${Math.round(value * 100)}%`;
  const line = (value) => `${value > 0 ? '+' : ''}${value} · ${value < 0 ? 'home favored' : value > 0 ? 'home underdog' : 'even'}`;
  const source = (odds) => odds.provider === 'nflverse' ? 'closing line' : `${odds.contributingBooks} books`;
  let orderedGames = [];
  let unavailableGames = [];
  let storageKey;
  const saveRanks = () => { try { localStorage.setItem(storageKey, JSON.stringify(orderedGames.map((game) => game.gameId))); } catch {} };
  function restoreRanks(games) {
    let stored;
    try { stored = JSON.parse(localStorage.getItem(storageKey) || '[]'); } catch { return games; }
    if (stored.length !== games.length || new Set(stored).size !== games.length || stored.some((id) => !games.some((game) => game.gameId === id))) return games;
    return stored.map((id) => games.find((game) => game.gameId === id));
  }
  function move(gameId, targetIndex) {
    const currentIndex = orderedGames.findIndex((game) => game.gameId === gameId);
    if (currentIndex < 0 || !Number.isInteger(targetIndex) || targetIndex < 0 || targetIndex >= orderedGames.length) return;
    const [game] = orderedGames.splice(currentIndex, 1);
    orderedGames.splice(targetIndex, 0, game);
    saveRanks(); renderRows();
  }
  function swapRank(gameId, rank) {
    const currentIndex = orderedGames.findIndex((game) => game.gameId === gameId);
    if (currentIndex < 0 || !Number.isInteger(rank)) return;
    const targetIndex = Math.max(0, Math.min(orderedGames.length - 1, rank - 1));
    [orderedGames[currentIndex], orderedGames[targetIndex]] = [orderedGames[targetIndex], orderedGames[currentIndex]];
    saveRanks(); renderRows();
  }
  function rankCell(game, index) {
    const cell = element('td');
    const input = element('input'); input.setAttribute('type', 'number'); input.setAttribute('min', '1'); input.setAttribute('max', orderedGames.length); input.value = String(index + 1);
    input.setAttribute('aria-label', `Rank ${game.matchup}`); input.addEventListener('change', (event) => swapRank(game.gameId, Number(event.target.value)));
    const up = element('button', '↑'); up.type = 'button'; up.setAttribute('aria-label', `Move ${game.matchup} up`); up.addEventListener('click', () => { if (index) move(game.gameId, index - 1); });
    const down = element('button', '↓'); down.type = 'button'; down.setAttribute('aria-label', `Move ${game.matchup} down`); down.addEventListener('click', () => { if (index < orderedGames.length - 1) move(game.gameId, index + 1); });
    cell.append(input, up, down); return cell;
  }
  function renderRows() {
    const rows = orderedGames.map((game, index) => {
      const row = element('tr'); row.setAttribute('draggable', 'true');
      row.addEventListener('dragstart', (event) => event.dataTransfer?.setData('text/plain', game.gameId));
      row.addEventListener('dragover', (event) => event.preventDefault());
      row.addEventListener('drop', (event) => { event.preventDefault(); const id = event.dataTransfer?.getData('text/plain'); if (id && id !== game.gameId) move(id, index); });
      const matchup = element('td'); const link = element('a', game.matchup);
      link.setAttribute('href', `/games/${encodeURIComponent(game.gameId)}/`); matchup.append(link);
      row.append(rankCell(game, index), matchup, element('td', `${game.kickoff.date} ${game.kickoff.time}`), element('td', line(game.currentOdds.consensusSpreadHome)),
        element('td', source(game.currentOdds)), element('td', game.candidateCount), element('td', percent(game.homeCoverRate)), element('td', percent(game.awayCoverRate)));
      return row;
    });
    for (const game of unavailableGames) { const row = element('tr'); const cell = element('td', `${game.gameId} · ${game.message}`); cell.setAttribute('colspan', '8'); row.append(cell); rows.push(row); }
    byId('slate-body').replaceChildren(...rows);
  }
  function render(data) {
    byId('status').textContent = `${data.season} · Week ${data.week}`;
    storageKey = `nfl-ats-pucker:week-ranks:${data.season}:${data.week}`;
    orderedGames = restoreRanks(data.games.filter((game) => game.status === 'ready'));
    unavailableGames = data.games.filter((game) => game.status !== 'ready');
    renderRows();
  }
  fetch('/api/slate', { cache: 'no-store' }).then((response) => {
    if (!response.ok) throw new Error('Slate unavailable'); return response.json();
  }).then(render).catch(() => { byId('status').textContent = 'Unable to load.'; byId('slate-body').replaceChildren(); });
})();
