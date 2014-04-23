/* -*- Mode: Java; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* vim: set shiftwidth=2 tabstop=2 autoindent cindent expandtab: */

'use strict';

/*
var Learner = (function LearnerClosure() {
  var log = getLog('learner');

  function Learner(ports, record, scriptServer, controller) {
    this.ports = ports;
    this.record = record;
    this.scriptServer = scriptServer;
    this.controller = controller;
  }

  var RETRIES = 3;
  var SUCCESSES = 3;

  Learner.prototype = {
    resetParams: function _resetParams() {
      params = jQuery.extend(true, {}, defaultParams);
      this.updateParams();
    },
    updateParams: function _updateParams() {
      this.controller.updateParams();
    },
    getDivergingEvent: function _getDivirgingEvent(replay) {
      var index = this.events.length;

      if (replay.index != replay.events.length)
        index = replay.index;

      var captures = replay.captures;
      var expCaptures = this.captures;
      for (var i = 0, ii = expCaptures.length; i < ii; ++i) {
        var e = expCaptures[i];

        if (i >= captures.length) {
          if (index > e.index)
            index = e.index;
          else
            continue;
        }

        var c = captures[i];

        var eText = e.event.msg.value.target.snapshot.prop.innerText;
        var cText = c.innerText;
        if (eText != cText && index > e.index)
          index = e.index;
      }

      if (index == this.events.length)
        return null;
      return index;
    },
    check: function _check(replay) {
      if (replay.index != replay.events.length)
        return false;

      var captures = replay.captures;
      var expCaptures = this.captures;
      for (var i = 0, ii = expCaptures.length; i < ii; ++i) {
        if (i >= captures.length)
          return false;

        var c = captures[i];
        var e = expCaptures[i];

        var eText = e.event.msg.value.target.snapshot.prop.innerText;
        var cText = c.innerText;
        if (eText != cText)
          return false;
      }
      return true;
    },
    search: function _search(scriptId) {
      this.resetParams();
      params.replaying.eventTimeout = 5;
      this.updateParams();

      this.retrys = 0;
      this.successes = 0;
      this.replays = [];
      this.scriptId = scriptId;
      this.lastIncChange = 0;
      this.lastDecChange = 0;

      var l = this;

      scriptServer.getScript(scriptId, true, function(id, events) {
        l.events = events;
        l.id = id;

        var captures = [];
        for (var i = 0, ii = events.length; i < ii; ++i) {
          var e = events[i];
          if (e.msg.value.type == 'capture') {
            captures.push({index: i, event: e});
          }
        }
        l.captures = captures;

        var searchState = [];
        for (var i = 0, ii = events.length; i < ii; ++i) {
          searchState.push(0);
        }
        l.searchState = searchState;
        l.runScript();
      });
    },
    runScript: function _runScript() {
      var retrys = this.retrys;
      var successes = this.successes;

      var searchState = this.searchState;

      if (retrys == RETRIES) {
        if (successes >= SUCCESSES) {
          if (this.lastIncChange == this.lastDecChange) {
            log.debug('Success:', searchState);
            return;
          }
          this.decrementState();
        } else {
          this.incrementState();
        }

        this.retrys = 0;
        this.successes = 0;
        this.replays = [];
      } else if (retrys - successes > RETRIES - SUCCESSES) {
        this.incrementState();
        this.retrys = 0;
        this.successes = 0;
        this.replays = [];
      }

      var id = this.scriptId;
      var cloneEvents = jQuery.extend(true, [], this.events);
      this.updateEventsState(cloneEvents);

      log.debug('Running script: ', cloneEvents);

      var timeoutId = -1;
      var l = this;

      var r = this.controller.replayScript(id, cloneEvents, function(replay) {
        clearTimeout(timeoutId);
        l.retrys++;
        l.replays.push(replay);
        if (l.check(replay))
          l.successes++;
        l.runScript();
      });

      // kill script after timeout period
      timeoutId = setTimeout(function() {
        r.finish();
      }, params.benchmarking.timeout * 1000);
    },
    updateEventsState: function _updateEventsState(events) {
      var state = this.searchState;
      for (var i = 0, ii = events.length; i < ii; ++i) {
        var e = events[i];
        var eState = state[i];
        if (eState == 0)
          e.waitTime = 0;
      }
    },
    decrementState: function _decrementState() {
      var lastIncChange = this.lastIncChange;
      var state = this.searchState;
      for (var i = lastIncChange + 1, ii = state.length; i < ii; ++i) {
        state[i] = 0;
      }
      this.lastDecChange = this.lastIncChange;
    },
    incrementState: function _incrementState() {
      var replays = this.replays;
      var possibleIndexes = {};
      for (var i = 0, ii = replays.length; i < ii; ++i) {
        var replay = replays[i];
        var index = this.getDivergingEvent(replay);
        if (index != null) {
          if (!(index in possibleIndexes))
            possibleIndexes[index] = 0;
          possibleIndexes[index]++;
        }
      }
      var divIndex = -1;
      var max = 0;
      for (var index in possibleIndexes) {
        var numReplays = possibleIndexes[index];
        if (numReplays > max || (numReplays == max && index < divIndex)) {
          divIndex = index;
          max = numReplays;
        }
      }
      if (divIndex == -1)
        throw "can't find diverging event";

      var state = this.searchState;
      for (var i = divIndex; i >= 0; --i) {
        if (state[i] == 0) {
          state[i] = 1;
          this.lastIncChange = i;
          return;
        }
      }

      throw "can't increase wait";
    }
  };

  return Learner;
})();

function runLearner(id) {
  var l = new Learner(ports, record, scriptServer, controller);
  l.search(id);
}
*/

