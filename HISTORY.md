## 2.0.0 — Unreleased

- Require Node.js 22 or newer; replace legacy Mocha/Istanbul/async with the built-in test runner and native Promises.
- Add Promise-based suggestion calls and providers, configurable concurrency, and TypeScript declarations while retaining callbacks.
- Use Maps and Sets for arbitrary string IDs, including prototype-like names.
- Complete once on provider failures, reject malformed lists, and ignore duplicate callbacks.
- Restore dead-end walk probability to the starting node; stabilize ties independent of I/O order.
- Cache each node/direction once per call and retain only the top K candidates while ranking.
- Validate options and support zero alpha, iteration, and result limits.
- Replace Travis/Coveralls badges with GitHub Actions and rewrite the README with tested examples and explicit contracts.

1.0.0 / 2015-04-26
==================

  * Initial release
