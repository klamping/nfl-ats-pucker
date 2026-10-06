(() => {
  'use strict';
  const byId = (id) => document.getElementById(id);
  const element = (tag, text) => { const node = document.createElement(tag); if (text !== undefined) node.textContent = text; return node; };
  const percent = (value) => value === null ? '—' : `${Math.round(value * 100)}%`;
  const line = (value) => `${value > 0 ? '+' : ''}${value} · ${value < 0 ? 'home favored' : value > 0 ? 'home underdog' : 'even'}`;
  const source = (odds) => odds.provider === 'nflverse' ? 'closing line' : `${odds.contributingBooks} books`;
  const signed = (value) => `${value > 0 ? '+' : ''}${value.toFixed(1)}`;
  const interval = (value) => value ? `${signed(value.lower)} to ${signed(value.upper)} pp` : '—';
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
  function swapPoints(gameId, points) {
    const currentIndex = orderedGames.findIndex((game) => game.gameId === gameId);
    if (currentIndex < 0 || !Number.isInteger(points)) return;
    const targetIndex = Math.max(0, Math.min(orderedGames.length - 1, orderedGames.length - points));
    [orderedGames[currentIndex], orderedGames[targetIndex]] = [orderedGames[targetIndex], orderedGames[currentIndex]];
    saveRanks(); renderRows();
  }
  function pointsCell(game, index) {
    const cell = element('td');
    const input = element('input'); input.setAttribute('type', 'number'); input.setAttribute('class', 'points-value'); input.setAttribute('min', '1'); input.setAttribute('max', orderedGames.length); input.value = String(orderedGames.length - index);
    input.setAttribute('aria-label', `Points ${game.matchup}`); input.addEventListener('change', (event) => swapPoints(game.gameId, Number(event.target.value)));
    cell.append(input); return cell;
  }
  function lineupTeam(context) {
    const section = element('section'); section.setAttribute('class', 'lineup-team');
    section.setAttribute('aria-label', `Lineup context ${context?.team || 'Team'}`);
    section.append(element('h3', context?.team || 'Team'), element('h4', 'Official — NFL.com'));
    const official = context?.official;
    if (official?.status === 'ready') {
      section.append(element('p', `Current status as of build · ${official.retrievedAt}`));
      const injuries = element('ul');
      for (const entry of official.injuries) injuries.append(element('li', `${entry.player} (${entry.position}): ${entry.status}`));
      if (!official.injuries.length) injuries.append(element('li', 'No injury entries reported'));
      section.append(injuries, element('h5', 'Transactions (14 days)'));
      const transactions = element('ul');
      for (const entry of official.transactions) transactions.append(element('li', `${entry.date} · ${entry.player}${entry.position ? ` (${entry.position})` : ''}: ${entry.detail}`));
      if (!official.transactions.length) transactions.append(element('li', 'No transactions reported in this window'));
      section.append(transactions);
    } else section.append(element('p', 'Official source unavailable'));
    section.append(element('h4', 'Projected depth chart — Ourlads'));
    const depth = context?.depthChart;
    if (depth?.status === 'ready') {
      section.append(element('p', `Source updated · ${depth.sourceUpdatedAt}`), element('p', `Captured at build · ${depth.retrievedAt}`));
      if (depth.baseline !== 'available') section.append(element('p', 'No prior depth chart baseline'));
      else if (!depth.changes.length) section.append(element('p', 'No first- or second-string changes'));
      else {
        const changes = element('ul');
        for (const entry of depth.changes) changes.append(element('li', `${entry.position} ${entry.rank === 1 ? 'starter' : 'second string'}: ${entry.outgoingPlayer || '—'} → ${entry.incomingPlayer || '—'}`));
        section.append(changes);
      }
    } else section.append(element('p', 'Projected depth chart unavailable'));
    return section;
  }
  function lineupContextRow(game) {
    const row = element('tr'); row.setAttribute('class', 'lineup-context-row'); row.setAttribute('hidden', '');
    const cell = element('td'); cell.setAttribute('class', 'lineup-context-cell'); cell.setAttribute('colspan', '11');
    cell.setAttribute('id', `lineup-${game.gameId}`);
    const content = element('div'); content.setAttribute('class', 'lineup-context');
    content.append(lineupTeam(game.lineup?.home), lineupTeam(game.lineup?.away));
    cell.append(content); row.append(cell);
    return row;
  }
  function lineupCell(game, contextRow) {
    const cell = element('td'); cell.setAttribute('class', 'lineup-cell');
    const button = element('button', 'View team context'); button.type = 'button';
    button.setAttribute('aria-label', `View team context for ${game.matchup}`);
    button.setAttribute('aria-controls', `lineup-${game.gameId}`);
    button.setAttribute('aria-expanded', 'false');
    let expanded = false;
    button.addEventListener('click', () => {
      expanded = !expanded;
      button.setAttribute('aria-expanded', expanded ? 'true' : 'false');
      if (expanded) contextRow.removeAttribute('hidden');
      else contextRow.setAttribute('hidden', '');
    });
    cell.append(button); return cell;
  }
  function renderRows() {
    const rows = orderedGames.map((game, index) => {
      const row = element('tr'); row.setAttribute('draggable', 'true');
      row.addEventListener('dragstart', (event) => event.dataTransfer?.setData('text/plain', game.gameId));
      row.addEventListener('dragover', (event) => event.preventDefault());
      row.addEventListener('drop', (event) => { event.preventDefault(); const id = event.dataTransfer?.getData('text/plain'); if (id && id !== game.gameId) move(id, index); });
      const matchup = element('td'); const link = element('a', game.matchup);
      link.setAttribute('href', `/games/${encodeURIComponent(game.gameId)}/`); matchup.append(link);
      const contextRow = lineupContextRow(game);
      row.append(pointsCell(game, index), matchup, element('td', `${game.kickoff.date} ${game.kickoff.time}`), element('td', line(game.currentOdds.consensusSpreadHome)),
        element('td', game.recommendedPick || '—'), element('td', game.candidateCount), element('td', game.coverSplit === null ? '—' : `${game.coverSplit > 0 ? '+' : ''}${Math.round(game.coverSplit)} pp`),
        element('td', interval(game.coverSplitInterval)), element('td', game.decidedGameCount),
        element('td', game.weightedConfidence === null ? '—' : `${game.weightedConfidence}/100`), lineupCell(game, contextRow));
      return [row, contextRow];
    });
    for (const game of unavailableGames) { const row = element('tr'); const cell = element('td', `${game.gameId} · ${game.message}`); cell.setAttribute('colspan', '11'); row.append(cell); rows.push([row]); }
    byId('slate-body').replaceChildren(...rows.flat());
  }
  function render(data) {
    byId('status').textContent = `${data.season} · Week ${data.week}`;
    storageKey = `nfl-ats-pucker:week-ranks:${data.season}:${data.week}`;
    const ready = data.games.filter((game) => game.status === 'ready').sort((a, b) => b.weightedConfidence - a.weightedConfidence || Math.abs(b.coverSplit) - Math.abs(a.coverSplit) || a.matchup.localeCompare(b.matchup));
    orderedGames = restoreRanks(ready);
    unavailableGames = data.games.filter((game) => game.status !== 'ready');
    renderRows();
  }
  fetch('/api/slate', { cache: 'no-store' }).then((response) => {
    if (!response.ok) throw new Error('Slate unavailable'); return response.json();
  }).then(render).catch(() => { byId('status').textContent = 'Unable to load.'; byId('slate-body').replaceChildren(); });
})();
