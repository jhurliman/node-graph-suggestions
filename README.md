# node-graph-suggestions

[![NPM Version][npm-image]][npm-url]
[![NPM Downloads][downloads-image]][downloads-url]
[![Build Status][travis-image]][travis-url]
[![Test Coverage][coveralls-image]][coveralls-url]

Provides "people you should follow" or other graph-based recommendations. By 
calling the suggest method and providing two data fetching methods for looking 
up forward connections (ie "users followed by a user") and reverse connections 
(ie "users following a user") you can get back a list of suggested friends, 
products, or any other concept that can be represented as a graph.

## Installation ##

Use NPM to install:

    npm install graph-suggestions

## Usage ##

A simple example showing the behavior of the forwardOnly option.

```javascript
var suggestions = require('graph-suggestions');

var DATA_STORE = {
  Andrew: { friends: [ 'Ben' ] },
  Ben: { friends: [ 'Andrew', 'Chuck' ] },
  Chuck: { friends: [ 'Ben' ] },
  Dennis: { friends: [ 'Andrew' ] }
};

var opts = { forwardOnly: true, forwardConnections: forwardFetcher };
suggestions.suggest('Andrew', opts, function(err, results) {
  if (err) throw err;

  // Forward-Only: [{"nodeID":"Chuck","score":0.0625}]
  console.log('Forward-Only: ' + JSON.stringify(results));
});

opts = { forwardConnections: forwardFetcher, reverseConnections: reverseFetcher };
suggestions.suggest('Andrew', opts, function(err, results) {
  if (err) throw err;

  // Bi-Directional: [{"nodeID":"Dennis","score":0.111},{"nodeID":"Chuck","score":0.0417}]
  console.log('Bi-Directional: ' + JSON.stringify(results));
});

function forwardFetcher(nodeID, callback) {
  var node = DATA_STORE[nodeID];
  callback(null, node ? node.friends : []);
}

function reverseFetcher(nodeID, callback) {
  var array = [];
  for (var curNodeID in DATA_STORE) {
    var node = DATA_STORE[curNodeID];
    if (node.friends.indexOf(nodeID) !== -1)
      array.push(curNodeID);
  }
  callback(null, array);
}
```

## License

[MIT](LICENSE)

[npm-image]: https://img.shields.io/npm/v/graph-suggestions.svg?style=flat
[npm-url]: https://npmjs.org/package/graph-suggestions
[travis-image]: https://img.shields.io/travis/jhurliman/graph-suggestions.svg?style=flat
[travis-url]: https://travis-ci.org/jhurliman/graph-suggestions
[coveralls-image]: https://img.shields.io/coveralls/jhurliman/graph-suggestions.svg?style=flat
[coveralls-url]: https://coveralls.io/r/jhurliman/graph-suggestions?branch=master
[downloads-image]: https://img.shields.io/npm/dm/graph-suggestions.svg?style=flat
[downloads-url]: https://npmjs.org/package/graph-suggestions
