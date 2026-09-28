(() => {
  'use strict';

  const byId = (id) => document.getElementById(id);
  const sorts = {
    score: { id: 'sort-score', value: (game) => game.similarityScore, direction: 1 },
    season: { id: 'sort-season', value: (game) => game.season, direction: 1 },
    outcome: { id: 'sort-outcome', value: (game) => game.outcome, direction: 1 },
    coverage: { id: 'sort-coverage', value: (game) => game.featureCoverage, direction: -1 },
  };
  const labels = {
    home_cover: 'Home cover', away_cover: 'Away cover', push: 'Push',
  };
  const features = {
    gamesPlayed: 'Games played', winPercentage: 'Win percentage',
    pointsScoredPerGame: 'Points scored per game', pointsAllowedPerGame: 'Points allowed per game',
    netYardsPerPlay: 'Net yards per play', netEpaPerPlay: 'Net EPA per play',
    turnoverMarginPerGame: 'Turnover margin per game', offensiveSackRate: 'Offensive sack rate',
    defensiveSackRate: 'Defensive sack rate', restDays: 'Rest days',
    closingSpreadHome: 'Home spread',
  };
  let data;
  let selectedId;
  let sortKey = 'score';
  let sortDirection = 1;

  function element(tag, text, className) {
    const node = document.createElement(tag);
    if (text !== undefined) node.textContent = String(text);
    if (className) node.className = className;
    return node;
  }

  function signed(value) { return `${value > 0 ? '+' : ''}${value}`; }
  function percent(value) { return value === null ? '—' : `${Math.round(value * 100)}%`; }
  function spread(value) {
    return `${signed(value)} · ${value > 0 ? 'home favored' : value < 0 ? 'away favored' : 'even'}`;
  }
  function featureName(key) {
    if (key === 'closingSpreadHome') return features[key];
    const [side, name] = key.split('.');
    return `${side === 'home' ? 'Home' : 'Away'} · ${features[name] || name}`;
  }

  function renderHeader() {
    const { target, filters, summary } = data;
    byId('target-title').textContent = `${target.awayTeam} at ${target.homeTeam}`;
    byId('target-meta').textContent = `${target.season} · Week ${target.week} · ${target.gameType === 'REG' ? 'Regular season' : 'Postseason'} · ${target.kickoff.date} ${target.kickoff.time}`;
    byId('target-line').textContent = spread(target.currentOdds.consensusSpreadHome);
    byId('scope').textContent = `Compared with ${filters.gameType === 'REG' ? 'regular-season' : 'postseason'} games in Weeks ${filters.weekWindow.startWeek}–${filters.weekWindow.endWeek}, within ${filters.spreadBand} spread points · ${target.currentOdds.contributingBooks} contributing books · minimum ${percent(filters.minimumFeatureCoverage)} feature coverage.`;
    const cards = [
      ['Analogues', summary.candidateCount, 'Closest eligible games'],
      ['Home covers', summary.homeCovers, 'Home side beat the line'],
      ['Away covers', summary.awayCovers, 'Away side beat the line'],
      ['Pushes', summary.pushes, 'Exactly on the line'],
      ['Home cover rate', percent(summary.homeCoverRate), 'Decided games only'],
    ];
    byId('summary').replaceChildren(...cards.map(([title, value, description]) => {
      const card = element('div', undefined, 'summary-card');
      card.append(element('h3', title, 'overline'), element('p', value, 'card-value'), element('p', description, 'micro'));
      return card;
    }));
    byId('count-label').textContent = `${summary.candidateCount} of up to ${filters.limit} games`;
  }

  function renderDetail(game) {
    const panel = byId('detail');
    if (!game) { panel.replaceChildren(); return; }
    const title = element('h3', `${game.awayTeam} at ${game.homeTeam}`);
    const heading = element('div', undefined, 'detail-heading');
    heading.append(element('p', 'SELECTED GAME / FINAL', 'overline'), title,
      element('p', `${game.season} · Week ${game.week} · ${game.gameType === 'REG' ? 'Regular season' : 'Postseason'}`, 'muted'));
    const score = element('p', `${game.awayTeam} ${game.awayScore}  ·  ${game.homeTeam} ${game.homeScore}`, 'final-score');
    const outcome = element('p', labels[game.outcome], `outcome outcome-${game.outcome}`);
    const facts = element('dl', undefined, 'facts');
    for (const [name, value] of [
      ['Home closing line', spread(game.closingSpreadHome)],
      ['ATS margin', signed(game.homeAtsMargin)],
      ['Similarity distance', game.similarityScore.toFixed(3)],
      ['Feature coverage', percent(game.featureCoverage)],
      ['Omitted features', game.omittedFeatures.length ? game.omittedFeatures.map(featureName).join(', ') : 'None'],
    ]) {
      facts.append(element('dt', name), element('dd', value));
    }
    const contributions = element('div', undefined, 'contributions');
    contributions.append(element('h4', 'Distance contributions'),
      element('p', 'Larger contributions add more distance; lower total distance means a closer match.', 'micro'));
    const list = element('ul');
    for (const [name, value] of Object.entries(game.distanceContributions)) {
      const row = element('li');
      row.append(element('span', featureName(name)), element('span', value.toFixed(3), 'tabular'));
      list.append(row);
    }
    contributions.append(list);
    panel.replaceChildren(heading, score, outcome, facts, contributions);
  }

  function renderTable() {
    const sorted = [...data.candidates].sort((left, right) => {
      const a = sorts[sortKey].value(left);
      const b = sorts[sortKey].value(right);
      return ((a > b) - (a < b)) * sortDirection ||
        left.similarityScore - right.similarityScore || left.gameId.localeCompare(right.gameId);
    });
    for (const [key, { id }] of Object.entries(sorts)) {
      byId(id).parentElement.setAttribute('aria-sort', key === sortKey ? sortDirection === 1 ? 'ascending' : 'descending' : 'none');
    }
    byId('candidate-body').replaceChildren(...sorted.map((game) => {
      const row = element('tr');
      row.setAttribute('tabindex', '0');
      row.setAttribute('data-selected', game.gameId === selectedId ? 'true' : 'false');
      const select = () => {
        selectedId = game.gameId;
        for (const candidateRow of byId('candidate-body').children) {
          const active = candidateRow === row;
          candidateRow.setAttribute('data-selected', active ? 'true' : 'false');
          candidateRow.children[0].children[0].setAttribute('aria-pressed', active ? 'true' : 'false');
        }
        renderDetail(game);
      };
      row.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); select(); }
      });
      const distance = element('td');
      const button = element('button', game.similarityScore.toFixed(3), 'game-select tabular');
      button.type = 'button';
      button.setAttribute('aria-label', `Select ${game.awayTeam} at ${game.homeTeam}, ${game.season} Week ${game.week}`);
      button.setAttribute('aria-pressed', game.gameId === selectedId ? 'true' : 'false');
      button.addEventListener('click', select);
      distance.append(button);
      row.append(distance, element('td', `${game.season} · W${game.week}`),
        element('td', `${game.awayTeam} at ${game.homeTeam}`),
        element('td', labels[game.outcome], `outcome-${game.outcome}`),
        element('td', percent(game.featureCoverage), 'tabular'));
      return row;
    }));
  }

  for (const [key, { id, direction }] of Object.entries(sorts)) {
    byId(id).addEventListener('click', () => {
      sortDirection = sortKey === key ? -sortDirection : direction;
      sortKey = key;
      if (data) renderTable();
    });
  }

  async function load() {
    try {
      const response = await fetch('/api/comparison', { cache: 'no-store' });
      if (!response.ok) throw new Error('Comparison unavailable');
      data = await response.json();
      renderHeader();
      if (!data.candidates.length) {
        byId('status').textContent = 'No historical games match this target and its comparison filters.';
        byId('candidate-body').replaceChildren();
        renderDetail(null);
        return;
      }
      selectedId = data.candidates[0].gameId;
      renderTable();
      renderDetail(data.candidates[0]);
      byId('status').textContent = `${data.summary.candidateCount} historical analogues loaded.`;
    } catch {
      byId('status').textContent = 'Unable to load historical comparison. Check that the local dashboard is running and refresh this page.';
      byId('candidate-body').replaceChildren();
      renderDetail(null);
    }
  }

  load();
})();
