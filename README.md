# graph-suggestions

[![CI](https://github.com/jhurliman/node-graph-suggestions/actions/workflows/ci.yml/badge.svg)](https://github.com/jhurliman/node-graph-suggestions/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/graph-suggestions.svg)](https://www.npmjs.com/package/graph-suggestions)

Turn connections into **“people to follow”** recommendations. Supply functions
that retrieve a node's neighbors; `graph-suggestions` explores the local graph
and ranks candidates using a finite personalized PageRank calculation. It filters
out the starting node and its existing forward connections for you.

The same interface works for people, products, or documents. Your graph stays in
your database: the library needs only adjacency lists, with bounded concurrent
reads and a per-call cache. Version 2 has no runtime dependencies, supports
Promises and callbacks, and includes TypeScript declarations.

## Install

```sh
npm install graph-suggestions
```

Version 2 requires Node.js 22 or newer. CommonJS `require()` and Node.js ESM
named imports both work.

## A complete recommendation

Save this as `example.mjs`, then run `node example.mjs`:

```js
import { suggest } from 'graph-suggestions';

const following = new Map([
  ['Andrew', ['Ben']],
  ['Ben', ['Andrew', 'Chuck']],
  ['Chuck', ['Ben']],
  ['Dennis', ['Andrew']],
]);

const results = await suggest('Andrew', {
  forwardOnly: true,
  forwardConnections: async id => following.get(id) ?? [],
});

console.log(results);
// [ { nodeID: 'Chuck', score: 0.0625 } ]
```

Andrew already follows Ben. Chuck becomes a candidate because Ben follows Chuck.
A score is the probability at that node after the configured number of walk
steps; higher ranks first. Scores are not normalized over the filtered results.

## Follow connections in both directions

For a directed graph, reverse connections let the walk discover nodes that link
*to* the current node. For example, Dennis follows Andrew even though Andrew
does not follow Dennis. Provide both functions to include that information:

```js
const results = await suggest('Andrew', {
  forwardConnections: async id => following.get(id) ?? [],
  reverseConnections: async id => [...following]
    .filter(([, targets]) => targets.includes(id))
    .map(([source]) => source),
});
```

This snippet uses `suggest` and `following` from the complete example. For a
symmetric friendship graph, choose `forwardOnly: true` to avoid reading the same
relationships in both directions. On larger graphs, use an indexed reverse-edge
lookup instead of scanning every node.

## Options

| Option | Default | Meaning |
| --- | --- | --- |
| `forwardConnections(id, callback)` | Required | Fetch outgoing node IDs; return a Promise or call `callback(error, ids)` |
| `reverseConnections(id, callback)` | Required unless `forwardOnly` | Fetch incoming node IDs using the same contract |
| `forwardOnly` | `false` | Traverse only outgoing edges |
| `iterations` | `3` | Number of walk steps; non-negative integer |
| `alpha` | `0.5` | Probability of following an edge on each step, between 0 and 1 |
| `maxResults` | `25` | Maximum returned candidates; non-negative integer |
| `concurrency` | `10` | Maximum node lookups in flight; positive integer |

Node IDs must be strings, including IDs returned by fetchers. Empty strings and
names such as `constructor` are valid. Return `[]` for a node with no connections.
Each direction is read once per node per `suggest()` call; a later call fetches
fresh data. This cache is not an atomic snapshot of a changing database.

Bidirectional traversal reads both directions concurrently, so at most
`2 * concurrency` provider calls may be in flight. A repeated edge acts as a
repeated choice in the walk; deduplicate provider results if you want each
neighbor to count once.

## Callbacks and errors

Existing callback-based providers remain supported:

```js
const { suggest } = require('graph-suggestions');

suggest('Andrew', {
  forwardOnly: true,
  forwardConnections(id, done) {
    const graph = { Andrew: ['Ben'], Ben: ['Chuck'], Chuck: [] };
    done(null, Object.hasOwn(graph, id) ? graph[id] : []);
  },
}, (error, results) => {
  if (error) {
    console.error(error);
    return;
  }
  console.log(results);
});
```

Invalid configuration throws synchronously. Provider errors, thrown exceptions,
rejected promises, and malformed results reject the returned Promise or reach
the completion callback once. Already-started reads may finish after a failure;
no new reads are scheduled after the failure is observed. A provider must settle
its Promise or invoke its callback; the library does not impose a timeout.

## Ranking behavior

Each step follows a connection with probability `alpha` and returns to the
starting node with probability `1 - alpha`. Dead ends return their walk mass to
the starting node. After `iterations` steps, the starting node, existing outgoing
connections, and zero-score entries are removed. Results sort by descending
score, then ascending string ID for ties, independent of fetch completion order.

This is a bounded local calculation, not an iteration-until-convergence solver.
More steps explore farther, but can read substantially more of the graph. The
heap keeps ranking work to O(V log K) for V visited candidates and K results;
the traversal cache retains the adjacency lists it reads until the call finishes.

## Upgrading from 1.x

Version 2 preserves `suggest(id, options, callback)` and adds a Promise overload.
It requires Node.js 22+, validates options and string IDs, and honors explicit
zero values for `alpha`, `iterations`, and `maxResults` by returning no candidates.

Ranking can change: dead-end probability now returns to the starting node,
ties are deterministic, and repeated reads within a call use the first fetched
adjacency list. Prototype-like IDs no longer collide with internal state.
See [HISTORY.md](HISTORY.md) for the full release notes.

## Development

```sh
npm ci
npm test
npm run test:coverage
npm pack --dry-run
```

The suite retains the original graph examples and adds failure, concurrency,
cache, ID, and option regressions, plus comparisons against an independent dense
random-walk calculation. CI runs on Node.js 22, 24, and 26. No database is required.

## License

[MIT](LICENSE).
