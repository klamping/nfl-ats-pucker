const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const directory = path.join(__dirname, '../public/dashboard');

test('local analysis board contains accessible controls and no remote resources or sensitive fields', () => {
  const html = fs.readFileSync(path.join(directory, 'index.html'), 'utf8');
  const js = fs.readFileSync(path.join(directory, 'app.js'), 'utf8');
  const css = fs.readFileSync(path.join(directory, 'styles.css'), 'utf8');
  assert.match(html, /<main\b/);
  assert.match(html, /<table\b/);
  assert.match(html, /<button\b/);
  assert.match(html, />Score</);
  assert.match(html, />Home closing line</);
  assert.match(html, />Final margin</);
  assert.match(html, />Vs spread</);
  assert.doesNotMatch(html, /NFL \/ ATS|LOCAL ANALYSIS BOARD|Descriptive historical research|Local, read-only comparison/);
  assert.match(html, /aria-live=/);
  assert.match(html, /src="\/app\.js"/);
  assert.match(html, /href="\/styles\.css"/);
  assert.match(js, /\/api\/comparison/);
  assert.match(js, /aria-sort/);
  assert.match(js, /aria-pressed/);
  assert.match(js, /Home cover/);
  assert.match(js, /Away cover/);
  assert.match(js, /Push/);
  assert.match(js, /No games/);
  assert.match(js, /Unable to load/);
  assert.match(js, /distanceContributions/);
  assert.match(css, /focus-visible/);
  for (const asset of [html, js, css]) {
    assert.doesNotMatch(asset, /theoddsapi|homeSpreads|https?:\/\//i);
  }
});

class Element {
  constructor(tagName = 'div') {
    this.tagName = tagName;
    this.children = [];
    this.attributes = {};
    this.listeners = {};
    this.value = '';
  }
  set textContent(value) { this.value = String(value); this.children = []; }
  get textContent() { return this.value + this.children.map((child) => child.textContent).join(''); }
  append(...children) { this.children.push(...children); }
  replaceChildren(...children) { this.value = ''; this.children = children; }
  setAttribute(key, value) { this.attributes[key] = String(value); }
  addEventListener(event, callback) { this.listeners[event] = callback; }
  click() { this.listeners.click?.(); }
  keydown(key) { this.listeners.keydown?.({ key, preventDefault() {} }); }
  find(predicate) {
    if (predicate(this)) return this;
    for (const child of this.children) {
      const found = child.find(predicate);
      if (found) return found;
    }
    return null;
  }
}

const IDS = ['status', 'target-title', 'target-meta', 'target-line', 'scope', 'summary',
  'profile-body', 'candidate-body', 'detail', 'sort-score', 'sort-season', 'sort-outcome',
  'sort-coverage', 'count-label'];

function runClient(reply, pathname = '/') {
  const elements = Object.fromEntries(IDS.map((id) => [id, new Element()]));
  for (const id of IDS.filter((name) => name.startsWith('sort-'))) {
    elements[id].parentElement = new Element('th');
  }
  const document = {
    getElementById: (id) => elements[id],
    createElement: (tag) => new Element(tag),
  };
  let requested;
  const fetch = async (url) => { requested = url; return reply; };
  vm.runInNewContext(fs.readFileSync(path.join(directory, 'app.js'), 'utf8'), { document, fetch, location: { pathname } });
  return { elements, requested, settled: new Promise((resolve) => setImmediate(resolve)) };
}

test('loads a weekly detail page from its game-specific comparison endpoint', async () => {
  const client = runClient({ ok: true, json: async () => sample }, '/games/2026_03_LA_DEN/');
  await client.settled;
  assert.equal(client.requested, '/api/comparison/2026_03_LA_DEN');
});

const sample = {
  target: { gameId: 'target', season: 2026, week: 3, gameType: 'REG', homeTeam: 'PHI',
    awayTeam: 'CHI', kickoff: { date: '2026-09-20', time: '13:00' },
    currentOdds: { consensusSpreadHome: 3, contributingBooks: 2 },
    homePregame: { passingEpaPerDropback: 0.12, rushingEpaPerCarry: 0.08, explosivePlayRate: 0.1,
      passingCpoe: 1.2, interceptionRate: 0.02, rushingYardsPerCarry: 4.2, passingExplosiveRate: 0.07,
      rushingExplosiveRate: 0.16, penaltyYardsPerGame: 30, offensiveSackRate: 0.04, defensiveSackRate: 0.06 },
    awayPregame: { passingEpaPerDropback: 0.05, rushingEpaPerCarry: null, explosivePlayRate: 0.08,
      passingCpoe: -0.3, interceptionRate: 0.03, rushingYardsPerCarry: 3.8, passingExplosiveRate: 0.04,
      rushingExplosiveRate: 0.14, penaltyYardsPerGame: 45, offensiveSackRate: 0.07, defensiveSackRate: 0.05 } },
  filters: { gameType: 'REG', weekWindow: { startWeek: 2, endWeek: 5 }, spreadBand: 3,
    featureWeights: { 'home.restDays': 0.05, closingSpreadHome: 0.05 },
    minimumFeatureCoverage: 0.7, maximumSimilarityDistance: 0.15, limit: null },
  summary: { candidateCount: 2, homeCovers: 1, awayCovers: 1, pushes: 0, homeCoverRate: 0.5 },
  coverMargins: { home: { count: 1, median: 3, lowerQuartile: 3, upperQuartile: 3 }, away: { count: 1, median: 1, lowerQuartile: 1, upperQuartile: 1 }, medianGap: 2 },
  distanceGroups: [{ maximumDistance: 0.025, candidateCount: 0, homeCovers: 0, awayCovers: 0,
    pushes: 0, homeCoverRate: null, awayCoverRate: null }, { maximumDistance: 0.05, candidateCount: 2,
    homeCovers: 1, awayCovers: 1, pushes: 0, homeCoverRate: 0.5, awayCoverRate: 0.5 }],
  candidates: [
    { gameId: 'one', season: 2020, week: 2, gameType: 'REG', homeTeam: 'GB', awayTeam: 'MIN',
      homeScore: 24, awayScore: 20, closingSpreadHome: 3, similarityScore: 0.1,
      distanceContributions: { 'home.restDays': 0.04, 'home.passingEpaPerDropback': 0.01, closingSpreadHome: 0.06 },
      featureCoverage: 0.9, omittedFeatures: ['away.netEpaPerPlay'], homeAtsMargin: 1, outcome: 'home_cover' },
    { gameId: 'two', season: 2018, week: 5, gameType: 'REG', homeTeam: 'LAR', awayTeam: 'SF',
      homeScore: 17, awayScore: 20, closingSpreadHome: 1, similarityScore: 0.3,
      distanceContributions: { 'home.restDays': 0.1 }, featureCoverage: 0.8,
      omittedFeatures: [], homeAtsMargin: -4, outcome: 'away_cover' },
  ],
};

test('renders target, summary, ATS text, details and keyboard-usable sort and selection', async () => {
  const { elements, requested, settled } = runClient(Promise.resolve({ ok: true, json: async () => sample }));
  await settled;
  assert.equal(requested, '/api/comparison');
  assert.match(elements['target-title'].textContent, /CHI.*PHI/);
  assert.match(elements['target-line'].textContent, /\+3.*home underdog/);
  assert.match(elements['count-label'].textContent, /^2 qualifying games$/);
  assert.match(elements.scope.textContent, /85% similarity/);
  assert.match(elements.summary.textContent, /Home covers.*Away covers.*Pushes/);
  assert.doesNotMatch(elements.summary.textContent, /≤ 0\.025/);
  assert.match(elements.summary.textContent, /≤ 0\.050.*H 50%.*A 50%/);
  assert.match(elements['profile-body'].textContent, /Passing EPA.*0\.050.*PHI \+0\.070.*0\.120/);
  assert.match(elements['profile-body'].textContent, /Rushing EPA.*—.*—.*0\.080/);
  assert.match(elements['profile-body'].textContent, /Penalty yards.*45.*PHI \+15.*30/);
  assert.ok(elements['profile-body'].find((node) => node.className?.includes('profile-away')));
  assert.ok(elements['profile-body'].find((node) => node.className?.includes('profile-edge-home')));
  assert.match(elements['candidate-body'].textContent, /Home cover.*Away cover/);
  assert.match(elements['candidate-body'].textContent, /MIN 20.*GB 24.*\+3.*\+4.*\+1.*Home cover/);
  assert.match(elements.detail.textContent, /MIN 20.*GB 24/);
  assert.match(elements.detail.textContent, /ATS margin.*\+1/);
  assert.match(elements.detail.textContent, /Home closing line.*\+3.*home underdog/);
  assert.match(elements.detail.textContent, /Home · Rest days/);
  assert.match(elements.detail.textContent, /Home · Passing EPA per dropback/);
  assert.match(elements.detail.textContent, /Omitted.*Away · Net EPA per play/);
  const first = elements['candidate-body'].children[0];
  assert.equal(first.attributes.tabindex, '0');
  assert.equal(first.find((node) => node.tagName === 'button').attributes['aria-pressed'], 'true');
  elements['sort-season'].click();
  assert.equal(elements['sort-season'].parentElement.attributes['aria-sort'], 'ascending');
  assert.match(elements['candidate-body'].children[0].textContent, /2018/);
  const selectedRow = elements['candidate-body'].children[0];
  selectedRow.keydown('Enter');
  assert.equal(elements['candidate-body'].children[0], selectedRow, 'selection keeps the focused row mounted');
  assert.match(elements.detail.textContent, /SF 20.*LAR 17/);
  assert.equal(elements['candidate-body'].children[0].find((node) => node.tagName === 'button').attributes['aria-pressed'], 'true');
});

test('labels a negative home spread as home favored', async () => {
  const homeFavored = {
    ...sample,
    target: {
      ...sample.target,
      currentOdds: { ...sample.target.currentOdds, consensusSpreadHome: -3.5 },
    },
  };
  const { elements, settled } = runClient(Promise.resolve({ ok: true, json: async () => homeFavored }));
  await settled;
  assert.match(elements['target-line'].textContent, /-3\.5.*home favored/);
});

test('identifies nflverse retrospective data as closing-line data instead of books', async () => {
  const retrospective = {
    ...sample,
    target: {
      ...sample.target,
      currentOdds: { provider: 'nflverse', consensusSpreadHome: 3 },
    },
  };
  const { elements, settled } = runClient(Promise.resolve({ ok: true, json: async () => retrospective }));
  await settled;
  assert.match(elements.scope.textContent, /nflverse closing-line data/);
  assert.doesNotMatch(elements.scope.textContent, /books/);
});

test('labels a zero home spread as even', async () => {
  const even = {
    ...sample,
    target: {
      ...sample.target,
      currentOdds: { ...sample.target.currentOdds, consensusSpreadHome: 0 },
    },
  };
  const { elements, settled } = runClient(Promise.resolve({ ok: true, json: async () => even }));
  await settled;
  assert.match(elements['target-line'].textContent, /0.*even/);
});

test('empty candidates and failed fetch have explicit states without stale details', async () => {
  const empty = runClient(Promise.resolve({ ok: true, json: async () => ({ ...sample,
    summary: { candidateCount: 0, homeCovers: 0, awayCovers: 0, pushes: 0, homeCoverRate: null },
    candidates: [] }) }));
  await empty.settled;
  assert.match(empty.elements.status.textContent, /No games/);
  assert.equal(empty.elements.detail.textContent, '');
  const failed = runClient(Promise.resolve({ ok: false, status: 500 }));
  await failed.settled;
  assert.match(failed.elements.status.textContent, /Unable to load/);
  assert.equal(failed.elements['candidate-body'].children.length, 0);
});

test('shows an even profile edge when a nonzero delta rounds to zero at display precision', async () => {
  const roundedTie = {
    ...sample,
    target: {
      ...sample.target,
      awayPregame: { ...sample.target.awayPregame, passingCpoe: 1.2 },
      homePregame: { ...sample.target.homePregame, passingCpoe: 1.20004 },
    },
  };
  const { elements, settled } = runClient(Promise.resolve({ ok: true, json: async () => roundedTie }));
  await settled;
  assert.match(elements['profile-body'].textContent, /Passing CPOE.*1\.200.*Even.*1\.200/);
});
