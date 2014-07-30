/* -*- Mode: Java; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* vim: set shiftwidth=2 tabstop=2 autoindent cindent expandtab: */

'use strict';


// find maximum number of deltas that can be applied
var SimpleDebug = (function SimpleDebugClosure() {
  var log = getLog('simpledebug');

  function SimpleDebug(orig, deltas, grouped, accumulate, test, callback) {
    this.orig = orig;
    this.deltas = deltas;
    this.grouped = grouped;
    this.accumulate = accumulate;
    this.test = test;
    this.callback = callback;
  }

  SimpleDebug.prototype = {
    run: function _run() {
      this.enabled = [];
      this.disabled = [];

      if (this.grouped) {
        this.index = [0, 0];
      } else {
        this.index = 0;
      }

      this.runTest();
    },
    runTest: function _runTest() {
      if (this.isFinished()) {
        log.log('finished minimizing:', this.enabled, this.disabled);
        var finished = jQuery.extend(true, [], this.orig);
        var enabled = this.enabled;
        for (var i = 0, ii = enabled.length; i < ii; ++i) {
          finished = enabled[i].delta.apply(finished);
        }
        this.finished = finished;
        if (this.callback)
          this.callback(this);
        return;
      }

      var cur = jQuery.extend(true, [], this.orig);
      var delta = this.getNextDelta();
      cur = delta.apply(cur);

      var enabled = this.enabled;
      if (this.accumulate) {
        for (var i = 0, ii = enabled.length; i < ii; ++i) {
          cur = enabled[i].delta.apply(cur);
        }
      }

      var test = this.test;
      var simpleDebug = this;

      test(cur, enabled, delta, function(result, data) {
        var info = {delta: delta, misc: data};
        if (!result) {
          simpleDebug.disabled.push(info);
        } else {
          simpleDebug.enabled.push(info);
        }
        simpleDebug.incrementIndex(result);
        setTimeout(function() {
          simpleDebug.runTest();
        }, 0);
      });
    },
    incrementIndex: function _incrementIndex(curDeltaSuccess) {
      if (this.grouped) {
        var index = this.index;
        var idxGroup = index[0];
        var idxDelta = index[1];

        var deltas = this.deltas;
        var deltaGroup = deltas[idxGroup];

        if (!curDeltaSuccess && idxDelta + 1 < deltaGroup.length) {
          index[1]++;
        } else {
          index[0]++;
          index[1] = 0;
        }
      } else {
        this.index++;
      }
    },
    getNextDelta: function _getNextDelta() {
      var deltas = this.deltas;
      var index = this.index;

      if (this.grouped) {
        return deltas[index[0]][index[1]];
      } else {
        return deltas[index];
      }
    },
    isFinished: function _isFinished() {
      var deltas = this.deltas;
      var index = this.index;
      var grouped = this.grouped;

      if (grouped) {
        return grouped && index[0] >= deltas.length;
      } else {
       return !grouped && index >= deltas.length;
      }
    }
  };

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
        };
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
    if (e.type == 'capture') {
      expCaptures.push(e);
    }
  }
  return expCaptures;
}

function checkReplaySuccess(captureEvents, events, replay) {
  // if (replay.index != events.length) {
  //   return false;
  // }

  var captures = replay.captures;
  for (var i = 0, ii = captureEvents.length; i < ii; ++i) {
    if (i >= captures.length) {
      return false;
    }

    var c = captures[i];
    var e = captureEvents[i];

    var eText = e.target.snapshot.prop.innerText;
    var cText = c.innerText;
    if (eText != cText) {
      return false;
    }
  }
  return true;
}

// function saveScript(scriptName, debug) {
//   var finalEvents = debug.finished;
//   scriptServer.saveScript(scriptName, finalEvents, params, null);
// }

