const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { createOurladsDepthChartClient } = require('../src/ourlads-depth-chart-client');
const html = fs.readFileSync(`${__dirname}/fixtures/ourlads-depth-chart-ARI.html`, 'utf8');
const now = () => new Date('2026-10-06T12:00:00Z');

test('maps team aliases, normalizes names, and retains only first and second string across all three units', async () => {
  for (const [team, code] of [['ARI', 'ARZ'], ['LA', 'RAM'], ['GB', 'GB'], ['NE', 'NE']]) {
    const result = await createOurladsDepthChartClient({ now, fetchImpl: async (url, options) => {
      assert.equal(url, `https://www.ourlads.com/nfldepthcharts/depthchart/${code}`);
      assert.equal(options.headers.Accept, 'text/html');
      return { ok: true, text: async () => html.replace('value="ARZ"', `value="${code}"`) };
    } }).fetchDepthChart({ team });
    assert.deepEqual(result.slots, [
      { position: 'QB', rank: 1, player: 'New Starter' }, { position: 'QB', rank: 2, player: 'Second Backup' },
      { position: 'CB', rank: 1, player: 'One Defender' }, { position: 'PK', rank: 1, player: 'One Kicker' },
    ]);
    assert.equal(result.sourceUpdatedAt, '2026-10-05T17:52:00.000Z');
    assert.equal(result.retrievedAt, '2026-10-06T12:00:00.000Z');
    assert.equal(result.rawCapture.body.includes('Third, Hidden'), true);
  }
});

test('interprets winter Eastern timestamps without assuming daylight saving time', async () => {
  const result = await createOurladsDepthChartClient({ now, fetchImpl: async () => ({ ok: true,
    text: async () => html.replace('10/05/2026 1:52PM', '01/05/2026 12:52AM') }) }).fetchDepthChart({ team: 'ARI' });
  assert.equal(result.sourceUpdatedAt, '2026-01-05T05:52:00.000Z');
});

test('fails closed on missing timestamp, units, position, player markup, wrong team and duplicate slots', async () => {
  for (const body of [html.replace('Updated: 10/05/2026 1:52PM ET', ''), html.replace('10/05/2026', '02/30/2026'),
    html.replace('dcTBody2', 'missing'), html.replace('<td>QB</td>', '<td></td>'),
    html.replace('<a href="/nfldepthcharts/player/1/">Starter, New</a>', 'Starter, New'),
    html.replace('value="ARZ"', 'value="RAM"'), html.replace('<td>CB</td>', '<td>QB</td>')]) {
    await assert.rejects(createOurladsDepthChartClient({ now, fetchImpl: async () => ({ ok: true, text: async () => body }) }).fetchDepthChart({ team: 'ARI' }));
  }
});

test('rejects HTTP failures, empty pages and unmapped teams', async () => {
  for (const response of [{ ok: false }, { ok: true, text: async () => '' }]) {
    await assert.rejects(createOurladsDepthChartClient({ now, fetchImpl: async () => response }).fetchDepthChart({ team: 'ARI' }));
  }
  await assert.rejects(createOurladsDepthChartClient({ now }).fetchDepthChart({ team: '../bad' }), /team/i);
});
