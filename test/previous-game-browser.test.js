const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { buildDashboardPayload } = require('../src/dashboard-server');
const { compareHistorical } = require('../src/compare-historical');

const browser = ['/usr/bin/chromium', '/usr/bin/chromium-browser', '/usr/bin/google-chrome']
  .find(file => require('node:fs').existsSync(file));

test('real Chart.js renders previous-game margins with centered zero and responsive quarter dividers', {
  skip: !browser && 'Chromium is required',
}, async (t) => {
  const root = await fs.mkdtemp('/tmp/opencode/previous-game-browser-');
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const features = Object.fromEntries(['gamesPlayed', 'winPercentage', 'pointsScoredPerGame', 'pointsAllowedPerGame',
    'netYardsPerPlay', 'netEpaPerPlay', 'turnoverMarginPerGame', 'offensiveSackRate', 'defensiveSackRate',
    'restDays', 'passingEpaPerDropback', 'rushingEpaPerCarry', 'explosivePlayRate', 'passingCpoe',
    'interceptionRate', 'rushingYardsPerCarry', 'passingExplosiveRate', 'rushingExplosiveRate',
    'penaltyYardsPerGame'].map(field => [field, 1]));
  const input = { gameId: 'target', season: 2025, week: 3, gameType: 'REG', homeTeam: 'PHI', awayTeam: 'DAL',
    kickoff: { date: '2025-09-20', time: '13:00' }, closingSpreadHome: -3,
    currentOdds: { provider: 'nflverse', retrievedAt: '2025-09-20T12:00:00Z', consensusSpreadHome: -3 }, homePregame: features, awayPregame: features };
  const payload = buildDashboardPayload(input, compareHistorical({ input, historicalMatchups: [] }));
  const previous = { status: 'ready', source: 'ESPN', team: 'PHI', opponent: 'KC', date: '2025-09-14T17:00Z',
    teamScore: 20, opponentScore: 17, duration: 3600, boundaries: [0, 900, 1800, 2700, 3600],
    points: [{ seconds: 0, margin: 0, period: 1, clock: '15:00', teamScore: 0, opponentScore: 0 },
      { seconds: 300, margin: -7, period: 1, clock: '10:00', teamScore: 0, opponentScore: 7 },
      { seconds: 3600, margin: 3, period: 4, clock: '0:00', teamScore: 20, opponentScore: 17 }] };
  const overtime = { ...previous, team: 'DAL', opponent: 'NYG', teamScore: 10, opponentScore: 7, duration: 3780,
    points: [{ seconds: 0, margin: 0, period: 1, clock: '15:00', teamScore: 0, opponentScore: 0 },
      { seconds: 300, margin: -7, period: 1, clock: '10:00', teamScore: 0, opponentScore: 7 },
      { seconds: 3500, margin: 0, period: 4, clock: '1:40', teamScore: 7, opponentScore: 7 },
      { seconds: 3780, margin: 3, period: 5, clock: '7:00', teamScore: 10, opponentScore: 7 }] };
  const directory = path.join(__dirname, '../public/dashboard');
  const [markup, css, app, chart] = await Promise.all([
    fs.readFile(path.join(directory, 'index.html'), 'utf8'), fs.readFile(path.join(directory, 'styles.css'), 'utf8'),
    fs.readFile(path.join(directory, 'app.js'), 'utf8'), fs.readFile(path.join(__dirname, '../node_modules/chart.js/dist/chart.umd.js'), 'utf8'),
  ]);
  const html = markup.replace(/<link[^>]+href="\/styles\.css"[^>]*>/, `<style>${css}</style>`)
    .replace(/<script[^>]+src="[^"]+"[^>]*><\/script>/g, '')
    .replace('</body>', `<script>${chart}</script><script>
      window.fetch = async url => ({ ok: true, json: async () => url.startsWith('/api/previous-games')
        ? (${JSON.stringify({ home: previous, away: overtime })}) : (${JSON.stringify(payload)}) });
      ${app}
      window.addEventListener('load', () => {
        const panels = Array.from(document.querySelectorAll('.previous-game-panel'));
        const metrics = panels.map(panel => {
          const chart = Chart.getChart(panel.querySelector('canvas')); chart.resize();
          const lines = []; const original = Path2D.prototype.lineTo;
          Path2D.prototype.lineTo = function(x, y) { lines.push([x, y]); return original.call(this, x, y); };
          chart.update('none'); Path2D.prototype.lineTo = original;
          const [start, score] = chart.getDatasetMeta(0).data;
          const near = (a, b) => Math.abs(a - b) < 0.5;
          const scoreStep = lines.some((line, index) => near(line[0], score.x) && near(line[1], start.y) &&
            lines[index + 1] && near(lines[index + 1][0], score.x) && near(lines[index + 1][1], score.y));
          const y = chart.scales.y; const bounds = panel.getBoundingClientRect();
          return { zero: y.getPixelForValue(0), middle: (y.top + y.bottom) / 2, min: y.min, max: y.max,
            ticks: chart.scales.x.ticks.map(tick => tick.value), datasets: chart.data.datasets.length,
            left: bounds.left, top: bounds.top, right: bounds.right, canvasWidth: chart.width,
            scoreStep, duration: chart.scales.x.max };
        });
        const output = document.createElement('pre'); output.id = 'chart-result';
        output.textContent = JSON.stringify({ metrics, viewport: innerWidth, scrollWidth: document.documentElement.scrollWidth });
        document.body.append(output);
      });
    </script></body>`);
  const file = path.join(root, 'charts.html');
  await fs.writeFile(file, html);
  for (const width of [400, 1200]) {
    const output = execFileSync(browser, ['--headless', '--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage',
      '--no-first-run', '--no-default-browser-check', `--window-size=${width},1000`,
      `--user-data-dir=${path.join(root, `profile-${width}`)}`, '--dump-dom', `file://${file}`],
    { encoding: 'utf8', timeout: 30000, stdio: ['ignore', 'pipe', 'pipe'] });
    const match = output.match(/<pre id="chart-result">([\s\S]*?)<\/pre>/);
    assert.ok(match, 'browser renders both charts');
    const result = JSON.parse(match[1].replace(/&gt;/g, '>').replace(/&lt;/g, '<').replace(/&amp;/g, '&'));
    assert.equal(result.metrics.length, 2);
    for (const [index, metrics] of result.metrics.entries()) {
      assert.ok(Math.abs(metrics.zero - metrics.middle) < 1);
      assert.equal(metrics.min, -metrics.max);
      assert.deepEqual(metrics.ticks, index === 0 ? [0, 900, 1800, 2700, 3600, 3780] : [0, 900, 1800, 2700, 3600]);
      assert.equal(metrics.duration, index === 0 ? 3780 : 3600);
      assert.equal(metrics.scoreStep, true, 'score changes vertically at its recorded time, not halfway between plays');
      assert.equal(metrics.datasets, 1);
      assert.ok(metrics.canvasWidth > 100);
      assert.ok(metrics.right <= result.viewport);
    }
    if (width === 400) assert.ok(result.metrics[1].top > result.metrics[0].top);
    else assert.equal(result.metrics[1].top, result.metrics[0].top);
  }
});
