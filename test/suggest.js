var assert = require('assert');
var suggestions = require('../');


var DATA_STORE = {
  Andrew: { friends: [ 'Ben', 'Matt' ] },
  Ben: { friends: [ 'Chuck', 'Stephen', 'Andrew' ] },
  Chuck: { friends: [ 'Stephen', 'Rajat', 'Ben', 'Lyric' ] },
  Lyric: { friends: [ 'Chuck' ] },
  Matt: { friends: [ 'Pachu' ] },
  Pachu: { friends: [ ] },
  Rajat: { friends: [ 'Chuck', 'Stephen' ] },
  Stephen: { friends: [ 'Ben', 'Chuck', 'Rajat' ] }
};


describe('graph-suggestions', function() {
  describe('#suggest()', function() {
    it('should fail if forwardConnections is not specified', function() {
      assert.throws(function() {
        suggestions.suggest('', null, function(err, results) { });
      }, Error);
    });

    it('should return nothing for an empty graph', function(done) {
      suggestions.suggest('', { forwardOnly: true, forwardConnections: emptyFetcher }, function(err, results) {
        if (err) throw err;

        assert.ok(results);
        assert.equal(results.length, 0);
        done();
      });
    });

    it('should return consistent results for a small friend graph, forward-only', function(done) {
      suggestions.suggest('Andrew', { forwardOnly: true, forwardConnections: forwardFetcher }, function(err, results) {
        if (err) throw err;

        assert.ok(results);
        assert.equal(results.length, 5);
        assert.equal(results[0].nodeID, 'Pachu');
        assert.equal(results[1].nodeID, 'Chuck');
        assert.equal(results[2].nodeID, 'Stephen');
        assert.equal(results[3].nodeID, 'Rajat');
        assert.equal(results[4].nodeID, 'Lyric');
        done();
      });
    });

    it('should return consistent results for a small friend graph, bi-directional', function(done) {
      suggestions.suggest('Andrew', { forwardConnections: forwardFetcher, reverseConnections: reverseFetcher },
        function(err, results)
      {
        if (err) throw err;

        assert.ok(results);
        assert.equal(results.length, 5);
        assert.equal(results[0].nodeID, 'Chuck');
        assert.equal(results[1].nodeID, 'Stephen');
        assert.equal(results[2].nodeID, 'Pachu');
        assert.equal(results[3].nodeID, 'Rajat');
        assert.equal(results[4].nodeID, 'Lyric');
        done();
      });
    });

    it('should return consistent capped results', function(done) {
      suggestions.suggest('Andrew', { maxResults: 3, forwardConnections: forwardFetcher, reverseConnections: reverseFetcher },
        function(err, results)
      {
        if (err) throw err;

        assert.ok(results);
        assert.equal(results.length, 3);
        assert.equal(results[0].nodeID, 'Chuck');
        assert.equal(results[1].nodeID, 'Stephen');
        assert.equal(results[2].nodeID, 'Pachu');
        done();
      });
    });
  });
});

function emptyFetcher(nodeID, callback) {
  callback(null, []);
}

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
