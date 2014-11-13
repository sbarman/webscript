/* -*- Mode: Java; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* vim: set shiftwidth=2 tabstop=2 autoindent cindent expandtab: */

'use strict';

// Save info during learning so we can inspect it later
var learningScript = null;
var learningReplays = [];
var learningTriggers = [];
var learningPassingRuns = [];

function saveReplayInfo() {
  chrome.storage.local.set({
    learningScript: learningScript,
    learningReplays: learningReplays,
    learningTriggers: learningTriggers,
    learningPassingRuns: learningPassingRuns
  });
}

function loadReplayInfo() {
  chrome.storage.local.get(["learningReplays", "learningTriggers",
      "learningScript", "learningPassingRuns"], 
      function(info) {
        learningScript = info.learningScript;
        learningReplays = info.learningReplays;
        learningTriggers = info.learningTriggers;
        learningPassingRuns = info.learningPassingRuns;
      }
  );
}

// check types of events
var userEventTypes = ['dom', 'capture'];
var triggerEventTypes = ['completed'];

function isUserEvent(e) {
  return userEventTypes.indexOf(e.type) >= 0;
}

function isTriggerEvent(e) {
  return triggerEventTypes.indexOf(e.type) >= 0;
}

function isCaptureEvent(e) {
  return e.type == 'capture';
}

function copyEvents(events) {
  return jQuery.extend(true, [], events);
}

// run the script a certain number of times and return the replays
function runScript(events, numRuns, timeout, callback) {
  console.log('Running script:', events, numRuns, timeout);
  function runOnce(runs) {
    if (runs.length < numRuns) {
      var r = controller.replayScript(events, {}, function(replay) {
        clearTimeout(timeoutId);

        // remove any tabs related with the replay, so that web requests don't
        // from these tabs don't show up in future replays
        var events = replay.record.events;
        var allTabs = [];
        for (var i = 0, ii = events.length; i < ii; ++i) {
          var e = events[i];
          var tab = "";
          if (e.frame && e.frame.tab)
            tab = e.frame.tab;
          if (e.data && e.data.tabId)
            tab = e.data.tabId;

          if (tab && allTabs.indexOf(tab) < 0)
            allTabs.push(tab);
        }

        for (var i = 0, ii = allTabs.length; i < ii; ++i) {
          var tabId = parseInt(allTabs[i]);
          if (tabId >= 0)
            chrome.tabs.remove(parseInt(tabId));
        }

        // add run
        runs.push({
          index: replay.index,
          events: $.extend([], events),
          captures: $.extend([], replay.captures)
        });

        return runOnce(runs);
      });

      // kill script after timeout period
      var timeoutId = setTimeout(function() {
        r.finish();
      }, timeout);
    } else {
      console.log('Finished running script:', events, numRuns, timeout);
      return callback(null, runs);
    }
  }
  return runOnce([]);
}

