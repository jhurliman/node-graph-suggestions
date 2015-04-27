var async = require('async');
var MinHeap = require('./minheap');

var DEFAULT_PAGERANK_ITERATIONS = 3;
var DEFAULT_PAGERANK_MAX_RESULTS = 25;
var CONCURRENCY_LIMIT = 10;

exports.suggest = suggest;

/**
 * 
 * @param {String} nodeID Unique identifier for the node in the graph that we
 *        are providing suggestions for, such as a userID.
 * @param {Object} options Supports the following options:
 *  - maxResults {Number} Maximum number of suggestions to return.
 *  - forwardOnly {Boolean} If set to true only forward connections will be
 *      traversed.
 *  - forwardConnections(nodeID, callback) {Function} A required method to
 *      retrieve all of the forward connections from a given node to other
 *      nodes. Example: "users a given user follows". callback takes two
 *      parameters: an error and an array of nodeIDs.
 *  - reverseConnections(nodeID, callback) {Function} An optional method to
 *      retrieve all of the reverse connections to a given node from other
 *      nodes. Example: "followers of a given user". This method is not used if
 *      forwardOnly is set to true.
 * @param {Function} callback(err, scoredNodeIDs) Completion callback. The
 *        second parameter is an array of { nodeID: String, score: Number }
 *        objects.
 */
function suggest(nodeID, options, callback) {
  pageRank(nodeID, options, callback);
}

/**
 * Calculate the approximate personalized pagerank for nodes within vicinity of
 * a given node in the graph.
 */
function pageRank(nodeID, options, callback) {
  options = options || {};
  var maxResults = options.maxResults || DEFAULT_PAGERANK_MAX_RESULTS;
  var iterations = options.iterations || DEFAULT_PAGERANK_ITERATIONS;

  if (typeof options.forwardConnections !== 'function')
    throw new Error('Missing required forwardConnections function');
  if (!options.forwardOnly && typeof options.reverseConnections !== 'function')
    throw new Error('Missing required reverseConnections function');

  // This map holds the probability of landing at each node, up to the 
  // current iteration
  var probs = {};
  probs[nodeID] = 1; // Start at this node

  var helperMethod = options.forwardOnly ? pageRankHelperForwardOnly : pageRankHelper;

  helperMethod(nodeID, probs, iterations, options, function(err, pageRankProbs) {
    if (err) return callback(err, null);

    // Fetch the list of nodes this node is already connected to
    options.forwardConnections(nodeID, function(err, curConnections) {
      if (err) return callback(err, null);

      var curConnectionsMap = {};
      for (var i = 0; i < curConnections.length; i++)
        curConnectionsMap[curConnections[i]] = true;

      // Put the highest ranked entries that are not already connected into a priority queue
      var rankingHeap = new MinHeap(null, sortByScore);
      for (var neighborID in pageRankProbs) {
        if (neighborID === nodeID || curConnectionsMap[neighborID])
          continue;

        var prob = pageRankProbs[neighborID];
        rankingHeap.push({ nodeID: neighborID, score: prob });
        if (rankingHeap.size() > maxResults)
          rankingHeap.pop();
      }

      var entry;
      var ranked = [];
      while ((entry = rankingHeap.pop()))
        ranked.unshift(entry);

      callback(null, ranked);
    });
  });
}

/**
 * Implements the core of the personalized pagerank algorithm.
 */
function pageRankHelper(startID, probs, numIterations, options, callback) {
  if (numIterations <= 0)
    return callback(null, probs);

  var alpha = options.alpha || 0.5;

  // Holds the updated set of probabilities, after this iteration
  var probsPropagated = {};

  // With probability 1 - alpha, we teleport back to the start node
  probsPropagated[startID] = 1 - alpha;

  // Propagate the previous probabilities...
  var workQueue = async.queue(function(nodeID, done) {
    var prob = probs[nodeID];
    var forwards;
    var backwards;

    // Fetch forward and reverse connections for this node
    async.parallel([
        function(done) {
          options.forwardConnections(nodeID, function(err, results) {
            forwards = results;
            done(err);
          });
        },
        function(done) {
          options.reverseConnections(nodeID, function(err, results) {
            backwards = results;
            done(err);
          });
        }
      ],
      function(err) {
        if (err) return callback(err, null);

        // With probability alpha, we move to a connected node...
        // And each node distributes its current probability equally to
        // its neighbors
        var probToPropagate = alpha * prob / (forwards.length + backwards.length);
        var neighbors = forwards.concat(backwards);
        for (var i = 0; i < neighbors.length; i++) {
          var neighborID = neighbors[i];
          if (!probsPropagated[neighborID])
            probsPropagated[neighborID] = 0;
          probsPropagated[neighborID] += probToPropagate;
        }

        done();
      }
    );
  }, CONCURRENCY_LIMIT);

  workQueue.drain = function() {
    pageRankHelper(startID, probsPropagated, numIterations - 1, options, callback);
  };

  for (var nodeID in probs)
    workQueue.push(nodeID);
}

/**
 * Implements the core of the personalized pagerank algorithm, only considering
 * forward connections (ie users that another user follows).
 */
function pageRankHelperForwardOnly(startID, probs, numIterations, options, callback) {
  if (numIterations <= 0)
    return callback(null, probs);

  var alpha = options.alpha || 0.5;

  // Holds the updated set of probabilities, after this iteration
  var probsPropagated = {};

  // With probability 1 - alpha, we teleport back to the start node
  probsPropagated[startID] = 1 - alpha;

  // Propagate the previous probabilities...
  var workQueue = async.queue(function(nodeID, done) {
    var prob = probs[nodeID];

    options.forwardConnections(nodeID, function(err, neighbors) {
      if (err) return callback(err, null);

      // With probability alpha, we move to a connected node...
      // And each node distributes its current probability equally to
      // its neighbors
      var probToPropagate = alpha * prob / neighbors.length;
      for (var i = 0; i < neighbors.length; i++) {
        var neighborID = neighbors[i];
        if (!probsPropagated[neighborID])
          probsPropagated[neighborID] = 0;
        probsPropagated[neighborID] += probToPropagate;
      }

      done();
    });
  }, CONCURRENCY_LIMIT);

  workQueue.drain = function() {
    pageRankHelperForwardOnly(startID, probsPropagated, numIterations - 1,
      options, callback);
  };

  for (var nodeID in probs)
    workQueue.push(nodeID);
}

function sortByScore(a, b) {
  return a.score === b.score ? 0 : a.score < b.score ? -1 : 1;
}
