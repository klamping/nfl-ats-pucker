const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { createNflLineupClient } = require('../src/nfl-lineup-client');
const injuries = fs.readFileSync(`${__dirname}/fixtures/nfl-lineup-injuries.html`, 'utf8');
const transactions = fs.readFileSync(`${__dirname}/fixtures/nfl-lineup-transactions.html`, 'utf8');
const now = () => new Date('2026-10-04T12:00:00Z');
function fixtureFetch(injuryBody = injuries, transactionBody = transactions, requests = []) {
  return async (url, options) => {
    requests.push(url);
    assert.equal(options.headers.Accept, 'text/html');
    return { ok: true, text: async () => url.includes('/injuries/') ? injuryBody :
      url.endsWith('/signings/2026/9') ? transactionBody : transactions.replace(/<tbody>[\s\S]*<\/tbody>/, '<tbody></tbody>') };
  };
}

test('observes official statuses and filters team transactions using inclusive calendar dates', async () => {
  const requests = [];
  const client = createNflLineupClient({ fetchImpl: fixtureFetch(injuries, transactions, requests), now });
  const result = await client.fetchOfficial({ team: 'ARI' });
  assert.deepEqual(result.injuries, [
    { player: 'Example Player', position: 'QB', status: 'Questionable', observedAt: '2026-10-04T12:00:00.000Z' },
    { player: 'Reserve Player', position: 'WR', status: 'Practice: Did Not Participate In Practice', observedAt: '2026-10-04T12:00:00.000Z' },
  ]);
  assert.deepEqual(result.transactions, [{ date: '2026-09-20', player: 'Example Player', position: 'QB', detail: 'Signed' }]);
  assert.equal(result.rawCaptures.length, 13);
  for (const category of ['trades', 'signings', 'reserve-list', 'waivers', 'terminations', 'other']) {
    for (const month of [9, 10]) assert.ok(requests.includes(`https://www.nfl.com/transactions/league/${category}/2026/${month}`));
  }
  await client.fetchOfficial({ team: 'LA' });
  assert.equal(requests.length, 13, 'league downloads are shared across slate teams');
});

test('keeps blank positions explicitly unknown without inventing values', async () => {
  const result = await createNflLineupClient({ now, fetchImpl: fixtureFetch(injuries, transactions.replace('<td>QB</td>', '<td></td>')) }).fetchOfficial({ team: 'ARI' });
  assert.equal(result.transactions[0].position, null);
});

test('maps NFL.com AZ transaction logos to nflverse ARI', async () => {
  const result = await createNflLineupClient({ now, fetchImpl: fixtureFetch(injuries, transactions.replaceAll('/logos/ARI', '/logos/AZ')) }).fetchOfficial({ team: 'ARI' });
  assert.equal(result.transactions[0].player, 'Example Player');
});

test('fails closed for missing player, position, team, headers, or ambiguous injury tables', async () => {
  for (const body of [injuries.replace('Example Player', ''), injuries.replace('<td>QB</td>', ''), injuries + injuries, '<html>Changed markup</html>']) {
    await assert.rejects(createNflLineupClient({ now, fetchImpl: fixtureFetch(body) }).fetchOfficial({ team: 'ARI' }), /parse|markup|team/i);
  }
  for (const body of [transactions.replace('Example Player', ''), transactions.replace('<td>QB</td>', ''), transactions.replace('/logos/ARI', '/logos/UNKNOWN')]) {
    await assert.rejects(createNflLineupClient({ now, fetchImpl: fixtureFetch(injuries, body) }).fetchOfficial({ team: 'ARI' }), /parse|markup|team/i);
  }
});

test('rejects unmapped teams, missing team reports, empty responses and HTTP failures', async () => {
  await assert.rejects(createNflLineupClient({ now, fetchImpl: fixtureFetch() }).fetchOfficial({ team: 'BAD' }), /team/i);
  await assert.rejects(createNflLineupClient({ now, fetchImpl: fixtureFetch() }).fetchOfficial({ team: 'BUF' }), /team/i);
  for (const response of [{ ok: false, status: 503 }, { ok: true, text: async () => '' }]) {
    await assert.rejects(createNflLineupClient({ now, fetchImpl: async () => response }).fetchOfficial({ team: 'ARI' }));
  }
});

test('handles year rollover and excludes future and invalid source dates', async () => {
  const requests = [];
  const result = await createNflLineupClient({ now: () => new Date('2027-01-04Z'), fetchImpl: async (url) => {
    requests.push(url);
    return { ok: true, text: async () => url.includes('/injuries/') ? injuries : transactions.replace(/09\/20/g, '01/05') };
  } }).fetchOfficial({ team: 'ARI' });
  assert.equal(result.transactions.length, 0);
  assert.ok(requests.includes('https://www.nfl.com/transactions/league/signings/2026/12'));
});