// find maximum number of deltas that can be applied
var SimpleDebug = (function SimpleDebugClosure() {
  var log = getLog('simpledebug');

  function SimpleDebug(orig, deltas, accumulate, test) {
    this.orig = orig;
    this.deltas = deltas;
    this.accumulate = accumulate;
    this.test = test;
  }

  SimpleDebug.prototype = {
    run: function _run() {
      this.enabled = [];
      this.disabled = [];
      this.index = 0;

      this.runTest();
    },
    runTest: function _runTest() {
      var deltas = this.deltas;
      var index = this.index;
      var required 

      if (index >= deltas.length) {
        log.log('finished minimizing:', this.enabled, this.disabled);
        return;
      }

      var cur = jQuery.extend(true, [], this.orig);
      var delta = deltas[index];
      cur = delta.apply(cur); 

      var enabled = this.enabled;
      if (this.accumulate) {
        for (var i = 0, ii = enabled.length; i < ii; ++i) {
          cur = enabled[i].delta.apply(cur);
        }
      }

      var test = this.test;
      var simpleDebug = this;

      test(cur, function(result, data) {
        var info = {delta: delta,  misc: data};
        if (!result) {
          simpleDebug.disabled.push(info);
        } else {
          simpleDebug.enabled.push(info);
        }
        simpleDebug.index++;
        setTimeout(function() {
          simpleDebug.runTest();
        }, 0);
      });
    }
  }

  return SimpleDebug;
})();

function runScript(id, events, numRuns, timeout, callback) {
  var runs = [];
  function runOnce() {
    if (runs.length < numRuns) {
      var r = controller.replayScript(id, events, function(replay) {
        clearTimeout(timeoutId);

        var run = {
          index: replay.index,
          events: replay.record.events,
          captures: replay.captures
        }
        runs.push(run);

        setTimeout(function() {runOnce();});
      });

      // kill script after timeout period
      var timeoutId = setTimeout(function() {
        r.finish();
      }, timeout);
    } else {
      callback(runs);
    }
  }
  runOnce();
}

function collectCaptures(events) {
  var expCaptures = [];
  for (var i = 0, ii = events.length; i < ii; ++i) {
    var e = events[i];
    if (e.value.data.type == 'capture') {
      expCaptures.push(e);
    }
  }
  return expCaptures;
}

function checkReplaySuccess(captureEvents, events, replay) {
  if (replay.index != events.length) {
    return false;
  }

  var captures = replay.captures;
  for (var i = 0, ii = captureEvents.length; i < ii; ++i) {
    if (i >= captures.length) {
      return false;
    }

    var c = captures[i];
    var e = captureEvents[i];

    var eText = e.value.data.target.snapshot.prop.innerText;
    var cText = c.innerText;
    if (eText != cText) {
      return false;
    }
  }
  return true;
}

function runRemoveEvents(scriptId) {
  params.replaying.eventTimeout = 15;
  params.replaying.defaultUser = true;
  params.panel.enableEdit = false;
  controller.updateParams();

  scriptServer.getScript(scriptId, true, function(id, events) {

    var removeEvents = [];
    for (var i = 0, ii = events.length; i < ii; ++i) {
      var e = events[i];
      if (e.type == 'event') {
        (function() {
          var eventId = e.value.meta.id;
          removeEvents.push({
            id: 'remove event ' + eventId,
            apply: function(origEvents) {
              for (var j = 0, jj = origEvents.length; j < jj; ++j) {
                if (origEvents[j].value.meta.id == eventId) {
                  origEvents.splice(j, 1);
                  break;
                }
              }
              return origEvents;
            }
          });
        })();
      }
    }

    var captureEvents = collectCaptures(events);

    function testScript(scriptEvents, callback) {
      runScript(id, scriptEvents, 1, 300 * 1000, function(replays) {
        var replay = replays[0];
        callback(checkReplaySuccess(captureEvents, scriptEvents, replay),
                 replay);
      });
    }
  
    console.log('trying to remove events:', removeEvents);
    var debug = new SimpleDebug(events, removeEvents, true, testScript);
    debug.run();
  });
}

function runSynthTrigger(scriptId) {
  params.replaying.eventTimeout = 15;
  params.replaying.defaultUser = true;
  params.panel.enableEdit = false;
  controller.updateParams();

  scriptServer.getScript(scriptId, true, function(id, events) {

    var removeEvents = [];
    for (var i = 0, ii = events.length; i < ii; ++i) {
      var e = events[i];
      if (e.type == 'event') {
        (function() {
          var eventId = e.value.meta.id;
          removeEvents.push({
            id: 'remove event ' + eventId,
            apply: function(origEvents) {
              for (var j = 0, jj = origEvents.length; j < jj; ++j) {
                if (origEvents[j].value.meta.id == eventId) {
                  origEvents[j].value.timing.waitTime = 0;
                  break;
                }
              }
              return origEvents;
            }
          });
        })();
      }
    }

    var captureEvents = collectCaptures(events);

    function testScript(scriptEvents, callback) {
      runScript(id, scriptEvents, 1, 300 * 1000, function(replays) {
        var replay = replays[0];
        callback(checkReplaySuccess(captureEvents, scriptEvents, replay),
                 replay);
      });
    }
  
    console.log('trying to remove waits:', removeEvents);
    var debug = new SimpleDebug(events, removeEvents, true, testScript);
    debug.run();
  });
}

