'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { suggest } = require('..');
const forward = graph => async id => graph.get(id) || [];
const config = graph => ({ forwardOnly: true, forwardConnections: forward(graph) });

test('prototype-like and empty IDs are ordinary graph nodes', async () => {
  const graph = new Map([['root', ['edge']], ['edge', ['__proto__', 'constructor', 'toString', '']]]);
  const results = await suggest('root', { ...config(graph), iterations: 2 });
  assert.deepEqual(results.map(r => r.nodeID), ['', '__proto__', 'constructor', 'toString']);
  for (const result of results) assert.equal(result.score, 0.0625);
});

test('ties and the top-k cutoff are deterministic across asynchronous fetch order', async () => {
  const graph = new Map([['root', ['b', 'a']], ['a', ['d']], ['b', ['c']]]);
  for (const slow of ['a', 'b']) {
    const result = await suggest('root', {
      forwardOnly: true, iterations: 2, maxResults: 1,
      forwardConnections: async id => {
        if (id === slow) await new Promise(resolve => setImmediate(resolve));
        return graph.get(id) || [];
      }
    });
    assert.deepEqual(result, [{ nodeID: 'c', score: 0.125 }]);
  }
});

test('zero-valued options do not silently select defaults', async () => {
  const options = { forwardOnly: true, forwardConnections: () => { throw Error('must not fetch'); } };
  for (const overrides of [{ iterations: 0 }, { maxResults: 0 }, { alpha: 0 }]) {
    assert.deepEqual(await suggest('root', { ...options, ...overrides }), []);
  }
});

test('invalid configuration fails before I/O', () => {
  const options = { forwardOnly: true, forwardConnections: async () => [] };
  for (const key of ['iterations', 'maxResults', 'concurrency']) {
    for (const value of [-1, 0.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1]) {
      assert.throws(() => suggest('root', { ...options, [key]: value }), RangeError);
    }
  }
  for (const alpha of [-1, 2, NaN, Infinity]) assert.throws(() => suggest('root', { ...options, alpha }), RangeError);
  assert.throws(() => suggest(3, options), TypeError);
  assert.throws(() => suggest('root', { ...options, concurrency: 0 }), RangeError);
  assert.throws(() => suggest('root', { ...options, forwardOnly: 'yes' }), TypeError);
  assert.throws(() => suggest('root', options, 3), TypeError);
});

test('each direction is fetched once per node and call, without a cross-call stale cache', async () => {
  const reads = new Map();
  const options = { iterations: 20, forwardOnly: true, forwardConnections: async id => {
    reads.set(id, (reads.get(id) || 0) + 1);
    return id === 'root' ? ['a'] : ['root', 'b'];
  }};
  await suggest('root', options);
  assert.deepEqual([...reads.values()], [1, 1, 1]);
  await suggest('root', options);
  assert.deepEqual([...reads.values()], [2, 2, 2]);
});

test('callback errors, thrown errors and rejected promises reach the caller once', async () => {
  const failure = Error('read failed');
  for (const read of [
    (id, callback) => { callback(failure); callback(null, []); },
    () => { throw failure; },
    async () => { throw failure; }
  ]) {
    let calls = 0;
    await new Promise(resolve => suggest('root', { forwardOnly: true, forwardConnections: read }, error => {
      calls++;
      assert.equal(error, failure);
      resolve();
    }));
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(calls, 1);
  }
});

test('malformed and sparse neighbor lists reject cleanly', async () => {
  for (const neighbors of [undefined, null, 'node', [1], new Array(2)]) {
    await assert.rejects(suggest('root', { forwardOnly: true, forwardConnections: async () => neighbors }), TypeError);
  }
});

test('provider results are copied, and duplicate callbacks are ignored', async () => {
  const result = await suggest('root', { forwardOnly: true, iterations: 1,
    forwardConnections(id, callback) {
      const neighbors = ['friend'];
      callback(null, neighbors);
      neighbors.push('unexpected');
      callback(null, ['another']);
    }
  });
  assert.deepEqual(result, []);
});

test('limits concurrent node reads and stops scheduling after a failure', async () => {
  let active = 0, maximum = 0;
  const leaves = Array.from({ length: 100 }, (_, i) => String(i));
  await suggest('root', { forwardOnly: true, concurrency: 3, iterations: 3,
    forwardConnections: async id => {
      maximum = Math.max(maximum, ++active);
      await new Promise(resolve => setImmediate(resolve));
      active--;
      return id === 'root' ? leaves : ['candidate'];
    }
  });
  assert.equal(maximum, 3);
  let scheduled = 0;
  await assert.rejects(suggest('root', { forwardOnly: true, concurrency: 1, iterations: 2,
    forwardConnections: async id => {
      if (id === 'root') return leaves;
      scheduled++;
      throw Error('failure');
    }
  }), /failure/);
  assert.equal(scheduled, 1);
});

test('matches a dense independent random-walk oracle on graphs with cycles and sinks', async () => {
  let seed = 123;
  const random = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 2 ** 32);
  for (let trial = 0; trial < 30; trial++) {
    const size = 8;
    const edges = Array.from({ length: size }, () => Array.from({ length: size }, (_, i) => i).filter(() => random() < 0.22));
    const graph = new Map(edges.map((ids, i) => [String(i), ids.map(String)]));
    const alpha = random();
    let distribution = Array(size).fill(0); distribution[0] = 1;
    for (let step = 0; step < 7; step++) {
      const next = Array(size).fill(0); next[0] = 1 - alpha;
      for (let from = 0; from < size; from++) {
        const destinations = edges[from].length ? edges[from] : [0];
        for (const to of destinations) next[to] += alpha * distribution[from] / destinations.length;
      }
      distribution = next;
    }
    assert.ok(Math.abs(distribution.reduce((a, b) => a + b, 0) - 1) < 1e-12);
    const expected = distribution.map((score, id) => ({ nodeID: String(id), score }))
      .filter(r => r.nodeID !== '0' && !edges[0].includes(Number(r.nodeID)) && r.score > 0)
      .sort((a, b) => b.score - a.score || a.nodeID.localeCompare(b.nodeID));
    const result = await suggest('0', { ...config(graph), alpha, iterations: 7 });
    assert.deepEqual(result.map(r => r.nodeID), expected.map(r => r.nodeID));
    result.forEach((r, i) => assert.ok(Math.abs(r.score - expected[i].score) < 1e-12));
  }
});
