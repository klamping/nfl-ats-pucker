(() => {
  'use strict';
  const byId = (id) => document.getElementById(id);
  const element = (tag, text) => { const node = document.createElement(tag); if (text !== undefined) node.textContent = text; return node; };
  const namedElement = (tag, className, text) => { const node = element(tag, text); node.setAttribute('class', className); return node; };
  const teamNames = {
    ARI: 'Cardinals', ATL: 'Falcons', BAL: 'Ravens', BUF: 'Bills', CAR: 'Panthers', CHI: 'Bears', CIN: 'Bengals', CLE: 'Browns',
    DAL: 'Cowboys', DEN: 'Broncos', DET: 'Lions', GB: 'Packers', HOU: 'Texans', IND: 'Colts', JAX: 'Jaguars', KC: 'Chiefs',
    LA: 'Rams', LAR: 'Rams', LAC: 'Chargers', LV: 'Raiders', MIA: 'Dolphins', MIN: 'Vikings', NE: 'Patriots', NO: 'Saints',
    NYG: 'Giants', NYJ: 'Jets', PHI: 'Eagles', PIT: 'Steelers', SEA: 'Seahawks', SF: '49ers', TB: 'Buccaneers', TEN: 'Titans',
    WAS: 'Commanders', WSH: 'Commanders', OAK: 'Raiders', SD: 'Chargers', STL: 'Rams',
  };
  const teamName = (team) => teamNames[team] || team;
  const teamsFor = (game) => { const [away = 'Away', home = 'Home'] = game.matchup.split(' at '); return { away, home }; };
  const spread = (value) => Number.isFinite(value) ? `${value > 0 ? '+' : ''}${value}` : '—';
  const signed = (value) => `${value > 0 ? '+' : ''}${value.toFixed(1)}`;
  const interval = (value) => value ? `${signed(value.lower)} to ${signed(value.upper)} pp` : '—';
  const kickoffFormatter = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Chicago', weekday: 'short', hour: 'numeric', minute: '2-digit', hour12: true,
  });
  function kickoffLabel(kickoff) {
    if (!kickoff?.utc || !Number.isFinite(Date.parse(kickoff.utc))) return '—';
    const parts = Object.fromEntries(kickoffFormatter.formatToParts(new Date(kickoff.utc))
      .filter(part => part.type !== 'literal').map(part => [part.type, part.value]));
    const minutes = parts.minute === '00' ? '' : `:${parts.minute}`;
    return `${parts.weekday} ${parts.hour}${minutes}${parts.dayPeriod.toLowerCase()}`;
  }
  let orderedGames = [];
  let unavailableGames = [];
  let defaultGames = [];
  let storageKey;
  let picksKey;
  const picks = new Map();
  const expandedContext = new Set();
  const cardNodes = new Map();
  let drag = null;
  let scrollFrame;
  let pointerInteraction = false;
  let pendingPoints = null;
  let pointsCommitTimer;
  const savePicks = () => { try { localStorage.setItem(picksKey, JSON.stringify(Object.fromEntries(picks))); } catch {} };
  const saveRanks = () => { try { localStorage.setItem(storageKey, JSON.stringify(orderedGames.map((game) => game.gameId))); } catch {} };
  function restoreRanks(games) {
    let stored;
    try { stored = JSON.parse(localStorage.getItem(storageKey) || '[]'); } catch { return games; }
    if (!Array.isArray(stored) || stored.length !== games.length || new Set(stored).size !== games.length || stored.some((id) => !games.some((game) => game.gameId === id))) return games;
    return stored.map((id) => games.find((game) => game.gameId === id));
  }
  function restorePicks(games) {
    let stored;
    try { stored = JSON.parse(localStorage.getItem(picksKey) || '{}'); } catch { return; }
    if (!stored || typeof stored !== 'object' || Array.isArray(stored)) return;
    for (const game of games) {
      const { away, home } = teamsFor(game);
      if (Object.hasOwn(stored, game.gameId) && [away, home].includes(stored[game.gameId])) picks.set(game.gameId, stored[game.gameId]);
    }
  }
  function move(gameId, targetIndex, focusClass = 'drag-handle') {
    const currentIndex = orderedGames.findIndex((game) => game.gameId === gameId);
    if (currentIndex < 0 || !Number.isInteger(targetIndex) || targetIndex < 0 || targetIndex >= orderedGames.length) return;
    const [game] = orderedGames.splice(currentIndex, 1);
    orderedGames.splice(targetIndex, 0, game);
    if (currentIndex === targetIndex) return;
    saveRanks(); renderCards();
    if (focusClass) cardNodes.get(gameId)?.querySelector(`.${focusClass}`)?.focus();
    byId('status').textContent = `${game.matchup}: ${orderedGames.length - targetIndex} points.`;
  }
  function pointsControl(game, index) {
    const label = namedElement('label', 'points-control');
    const input = element('input'); input.setAttribute('type', 'number'); input.setAttribute('class', 'points-value'); input.setAttribute('min', '1'); input.setAttribute('max', orderedGames.length); input.value = String(orderedGames.length - index);
    let leavingWithTab = false;
    input.addEventListener('keydown', (event) => { if (event.key === 'Tab') leavingWithTab = true; });
    input.addEventListener('focusout', () => {
      if (!leavingWithTab) return;
      leavingWithTab = false;
      // Allow native Tab/Shift+Tab focus movement before updating the board.
      pointsCommitTimer = setTimeout(() => commitPendingPoints(document.activeElement), 0);
    });
    input.setAttribute('aria-label', `Points ${game.matchup}`);
    input.addEventListener('change', (event) => {
      const points = Number(event.target.value);
      if (!event.target.value.trim() || !Number.isInteger(points) || points < 1 || points > orderedGames.length) {
        input.value = String(orderedGames.length - orderedGames.findIndex((entry) => entry.gameId === game.gameId));
        byId('status').textContent = `Enter a whole number from 1 to ${orderedGames.length}.`;
        return;
      }
      const targetIndex = orderedGames.length - points;
      // Blur fires change before the new pointer target receives its click.
      // Keep that target in place until its action has completed.
      if (pointerInteraction || leavingWithTab) pendingPoints = { gameId: game.gameId, targetIndex };
      else move(game.gameId, targetIndex, 'points-value');
    });
    label.append(input, element('span', 'Your pts')); return label;
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
  function lineupControl(game) {
    const section = namedElement('section', 'lineup-section');
    const content = namedElement('div', 'lineup-context');
    content.setAttribute('id', `lineup-${game.gameId}`);
    content.append(lineupTeam(game.lineup?.home), lineupTeam(game.lineup?.away));
    if (!expandedContext.has(game.gameId)) content.setAttribute('hidden', '');
    const button = element('button', 'View team context'); button.type = 'button';
    button.setAttribute('aria-label', `View team context for ${game.matchup}`);
    button.setAttribute('aria-controls', `lineup-${game.gameId}`);
    button.setAttribute('aria-expanded', String(expandedContext.has(game.gameId)));
    button.addEventListener('click', () => {
      const expanded = !expandedContext.has(game.gameId);
      if (expanded) expandedContext.add(game.gameId); else expandedContext.delete(game.gameId);
      button.setAttribute('aria-expanded', expanded ? 'true' : 'false');
      if (expanded) content.removeAttribute('hidden');
      else content.setAttribute('hidden', '');
    });
    section.append(button, content); return section;
  }
  function clearDropMarkers() {
    for (const card of cardNodes.values()) card.classList.remove('insert-before', 'insert-after');
  }
  function updateDropPosition() {
    const others = [...cardNodes.entries()].filter(([id]) => id !== drag.gameId).map(([, card]) => card);
    const next = others.findIndex((card) => { const bounds = card.getBoundingClientRect(); return drag.y < bounds.top + bounds.height / 2; });
    drag.slot = next < 0 ? others.length : next;
    clearDropMarkers();
    if (next < 0) others.at(-1)?.classList.add('insert-after'); else others[next].classList.add('insert-before');
    const preview = byId('drag-preview');
    preview.textContent = `${drag.game.matchup} → ${orderedGames.length - drag.slot} pts`;
    preview.removeAttribute('hidden');
    preview.style.left = `${Math.max(8, Math.min(drag.x + 16, window.innerWidth - 230))}px`;
    preview.style.top = `${Math.max(8, Math.min(drag.y + 12, window.innerHeight - 45))}px`;
  }
  function scrollWhileDragging() {
    if (!drag?.active) return;
    const amount = drag.y < 70 ? -16 : drag.y > window.innerHeight - 70 ? 16 : 0;
    if (amount) { window.scrollBy(0, amount); updateDropPosition(); }
    scrollFrame = requestAnimationFrame(scrollWhileDragging);
  }
  function finishDrag(cancel = false) {
    if (!drag) return;
    const previous = drag;
    drag = null;
    if (scrollFrame !== undefined) cancelAnimationFrame(scrollFrame);
    if (previous.active) {
      clearDropMarkers(); cardNodes.get(previous.gameId)?.classList.remove('is-dragging');
      byId('drag-preview').setAttribute('hidden', '');
    }
    if (previous.active) pendingPoints = null;
    if (previous.active && !cancel) move(previous.gameId, previous.slot);
  }
  function commitPendingPoints(target) {
    pointerInteraction = false;
    if (pointsCommitTimer !== undefined) clearTimeout(pointsCommitTimer);
    if (!pendingPoints) return;
    const pending = pendingPoints; pendingPoints = null;
    const control = target?.closest('button, a, input');
    const cardId = control?.closest('.week-game')?.getAttribute('data-game-id');
    let selector;
    if (control?.classList.contains('team-button')) selector = `.team-button[data-team="${control.getAttribute('data-team')}"]`;
    else if (control?.classList.contains('matchup-search')) selector = '.matchup-search';
    else if (control?.classList.contains('drag-handle')) selector = '.drag-handle';
    else if (control?.classList.contains('points-value')) selector = '.points-value';
    else if (control?.hasAttribute('aria-controls')) selector = '.lineup-section > button';
    move(pending.gameId, pending.targetIndex, null);
    if (cardId && selector) cardNodes.get(cardId)?.querySelector(selector)?.focus();
  }
  document.addEventListener('pointerdown', () => { pointerInteraction = true; }, true);
  document.addEventListener('click', (event) => commitPendingPoints(event.target));
  function dragHandle(game, index) {
    const handle = namedElement('button', 'drag-handle', '⠿'); handle.type = 'button';
    handle.setAttribute('aria-label', `Reorder ${game.matchup}. Drag or use Up and Down arrow keys.`);
    handle.addEventListener('keydown', (event) => {
      if (!['ArrowUp', 'ArrowDown'].includes(event.key)) return;
      event.preventDefault(); move(game.gameId, index + (event.key === 'ArrowUp' ? -1 : 1));
    });
    handle.addEventListener('pointerdown', (event) => {
      if (event.button !== 0 || drag) return;
      handle.setPointerCapture(event.pointerId);
      handle.focus();
      drag = { gameId: game.gameId, game, pointerId: event.pointerId, startY: event.clientY, y: event.clientY, x: event.clientX, active: false, slot: index };
    });
    handle.addEventListener('lostpointercapture', () => finishDrag(true));
    return handle;
  }
  document.addEventListener('pointermove', (event) => {
    if (!drag || drag.pointerId !== event.pointerId) return;
    drag.x = event.clientX; drag.y = event.clientY;
    if (!drag.active && Math.abs(drag.y - drag.startY) < 5) return;
    if (!drag.active) { drag.active = true; cardNodes.get(drag.gameId).classList.add('is-dragging'); scrollFrame = requestAnimationFrame(scrollWhileDragging); }
    updateDropPosition();
  });
  document.addEventListener('pointerup', (event) => {
    if (drag?.pointerId === event.pointerId) finishDrag();
    // A release outside the original target may produce no click.
    pointsCommitTimer = setTimeout(() => commitPendingPoints(), 0);
  });
  document.addEventListener('pointercancel', (event) => {
    if (drag?.pointerId === event.pointerId) finishDrag(true);
    commitPendingPoints();
  });
  document.addEventListener('keydown', (event) => { if (event.key === 'Escape') finishDrag(true); });

  function teamButton(game, team, pickValue, buttons) {
    const button = namedElement('button', 'team-button', team); button.type = 'button';
    button.setAttribute('data-team', team);
    button.setAttribute('aria-label', `Pick ${teamName(team)} for ${game.matchup}`);
    button.setAttribute('aria-pressed', String(picks.get(game.gameId) === team));
    button.addEventListener('click', () => {
      picks.set(game.gameId, team); savePicks(); pickValue.textContent = teamName(team);
      for (const entry of buttons) entry.setAttribute('aria-pressed', String(entry === button));
    });
    buttons.push(button); return button;
  }
  function metric(label, value) {
    const section = namedElement('div', 'game-metric');
    section.append(namedElement('span', 'metric-label', label), element('strong', value)); return section;
  }
  function gameCard(game, index) {
    const { away, home } = teamsFor(game);
    const card = namedElement('article', 'week-game');
    card.setAttribute('aria-label', game.matchup); card.setAttribute('data-game-id', game.gameId); card.setAttribute('role', 'listitem');
    cardNodes.set(game.gameId, card);
    const rail = namedElement('div', 'rank-rail');
    // Keep navigation here; a matchup-details modal is deliberately deferred.
    const link = namedElement('a', 'matchup-search');
    link.setAttribute('href', `/games/${encodeURIComponent(game.gameId)}/`);
    link.setAttribute('aria-label', `Open matchup for ${game.matchup}`); link.setAttribute('title', 'Open matchup');
    rail.append(dragHandle(game, index), pointsControl(game, index), link);
    const content = namedElement('div', 'game-content');
    const body = namedElement('div', 'game-body');
    const meta = namedElement('div', 'game-meta');
    const matchup = namedElement('div', 'game-teams');
    const pickValue = namedElement('div', 'my-pick-value', teamName(picks.get(game.gameId)) || '—');
    const buttons = [];
    matchup.append(teamButton(game, away, pickValue, buttons), namedElement('span', 'matchup-at', 'at'), teamButton(game, home, pickValue, buttons));
    meta.append(namedElement('p', 'game-kickoff', kickoffLabel(game.kickoff)), matchup,
      namedElement('p', 'team-names', `${teamName(away)} at ${teamName(home)}`));
    const personal = namedElement('section', 'my-pick'); personal.setAttribute('aria-label', `My Pick for ${game.matchup}`);
    personal.append(namedElement('span', 'metric-label', 'My Pick'), pickValue);
    const history = namedElement('div', 'history-panel');
    const lean = namedElement('div', 'history-lean');
    const homeLine = game.currentOdds.consensusSpreadHome;
    const pickLine = game.recommendedPick === home ? homeLine : -homeLine;
    lean.append(namedElement('span', 'metric-label', 'Leans'), namedElement('div', 'history-lean-value',
      game.recommendedPick ? `${teamName(game.recommendedPick)} ${spread(pickLine)}` : '—'));
    const score = namedElement('div', 'history-score');
    score.append(namedElement('span', 'metric-label', 'Deviation'), namedElement('strong', 'history-score-value',
      game.weightedConfidence === null ? '—' : `${game.weightedConfidence}/100`));
    history.append(lean, score);
    const stats = namedElement('div', 'game-metrics');
    stats.append(metric('Home line', spread(homeLine)), metric('Similar games', game.candidateCount),
      metric('Cover split', game.coverSplit === null ? '—' : `${game.coverSplit > 0 ? '+' : ''}${Math.round(game.coverSplit)} pp`),
      metric('95% CI (pp)', interval(game.coverSplitInterval)));
    body.append(meta, personal, history, stats); content.append(body, lineupControl(game)); card.append(rail, content); return card;
  }
  function renderCards() {
    cardNodes.clear();
    const cards = orderedGames.map(gameCard);
    for (const game of unavailableGames) {
      const card = namedElement('article', 'unavailable-game'); card.setAttribute('role', 'listitem');
      card.append(element('strong', game.gameId), element('span', game.message)); cards.push(card);
    }
    byId('slate-body').replaceChildren(...cards);
  }
  function render(data) {
    byId('status').textContent = '';
    byId('slate-heading').textContent = `${data.season} · Week ${data.week}`;
    storageKey = `nfl-ats-pucker:week-ranks:${data.season}:${data.week}`;
    picksKey = `nfl-ats-pucker:week-picks:${data.season}:${data.week}`;
    const ready = data.games.filter((game) => game.status === 'ready').sort((a, b) => b.weightedConfidence - a.weightedConfidence || Math.abs(b.coverSplit) - Math.abs(a.coverSplit) || a.matchup.localeCompare(b.matchup));
    defaultGames = ready;
    orderedGames = restoreRanks([...ready]);
    restorePicks(ready);
    unavailableGames = data.games.filter((game) => game.status !== 'ready');
    renderCards();
    if (!data.games.length) {
      byId('status').textContent = 'No games available.';
      byId('status').setAttribute('class', 'empty-state');
    }
    byId('reset-order').addEventListener('click', () => {
      finishDrag(true); pendingPoints = null; orderedGames = [...defaultGames]; saveRanks(); renderCards();
      byId('status').textContent = 'Order reset.';
    });
  }
  fetch('/api/slate', { cache: 'no-store' }).then((response) => {
    if (!response.ok) throw new Error('Slate unavailable'); return response.json();
  }).then(render).catch(() => {
    byId('status').textContent = 'Unable to load.'; byId('status').setAttribute('class', 'load-error');
    byId('slate-body').replaceChildren();
  });
})();