// function runRemoveEvents(scriptName) {
//   params.replay.eventTimeout = 40;
//   params.replay.defaultUser = true;
//   params.panel.enableEdit = false;
//   controller.updateParams();
// 
//   scriptServer.getScript(scriptName, function(id, events) {
// 
//     var removeEvents = [];
//     for (var i = 0, ii = events.length; i < ii; ++i) {
//       var e = events[i];
//       if (e.type == 'dom') {
//         (function() {
//           var eventId = e.value.meta.id;
//           removeEvents.push({
//             id: 'remove event:' + eventId,
//             apply: function(origEvents) {
//               for (var j = 0, jj = origEvents.length; j < jj; ++j) {
//                 if (origEvents[j].value.meta.id == eventId) {
//                   origEvents.splice(j, 1);
//                   break;
//                 }
//               }
//               return origEvents;
//             }
//           });
//         })();
//       }
//     }
// 
//     var captureEvents = collectCaptures(events);
// 
//     function testScript(scriptEvents, callback) {
//       runScript(id, scriptEvents, 1, 300 * 1000, function(replays) {
//         var replay = replays[0];
//         callback(checkReplaySuccess(captureEvents, scriptEvents, replay),
//                  replay);
//       });
//     }
// 
//     console.log('trying to remove events:', removeEvents);
//     var debug = new SimpleDebug(events, removeEvents, false, true, testScript,
//         function(finalEvents) {
//           saveScript(scriptName + '_remove', finalEvents);
//         });
//     debug.run();
//   });
// }
// 
// function runMinWait(scriptName) {
//   params.replay.eventTimeout = 15;
//   params.replay.defaultUser = true;
//   params.panel.enableEdit = false;
//   controller.updateParams();
// 
//   scriptServer.getScript(scriptName, function(id, events) {
// 
//     var removeWaits = [];
//     for (var i = 0, ii = events.length; i < ii; ++i) {
//       var e = events[i];
//       if (e.type == 'dom') {
//         (function() {
//           var eventId = e.value.meta.id;
//           var origWait = e.value.timing.waitTime;
//           removeWaits.push({
//             id: 'remove wait:' + eventId + ',' + origWait,
//             apply: function(origEvents) {
//               for (var j = 0, jj = origEvents.length; j < jj; ++j) {
//                 if (origEvents[j].value.meta.id == eventId) {
//                   origEvents[j].value.timing.waitTime = 0;
//                   break;
//                 }
//               }
//               return origEvents;
//             }
//           });
//         })();
//       }
//     }
// 
//     var captureEvents = collectCaptures(events);
// 
//     function testScript(scriptEvents, callback) {
//       runScript(id, scriptEvents, 1, 300 * 1000, function(replays) {
//         /*
//         var replay = replays[0];
//         callback(checkReplaySuccess(captureEvents, scriptEvents, replay),
//                  replay);
//         */
//         for (var i = 0, ii = replays.length; i < ii; ++i) {
//           if (!checkReplaySuccess(captureEvents, scriptEvents, replay[i])) {
//             callback(false);
//           }
//         }
//         callback(true);
//       });
//     }
// 
//     console.log('trying to remove waits:', removeWaits);
//     var debug = new SimpleDebug(events, removeWaits, false, true, testScript,
//         function(debug) {
//           saveScript(scriptName + '_waits', debug);
//         });
//     debug.run();
//   });
// }

