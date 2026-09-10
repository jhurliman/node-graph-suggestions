'use strict';

const MinHeap = require('./minheap');

exports.suggest = suggest;

function suggest(nodeID, options, callback) {
  const config = validate(nodeID, options);
  if (callback !== undefined && typeof callback !== 'function') {
    throw new TypeError('callback must be a function');
  }
  const result = pageRank(nodeID, config);
  if (callback) {
    result.then(value => callback(null, value), error => callback(error, null));
    return;
  }
  return result;
}

function validate(nodeID, options = {}) {
  if (typeof nodeID !== 'string') throw new TypeError('nodeID must be a string');
  options = options || {};
  const config = {
    ...options,
    alpha: options.alpha ?? 0.5,
    iterations: options.iterations ?? 3,
    maxResults: options.maxResults ?? 25,
    concurrency: options.concurrency ?? 10,
    forwardOnly: options.forwardOnly ?? false,
  };
  if (typeof config.forwardConnections !== 'function') {
    throw new TypeError('Missing required forwardConnections function');
  }
  if (!config.forwardOnly && typeof config.reverseConnections !== 'function') {
    throw new TypeError('Missing required reverseConnections function');
  }
  if (typeof config.forwardOnly !== 'boolean') throw new TypeError('forwardOnly must be boolean');
  for (const key of ['iterations', 'maxResults', 'concurrency']) {
    if (!Number.isSafeInteger(config[key]) || config[key] < (key === 'concurrency' ? 1 : 0)) {
      throw new RangeError(`${key} must be a ${key === 'concurrency' ? 'positive' : 'non-negative'} safe integer`);
    }
  }
  if (!Number.isFinite(config.alpha) || config.alpha < 0 || config.alpha > 1) {
    throw new RangeError('alpha must be between zero and one');
  }
  return config;
}

// Cache each direction per invocation, including in-flight reads. Always copy
// results so a provider cannot mutate the traversal after resolving a fetch.
function fetcher(read) {
  const cache = new Map();
  return nodeID => {
    if (!cache.has(nodeID)) {
      const pending = new Promise((resolve, reject) => {
        let settled = false;
        const done = (error, neighbors) => {
          if (settled) return;
          settled = true;
          if (error) return reject(error);
          if (!Array.isArray(neighbors) || Array.from(neighbors).some(id => typeof id !== 'string')) {
            reject(new TypeError('connection fetchers must return an array of string node IDs'));
          } else {
            resolve(neighbors.slice());
          }
        };
        try {
          const returned = read(nodeID, done);
          if (returned && typeof returned.then === 'function') returned.then(value => done(null, value), done);
        } catch (error) {
          done(error);
        }
      });
      cache.set(nodeID, pending);
    }
    return cache.get(nodeID);
  };
}

async function mapLimit(entries, concurrency, read) {
  const results = new Array(entries.length);
  let cursor = 0;
  let failed = false;
  await Promise.all(Array.from({ length: Math.min(concurrency, entries.length) }, async () => {
    while (!failed && cursor < entries.length) {
      const index = cursor++;
      try {
        results[index] = await read(entries[index]);
      } catch (error) {
        failed = true;
        throw error;
      }
    }
  }));
  return results;
}

async function pageRank(startID, options) {
  if (options.maxResults === 0 || options.iterations === 0 || options.alpha === 0) return [];
  const forward = fetcher(options.forwardConnections);
  const reverse = options.forwardOnly ? null : fetcher(options.reverseConnections);
  let probabilities = new Map([[startID, 1]]);

  for (let iteration = 0; iteration < options.iterations; iteration++) {
    const entries = Array.from(probabilities);
    const neighbors = await mapLimit(entries, options.concurrency, async ([nodeID]) => {
      if (!reverse) return forward(nodeID);
      const [forwards, backwards] = await Promise.all([forward(nodeID), reverse(nodeID)]);
      return forwards.concat(backwards);
    });
    const next = new Map([[startID, 1 - options.alpha]]);
    // Accumulate in traversal order, independent of I/O completion order.
    entries.forEach(([nodeID, probability], index) => {
      const connections = neighbors[index];
      if (connections.length === 0) {
        next.set(startID, next.get(startID) + options.alpha * probability);
        return;
      }
      const share = options.alpha * probability / connections.length;
      for (const neighbor of connections) {
        next.set(neighbor, (next.get(neighbor) ?? 0) + share);
      }
    });
    probabilities = next;
  }

  const existing = new Set(await forward(startID));
  const heap = new MinHeap(null, (a, b) =>
    a.score - b.score || (a.nodeID < b.nodeID ? 1 : a.nodeID > b.nodeID ? -1 : 0));
  for (const [nodeID, score] of probabilities) {
    if (nodeID === startID || existing.has(nodeID) || score <= 0) continue;
    heap.push({ nodeID, score });
    if (heap.size() > options.maxResults) heap.pop();
  }
  const ranked = [];
  while (heap.size()) ranked.push(heap.pop());
  return ranked.reverse();
}