// check if all captures match the original script
function checkReplaySuccess(origEvents, replay) {
  var captureEvents = origEvents.filter(isCaptureEvent);

  console.log('Check replay success:', captureEvents, origEvents, replay);

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


// augment run script so that it only returns passing scripts
function runScriptPassing(events, numRuns, timeout, callback) {
  function runOnce(allRuns) {
    if (allRuns.length < numRuns) {
      runScript(events, 1, timeout, function(err, runs) {
        var run = runs[0];
        if (checkReplaySuccess(events, run)) {
          // add run
          allRuns.push(run);
        }
        return runOnce(allRuns);
      });
    } else {
      return callback(null, allRuns);
    }
  }
  return runOnce([]);
}

/*
function clearUnusedTriggers(events, triggerMapping) {
  return events;
  var triggerEvents = [];
  for (var userEvent in triggerMapping) {
    var triggers = triggerMapping[userEvent];
    for (var i = 0, ii = triggers.length; i < ii; ++i)
      triggerEvents.push(triggers[i]);
  }

  var filteredEvents = [];
  for (var i = 0, ii = events.length; i < ii; ++i) {
    var e = events[i];
    if (userEventTypes.indexOf(e.type) >= 0 || 
        triggerEvents.indexOf(e.meta.id) >= 0) {
      filteredEvents.push(e);
    }
  }
  return filteredEvents;
}
*/

// given a script, modify script so that eventId fires immediately after
// the previous event, add trigger condition if needed
function clearWaits(events, eventId) {
  var lastEventIndex = 0;
  var eventIndex = -1;

  for (var j = 0, jj = events.length; j < jj; ++j) {
    var e = events[j];
    if (e.meta.id == eventId) {
      eventIndex = j;
      break;
    } else if (isUserEvent(e)) {
      lastEventIndex = j;
    }
  }

  for (var j = lastEventIndex + 1; j <= eventIndex; ++j)  
    events[j].timing.waitTime = 0;
  
  return events;
}

function addTriggers(evnt, triggers) {
  if (triggers && triggers.length > 0)
    evnt.timing.triggerCondition = triggers;
}

function getTriggers(evnt) {
  var triggers = evnt.timing.triggerCondition;
  if (triggers)
    return triggers;
  return [];
}

function getPrefix(evnt) {
  var url = evnt.data.url;
  var a = $('<a>', {href:url})[0];
  return a.hostname + a.pathname;
}

function getPotentialTriggers(origEvents, passingRuns) {
  var baseRun = {
    events: origEvents,
    index: 0,
    prefixToTrigger: {}
  };

  var runs = [];
  for (var i = 0, ii = passingRuns.length; i < ii; ++i) {
    var run = passingRuns[i];
    runs.push({
      events: run.events,
      index: 0,
      prefixToTrigger: {}
    });
  }

  var prefixToLastUserEvent = {};
  var triggerMapping = {};
  var userEvents = baseRun.events.filter(isUserEvent);

  for (var i = 0, ii = userEvents.length; i < ii; ++i) {
    var curEvent = userEvents[i];
    var curEventId = curEvent.meta.id;

    // handle base run
    var eventIdx = baseRun.index;
    var events = baseRun.events;
    var prefixToTrigger = baseRun.prefixToTrigger;

    while (events[eventIdx].meta.id != curEventId) {
      if (isTriggerEvent(events[eventIdx])) {
        var e = events[eventIdx];
        var prefix = getPrefix(e);

        if (prefix in prefixToTrigger)
          prefixToTrigger[prefix] = "duplicate";
        else
          prefixToTrigger[prefix] = e.meta.id;
      }
      ++eventIdx;
    }
    baseRun.index = eventIdx;

    // handle runs
    runs.forEach(function(run) {
      var eventIdx = run.index;
      var events = run.events;
      var prefixToTrigger = run.prefixToTrigger;

      // check if current event exists in the replay
      var exists = false;
      for (var j = 0, jj = events.length; j < jj; ++j) {
        if (events[j].meta.recordId == curEventId) {
          exists = true;
          break;
        }
      }
      if (!exists)
        return;

      while (events[eventIdx].meta.recordId != curEventId) {
        if (isTriggerEvent(events[eventIdx])) {
          var e = events[eventIdx];
          var prefix = getPrefix(e);

          if (prefix in prefixToTrigger)
            prefixToTrigger[prefix] = "duplicate";
          else
            prefixToTrigger[prefix] = e.meta.id;
        }
        ++eventIdx;
      }
      run.index = eventIdx;
    });

    // find common triggers
    var prefixToTrigger = baseRun.prefixToTrigger;
    var possibleTriggers = [];
    var prefixesToRemove = [];

    for (var prefix in prefixToTrigger) {
      var triggerEvent = prefixToTrigger[prefix];
      if (triggerEvent != "duplicate") {
        var seenInRuns = true;
        for (var j = 0, jj = runs.length; j < jj; ++j) {
          var runPrefixes = runs[j].prefixToTrigger;
          if (!(prefix in runPrefixes) || 
              runPrefixes[prefix] == "duplicate") {
            seenInRuns = false;
            break;
          }
        }

        // matched across all runs, lets add it as a potential trigger
        if (seenInRuns) {
          var trigger = {eventId: triggerEvent};
          var start = prefixToLastUserEvent[prefix];
          if (start)
            trigger.start = start;

          possibleTriggers.push(trigger);

          prefixesToRemove.push(prefix);
          prefixToLastUserEvent[prefix] = curEventId;
        }
      }
    }
    triggerMapping[curEventId] = possibleTriggers;

    // remove the triggers tha we just added from the bool
    prefixesToRemove.forEach(function(prefix) {
      var prefixToTrigger = baseRun.prefixToTrigger;
      if (prefix in prefixToTrigger)
        delete prefixToTrigger[prefix];

      runs.forEach(function(run) {
        var prefixToTrigger = run.prefixToTrigger;
        if (prefix in prefixToTrigger)
          delete prefixToTrigger[prefix];
      });
    });
  }
  return triggerMapping;
}

function getEvent(events, eventId) {
  for (var i = 0, ii = events.length; i < ii; ++i) {
    if (events[i].meta.id == eventId)
      return events[i];
  }
  return null;
}

/*
// create splits based upon events which are close together
// in time
function splitEventsByTime(events, maxTime) {
  // split original script
  var splits = [];
  var lastUserEvent = null;
  var lastUserIdx = null;

  var startIdx = 0;
  var startEventId;

  for (var i = 0, ii = events.length; i < ii; ++i) {
    var e = events[i];
    if (isUserEvent(e)) {
      if (lastUserEvent && 
         (e.data.timeStamp - lastUserEvent.data.timeStamp > maxTime)) {
        var range = events.slice(startIdx, lastUserIdx);
        splits.push({
          events: range,
          start: startEventId,
          end: lastUserEvent.meta.id
        });

        startIdx = lastUserIdx; 
        startEventId = lastUserEvent.meta.id;
      }

      lastUserEvent = e;
      lastUserIdx = i;
    }
  }

  if (startIdx < events.length) {
    splits.push({
      events: events.slice(startIdx),
      start: startEventId,
      end: null
    });
  }
  return splits;
}

function getMatchingEvents(split, replays) {
  var start = split.start;
  var end = split.end;

  var startIdx = -1;
  var endIdx = -1;

  var replayRegions = replays.map(function(replay) {
    var replayEvents = replay.events;
    
    for (var j = 0, jj = replayEvents.length; j < jj; ++j) {
      var e = replayEvents[j];
      var recordId = e.meta.recordId;
      if (recordId) {
        if (recordId == start)
          startIdx = j;
        else if (recordId == end)
          endIdx = j;
      }
    }
  
    if (!start)
      startIdx = 0;

    if (!end)
      endIdx = replayEvents.length;

    if (startIdx == -1 || endIdx == -1)
      return [];

    return replayEvents.slice(startIdx, endIdx);
  });

  return replayRegions;
}

function mapPossibleTriggerToEvent(events, replays) {
  var splits = splitEventsByTime(events, 1000);
  console.log('Splits:', splits);

  var possibleTriggers = [];

  for (var i = 0, ii = splits.length; i < ii; ++i) {
    var split = splits[i];
    // console.log('Split:', split, getMatchingRegions(split, replays));
    var replayEvents = getMatchingEvents(split, replays);
    var uniqueUrls = replayEvents.map(function(splitEvents) {
      var completed = splitEvents.filter(function(e) {
        return e.type == 'completed';
      });
      var urls = {};
      for (var j = 0, jj = completed.length; j < jj; ++j) {
        var c = completed[j];
        var url = c.data.url;
        var a = $('<a>', {href:url})[0];
        var prefix = a.hostname + a.pathname;

        if (prefix in urls) {
          urls[prefix].events.push(c);
        } else {
          urls[prefix] = {
            events: [c],
            anchor: a
          };
        }
      }
      var uniqueUrl = [];
      for (var prefix in urls) {
        var data = urls[prefix];
        if (data.events.length == 1) {
          uniqueUrl.push({
            event: data.events[0],
            anchor: data.anchor,
            prefix: prefix
          });
        }
      }
      return uniqueUrl;
    });
    // console.log(uniqueUrls);

    // find the intersection of the uniqueUrls
    var triggerUrls = uniqueUrls[0];
    for (var j = 1, jj = uniqueUrls.length; j < jj; ++j) {
      var nextReplayUrls = uniqueUrls[j];
      triggerUrls = triggerUrls.filter(function(url) {
        for (var k = 1, kk = nextReplayUrls.length; k < kk; ++k) {
          var replayUrl = nextReplayUrls[k];
          if (url.prefix == replayUrl.prefix)
            return true;
        }
        return false;
      });
    }

    for (var j = 0, jj = triggerUrls.length; j < jj; ++j) {
      var t = triggerUrls[j];
      var e = t.event;
      possibleTriggers.push({
        start: split.start,
        end: split.end,
        prefix: t.prefix
      });
    }
  }

  console.log(possibleTriggers);

  var mapping = {};
  var completedEvents = [];
  completedEvents.push('nowait');
  var seenEvents = {};

  for (var i = 0, ii = events.length; i < ii; ++i) {
    var e = events[i];
    if (e.type == 'dom' || e.type == 'capture') {
      mapping[e.meta.id] = completedEvents;
      completedEvents = [];
      completedEvents.push('nowait');
    } else if (e.type == 'completed') {
      var a = $('<a>', {href:e.data.url})[0];
      var prefix = a.hostname + a.pathname;

      var triggers = possibleTriggers.filter(function(t) {
        return t.prefix == prefix;
      });

      for (var j = 0, jj = triggers.length; j < jj; ++j) {
        var trigger = triggers[j];
        if ((!trigger.start || seenEvents[trigger.start]) &&
            (!trigger.end || !seenEvents[trigger.end])) {
          completedEvents.push(trigger);
        }
      }
    }
    seenEvents[e.meta.id] = true;
  }
  console.log(mapping);
  return mapping;
}
*/

// main synthesis function
function runSynthWait2(scriptName) {
  // create a unique id for this suite of replays
  var uniqueId = scriptName + ':' + (new Date()).getTime();
  console.log('Running synthesis on:', uniqueId);

  // update the params so things will go faster
  params = jQuery.extend(true, {}, defaultParams);
  params.replay.eventTimeout = 40;
  //params.replay.defaultUser = true;
  // params.replay.timingStrategy = TimingStrategy.SLOWER;
  params.panel.enableEdit = false;
  controller.updateParams();

  scriptServer.getScript(scriptName, function(script) {
    learnTriggers(uniqueId, script);
  });
}

function learnTriggers(uniqueId, script) {
  var learningScript = script;
  var learningReplays = [];
  var learningTriggers = [];
  var learningPassingRuns = [];

  var numInitialRuns = 4;
  var numRuns = 2;
  var timeout = 300 * 1000; // 5 minutes
  var scriptId = script.id;

  var allPassingRuns = [];

  // get passing runs of the script
  scriptServer.saveScript(uniqueId, script.events, scriptId, 'original');
  runScriptPassing(script.events, numInitialRuns, timeout, function(err, runs) {
    learningReplays.push(runs);
    for (var i = 0, ii = runs.length; i < ii; ++i) {
      scriptServer.saveScript(uniqueId, runs[i].events, scriptId,
          'replay, original');
    }

    allPassingRuns = allPassingRuns.concat(runs);
    learnTriggersLoop(runs, script.events, 0);
  });

  function learnTriggersLoop(passingRuns, events, index) {
    // find the next user event
    var userEvent = null;
    var userEventIdx;

    for (var i = index, ii = events.length; i < ii; ++i) {
      if (isUserEvent(events[i])) {
        userEvent = events[i];
        userEventIdx = i;
        break;
      }
    }

    // check if we don't have any more events
    if (!userEvent) {
      console.log('Finished');
      scriptServer.saveScript(uniqueId, events, scriptId, 'final');
      return;
    }

    var userEventId = userEvent.meta.id;
    console.log('Finding triggers for event:', userEventId);

    // mapping between user events and potential trigger events
    // var triggerMapping = getPotentialTriggers(events, passingRuns);
    var triggerMapping = getPotentialTriggers(events, allPassingRuns);
    learningTriggers.push(triggerMapping);

    var potentialTriggers = triggerMapping[userEventId];
    console.log('Found potential triggers:', potentialTriggers);

    // slight hack, if triggerIdx == -1, then we try no trigger
    function testTriggersLoop(triggerIdx) {
      // we gone through all possible triggers
      if (triggerIdx >= potentialTriggers.length) {
        // lets add all possible triggers + timeout
        console.warn('Cannot find working trigger:', userEventId);

        var updatedEvents = copyEvents(events);
        // add all potential triggers to this event, since we could not find a single event
        // addTriggers(getEvent(updatedEvents, userEventId), potentialTriggers);
        // notice that the default timing is not changed
        learnTriggersLoop(passingRuns, updatedEvents, userEventIdx + 1);
        return;
      }

      // make a copy of the events
      var testEvents = copyEvents(events);

      var triggerDesc = "";
      // update script with new trigger, -1 index means that we clear timing
      if (triggerIdx == -1) {
        clearWaits(testEvents, userEventId);

        triggerDesc = "no wait:" + userEventId ;
        console.log('Checking trigger: no wait');
      } else {
        clearWaits(testEvents, userEventId);

        var trigger = potentialTriggers[triggerIdx];
        addTriggers(getEvent(testEvents, userEventId), [trigger]);

        triggerDesc = "trigger: " + trigger.eventId + "->" + userEventId;
        console.log('Checking trigger:', trigger);
      }
      
      scriptServer.saveScript(uniqueId, testEvents, scriptId,
          'original,' + triggerDesc);

      // run script
      runScript(testEvents, numRuns, timeout, function(err, runs) {
        learningReplays.push(runs);

        for (var i = 0, ii = runs.length; i < ii; ++i) {
          var successful = checkReplaySuccess(testEvents, runs[i]);
          scriptServer.saveScript(uniqueId, runs[i].events, scriptId,
              'replay,' + triggerDesc + ',' + successful);
        }

        // check if runs are successful
        var allPassed = true;
        for (var i = 0, ii = runs.length; i < ii; ++i) {
          if (!checkReplaySuccess(testEvents, runs[i])) {
            allPassed = false;
            break;
          }
        }

        if (allPassed) {
          allPassingRuns = allPassingRuns.concat(runs);

          if (userEventId == "event275")
            console.log("here");

          // find all triggers before the current user event
          // var updatedTriggers = getPotentialTriggers(testEvents, runs);
          var updatedTriggers = getPotentialTriggers(testEvents, allPassingRuns);
          var userEvents = testEvents.filter(isUserEvent); 

          var seenTriggers = [];
          var assignedTriggerEvents = [];

          for (var i = 0, ii = userEvents.length; i < ii; ++i) {
            var e = userEvents[i];
            var id = e.meta.id;

            seenTriggers = seenTriggers.concat(updatedTriggers[id]);

            var triggerEventIds = getTriggers(e).map(function(t) {
              return t.eventId;
            });
            assignedTriggerEvents = assignedTriggerEvents.concat(triggerEventIds);

            if (id == userEventId)
              break;
          }

          // remove events that are already assigned
          var unassignedTriggers = seenTriggers.filter(function(t) {
            return assignedTriggerEvents.indexOf(t.eventId) < 0;
          });

          // add remaining triggers to current event
          var updatedEvents = copyEvents(events);
          clearWaits(updatedEvents, userEventId);
          addTriggers(getEvent(updatedEvents, userEventId), unassignedTriggers);
          console.log('Passed. Adding triggers:', userEventId, unassignedTriggers);
          
          learnTriggersLoop(runs, updatedEvents, userEventIdx + 1);
          return;
        } else {
          testTriggersLoop(triggerIdx + 1);
          return;
        }
      });
    }
    testTriggersLoop(-1);
    return;
  }
}