function runSynthWait(scriptName) {
  var uniqueId = scriptName + ':' + (new Date()).getTime();

  params = jQuery.extend(true, {}, defaultParams);
  params.replay.eventTimeout = 40;
  //params.replay.defaultUser = true;
  params.replay.timingStrategy = TimingStrategy.SLOWER;
  params.panel.enableEdit = false;
  controller.updateParams();

  scriptServer.getScript(scriptName, function(item) {
    var scriptId = item.id;
    var events =  item.events;

    runScript(null, events, 2, 300 * 1000, function(replays) {

      for (var i = 0, ii = replays.length; i < ii; ++i) {
        var r = replays[i];
        scriptServer.saveScript(uniqueId, r.events, scriptId, 'testing');
      }

      var triggers = mapPossibleTriggerToEvent(events, replays);
      console.log(triggers);

      var triggerChanges = [];
      for (var i = 0, ii = events.length; i < ii; ++i) {
        var e = events[i];
        var id = e.meta.id;
        if (id in triggers) {
          var eventTriggers = triggers[id];
          var triggerGroup = [];
          for (var j = 0, jj = eventTriggers.length; j < jj; ++j) {
            var triggerEvent = eventTriggers[j];
            if (triggerEvent != 'nowait') {
              (function() {
                var eventId = id;
                var triggerEventId = triggerEvent;
                triggerGroup.push({
                  id: 'add wait:' + eventId + ',' + triggerEventId,
                  apply: function(origEvents) {
                    for (var j = 0, jj = origEvents.length; j < jj; ++j) {
                      if (origEvents[j].meta.id == eventId) {
                        origEvents[j].timing.waitEvent = triggerEventId;
                        origEvents[j].timing.waitTime = 0;
                        break;
                      }
                    }
                    return origEvents;
                  }
                });
              })();
            } else {
              (function() {
                var eventId = id;
                triggerGroup.push({
                  id: 'remove wait:' + eventId,
                  apply: function(origEvents) {
                    for (var j = 0, jj = origEvents.length; j < jj; ++j) {
                      if (origEvents[j].meta.id == eventId) {
                        origEvents[j].timing.waitTime = 0;
                        break;
                      }
                    }
                    return origEvents;
                  }
                });
              })();
            }
          }
          triggerChanges.push(triggerGroup);
        }
      }

      // test whether the modified script still passes
      var captureEvents = collectCaptures(events);
      function testScript(modifiedEvents, enabled, delta, callback) {
        // lets make it replay a bit harder
        // params.replay.defaultWaitNewTab = 100;
        // params.replay.targetTimeout = 1;
        controller.updateParams();

        scriptServer.saveScript(uniqueId + ':' + delta.id, modifiedEvents, scriptId, 'original');

        runScript(null, modifiedEvents, 2, 300 * 1000,
            function(replays) {
              var passed = true;

              for (var i = 0, ii = replays.length; i < ii; ++i) {
                var r = replays[i];
                var pass = checkReplaySuccess(captureEvents, modifiedEvents, r);

                scriptServer.saveScript(uniqueId + ':' + delta.id, r.events, scriptId, 'test:' + pass);
                passed = passed && pass;
              }
              callback(passed);
            });
      }

      console.log('trying to synthesize waits:');
      var debug = new SimpleDebug(events, triggerChanges, true, true, testScript,
          function(debug) {
            console.log(debug);
            scriptServer.saveScript(uniqueId + ':final', debug.finished, scriptId, 'trigger synthesized');
          });
      debug.run();
    });
  });
}

function getCompletedUrls(replay) {
  var events = replay.events;
  var completed = events.filter(function(e) {return e.type == 'completed'});
  return completed.map(function(e) {return e.data.url});
}

function getPossibleTriggerUrls(replays) {
  var urlLists = replays.map(getCompletedUrls);
  var intersectList = urlLists[0];
  for (var i = 1, ii = urlLists.length; i < ii; ++i) {
    var l = urlLists[i];
    intersectList = intersectList.filter(function(url) {
      return l.indexOf(url) != -1;
    });
  }
  return intersectList;
}

function mapPossibleTriggerToEvent(orig, replays) {
  var triggerUrls = getPossibleTriggerUrls(replays);

  var mapping = {};
  var completedEvents = [];
  completedEvents.push('nowait');

  for (var i = 0, ii = orig.length; i < ii; ++i) {
    var e = orig[i];
    if (e.type == 'dom' || e.type == 'capture') {
      mapping[e.meta.id] = completedEvents;
      completedEvents = [];
      completedEvents.push('nowait');
    } else if (e.type == 'completed') {
      if (triggerUrls.indexOf(e.data.url) != -1) {
        completedEvents.push(e.meta.id);
      }
    }
  }
  return mapping;
}
