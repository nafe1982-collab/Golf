const test = require('node:test');
const assert = require('node:assert/strict');
const { mergeData, fingerprint, GistClient, FILE_NAME } = require('../sync.js');

const NOW = 1_800_000_000_000;
const rec = (id, updatedAt, extra = {}) => ({ id, updatedAt, ...extra });

test('union of records from both sides', () => {
  const m = mergeData({ rounds: [rec('a', 1)] }, { rounds: [rec('b', 1)], courses: [rec('c', 1)] }, NOW);
  assert.deepEqual(m.rounds.map((r) => r.id).sort(), ['a', 'b']);
  assert.equal(m.courses.length, 1);
});

test('newer copy of a record wins, local wins ties', () => {
  const m = mergeData({ rounds: [rec('a', 5, { v: 'local' })] }, { rounds: [rec('a', 9, { v: 'remote' })] }, NOW);
  assert.equal(m.rounds[0].v, 'remote');
  const t = mergeData({ rounds: [rec('a', 5, { v: 'local' })] }, { rounds: [rec('a', 5, { v: 'remote' })] }, NOW);
  assert.equal(t.rounds[0].v, 'local');
});

test('deletions propagate but a later edit survives', () => {
  const del = mergeData({ rounds: [], deleted: { a: NOW - 10 } }, { rounds: [rec('a', NOW - 20)] }, NOW);
  assert.equal(del.rounds.length, 0);
  assert.ok(del.deleted.a);
  const edited = mergeData({ rounds: [], deleted: { a: NOW - 20 } }, { rounds: [rec('a', NOW - 10)] }, NOW);
  assert.equal(edited.rounds.length, 1);
});

test('merge is order independent', () => {
  const a = { rounds: [rec('x', 3), rec('y', 1)], deleted: { z: NOW - 1 } };
  const b = { rounds: [rec('y', 2), rec('z', 1)], courses: [rec('c', 1)] };
  assert.equal(fingerprint(mergeData(a, b, NOW)), fingerprint(mergeData(b, a, NOW)));
});

test('GistClient finds, pulls and pushes the data file', async () => {
  const calls = [];
  let stored = JSON.stringify({ rounds: [rec('a', 1)] });
  const fakeFetch = async (url, opts) => {
    calls.push([opts.method, url.replace('https://api.github.com', '')]);
    assert.equal(opts.headers.Authorization, 'Bearer tok');
    const ok = (body) => ({ ok: true, status: 200, json: async () => body });
    if (url.includes('/gists?')) return ok([{ id: 'other', files: { 'x.txt': {} } }, { id: 'g1', files: { [FILE_NAME]: {} } }]);
    if (opts.method === 'GET') return ok({ files: { [FILE_NAME]: { content: stored } } });
    if (opts.method === 'PATCH') {
      stored = JSON.parse(opts.body).files[FILE_NAME].content;
      return ok({});
    }
  };
  const c = new GistClient('tok', fakeFetch);
  assert.equal(await c.find(), 'g1');
  assert.equal((await c.pull('g1')).rounds[0].id, 'a');
  await c.push('g1', { rounds: [rec('b', 2)] });
  assert.equal(JSON.parse(stored).rounds[0].id, 'b');
});

test('GistClient reports a bad token clearly', async () => {
  const c = new GistClient('bad', async () => ({ ok: false, status: 401 }));
  await assert.rejects(c.find(), /rejected the token/);
});
