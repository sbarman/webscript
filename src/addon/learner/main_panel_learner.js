/* -*- Mode: Java; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* vim: set shiftwidth=2 tabstop=2 autoindent cindent expandtab: */

'use strict';

// Save info during learning so we can inspect it later
var learningScript = null;
var learningReplays = [];
var learningTriggers = [];
var learningPassingRuns = [];

// Average reaction time for visual recognition
var reactionTime = 190 // in ms
var saveEvents = true;

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

    var cText = c.trim();
    var eText = e.target.snapshot.prop.innerText.trim();
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

// given a script, modify script so that eventId fires immediately after
// the previous event, add trigger condition if needed
function clearWaits(events, eventId) {
  var lastEventIndex = -1;
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

// set the triggers for an event
function addTriggers(evnt, triggers) {
  if (triggers && triggers.length > 0)
    evnt.timing.triggerCondition = triggers;
}

function clearTriggers(evnt) {
  if ('triggerCondition' in evnt.timing)
    delete evnt.timing.triggerCondition;
}

// get the triggers for an event
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

// get the event with eventId from the sequence of events
function getEvent(events, eventId) {
  for (var i = 0, ii = events.length; i < ii; ++i) {
    if (events[i].meta.id == eventId)
      return events[i];
  }
  return null;
}

// convert an event URL (plus optional post data) to a data structure
function getUrlData(evnt) {
  var uri = new URI(evnt.data.url);
  var data = {};
  data.domain = uri.domain();
  data.path = uri.pathname();
  data.prefix = data.domain + data.path;
  var method = evnt.data.method;
  data.method = method;

  // find parameters if they exist
  if (method == "GET") {
    data.search = uri.search(true);
  } else if (method == "POST") {
    if (evnt.data.requestBody && evnt.data.requestBody.formData) {
      data.search = evnt.data.requestBody.formData;
    }
  }

  if (!data.search) {
    data.search = {};
  }

  return data;
}

// not actually being used now, but potentially can improve accuracy in the
// future
function findUniqueParams(events) {
  // add search params to all completed events
  for (var i = 0, ii = events.length; i < ii; ++i) {
    var e = events[i];
    var type = e.type;
    if (type == 'completed') {
      // add search data to event
      e.processedData = getUrlData(e);
    }
  }

  var completedEvents = events.filter(isCompletedEvent);
  var prefixToEvents = {};

  for (var i = 0, ii = completedEvents.length; i < ii; ++i) {
    var e = completedEvents[i];
    var prefix = e.processedData.prefix;
    if (!(prefix in prefixToEvents)) {
      prefixToEvents = [];
    }
    prefixToEvents[prefix].push(e);
  }

  for (var prefix in prefixToEvents) {
    var events = prefixToEvents[prefix];
    var paramToValues = {};

    // initialize paramToValues
    var e = events[0];
    var search = e.processedData.search;
//    for (var k in search) {
//      paramToValues[

    for (var i = 0, ii = events.length; i < ii; ++i) {
      var e = events[i];
      var search = e.processedData.search;
      for (var k in search) {


      }
    }
  }
}

/* Get the best trigger mapping give the runs that we have seen */
function getPotentialTriggers(origEvents, passingRuns) {
  /* The first run is a bit special, since it defines the order of events */
  var baseRun = {
    events: origEvents,
    index: 0,
    prefixToTrigger: {}
  };

  /* All other runs */
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

  /* Find triggers for each user event (dom and capture events) */
  for (var i = 0, ii = userEvents.length; i < ii; ++i) {
    var curEvent = userEvents[i];
    var curEventId = curEvent.meta.id;

    /* handle base run */
    var eventIdx = baseRun.index;
    var events = baseRun.events;
    var prefixToTrigger = baseRun.prefixToTrigger;

    /* process all triggers until the next user event. for each trigger,
     * find a unique identifier (in this case the prefix of the url), and map
     * that identifier to the trigger event. if multiple triggers have the
     * same identifer, then we ignore all of those triggers. */
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

    /* Repeat the same process for each passing run */
    runs.forEach(function(run) {
      var eventIdx = run.index;
      var events = run.events;
      var prefixToTrigger = run.prefixToTrigger;

      /* check if current event exists in the replay */
      /* not sure why this check exists, since all replays are passing they
       * should all contain all user events */
      var exists = false;
      for (var j = 0, jj = events.length; j < jj; ++j) {
        if (events[j].meta.recordId == curEventId) {
          exists = true;
          break;
        }
      }
      if (!exists) {
        console.error('Missing user event in recording of successful run');
        return;
      }

      /* process triggers until the current user event */
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

    /* find triggers that have been observed across all the runs */
    var prefixToTrigger = baseRun.prefixToTrigger;
    var possibleTriggers = [];
    var prefixesToRemove = [];

    for (var prefix in prefixToTrigger) {
      var triggerEvent = prefixToTrigger[prefix];
      /* ignore duplicates */
      if (triggerEvent != "duplicate") {
        /* check if its seen in all other runs */
        var seenInRuns = true;
        for (var j = 0, jj = runs.length; j < jj; ++j) {
          var runPrefixes = runs[j].prefixToTrigger;
          if (!(prefix in runPrefixes) || 
              runPrefixes[prefix] == "duplicate") {
            seenInRuns = false;
            break;
          }
        }

        /* matched across all runs, lets add it as a potential trigger */
        if (seenInRuns) {
          var trigger = {eventId: triggerEvent};
          /* a unique id for a trigger can be used multiple times, if its for
           * different user events. if so, lets say the trigger must appear
           * after the earlier user event for which it was used. */
          var start = prefixToLastUserEvent[prefix];
          if (start)
            trigger.start = start;

          possibleTriggers.push(trigger);

          prefixesToRemove.push(prefix);
          prefixToLastUserEvent[prefix] = curEventId;
        }
      }
    }
    /* add the mapping from user event to triggers */
    triggerMapping[curEventId] = possibleTriggers;

    /* remove the triggers that we just added from the pool */
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

/* remove any wait times for all the events */
function clearWaitsEvents(events) {
  var userEventIds = events.filter(isUserEvent).map(function(e) {
    return e.meta.id;
  }); 
  userEventIds.forEach(function(id) {
    clearWaits(events, id);
  });
}

/* remove any triggers from these events */
function clearTriggersEvents(events) {
  var userEvents = events.filter(isUserEvent); 

  for (var i = 0, ii = userEvents.length; i < ii; ++i) {
    var e = userEvents[i];
    clearTriggers(e);
  }
}


/* add triggers based upon the passing runs for all the events */
function addTriggersEvents(events, passingRuns) {
  var triggers = getPotentialTriggers(events, passingRuns);
  var userEvents = events.filter(isUserEvent); 

  for (var i = 0, ii = userEvents.length; i < ii; ++i) {
    var e = userEvents[i];
    var id = e.meta.id;
    addTriggers(e, triggers[id]);
  }
} 

function synthesizeTriggersLoop(scriptNames) {
  var ids = [];
  function helper(index) {
    if (index >= scriptNames.length) {
      console.log(ids);
      return;
    }

    synthesizeTriggers(scriptNames[index], function(id) {
      ids.push(id);
      helper(index + 1);
    });
  }
  helper(0);
}


/* Main function to learn triggers by replaying the script */
function synthesizeTriggers(scriptName, callback) {
  /* create a unique id for this suite of replays */
  var uniqueId = scriptName + '-' + (new Date()).toString();
  console.log('Running synthesis on:', uniqueId);

  /* update the params so things will go faster */
  params = jQuery.extend(true, {}, defaultParams);
  params.replay.eventTimeout = 40;
  //params.replay.defaultUser = true;
  // params.replay.timingStrategy = TimingStrategy.SLOWER;
  params.panel.enableEdit = false;
  controller.updateParams();

  scriptServer.getScript(scriptName, function(script) {
    synthesizeTriggers_cont(uniqueId, script, callback);
  });
}

function synthesizeTriggers_cont(uniqueId, script, callback) {
//  var learningScript = script;
//  var learningReplays = [];
//  var learningTriggers = [];
//  var learningPassingRuns = [];

  var numInitialRuns = 2;
  var numRuns = 1;
  var timeout = 300 * 1000; /* 5 minutes */
  var scriptId = script.id;

  var allPassingRuns = [];

  // get a passing run that starts from when the page opens
  runScriptPassing(script.events, 1, timeout, function(err, runs) {
    var events = runs[0].events;
    scriptServer.saveScript(uniqueId, events, scriptId, {}, {}, 
        {state: 'original'});

    var noWaitEvents = copyEvents(events);
    clearWaitsEvents(noWaitEvents);
    scriptServer.saveScript(uniqueId, noWaitEvents, scriptId, {}, {},
        {state: 'original-nowait'});

    var triggerEvents = copyEvents(events);
    clearWaitsEvents(triggerEvents);
    addTriggersEvents(triggerEvents, allPassingRuns);
    scriptServer.saveScript(uniqueId, triggerEvents, scriptId, {}, {},
        {state: 'original-triggers'});

    getPassingRuns(events);
  });

  // get passing runs of the script
  function getPassingRuns(events) {
    runScriptPassing(events, numInitialRuns, timeout, function(err, runs) {
      // learningReplays.push(runs);
      for (var i = 0, ii = runs.length; i < ii; ++i) {
        var runEvents = saveEvents ? runs[i].events : [];
        scriptServer.saveScript(uniqueId, runEvents, scriptId, {}, {},
            {state: 'original', replay: true, run: i});
      }

      allPassingRuns = allPassingRuns.concat(runs);

      var triggerEvents = copyEvents(events);
      clearWaitsEvents(triggerEvents);
      addTriggersEvents(triggerEvents, allPassingRuns);
      scriptServer.saveScript(uniqueId, triggerEvents, scriptId, {}, {},
          {state: 'initial-triggers'});

      setTimeout(function() {
        perturbScriptLoop(events, 0, callback);
      }, 0);
    });
  }



  function perturbScriptLoop(events, index) {
    /* find the next user event after a certain time. since there's no point
     * to perturb a sequence of events that happen rapidly together */
    var userEvents = [];
    var userEventIdxStart;
    var userEventIdxEnd;

    /* want to find a set of user events such that there adjacent events occur
     * within some amount of time of each other */
    for (var i = index, ii = events.length; i < ii; ++i) {
      var e = events[i];

      /* found a user event */
      if (isUserEvent(e)) {
        userEvents.push(e);
        userEventIdxStart = i;
        userEventIdxEnd = i;

        /* time since last user event in userEvents */
        var wait = 0;
        for (var j = i + 1, jj = events.length; j < jj; ++j) {
          var e2 = events[j];
          wait += e2.timing.waitTime;

          if (wait > reactionTime)
            break;

          if (isUserEvent(e2)) {
            userEvents.push(e2);
            userEventIdxEnd = j;
            wait = 0;
          }
        };
        break;
      }
    }

    /* check if we don't have any more events */
    if (userEvents.length == 0) {
      console.log('Finished');
      scriptServer.saveScript(uniqueId, events, scriptId, {}, {}, 
          {state: 'final'});

      var finalTriggerEvents = copyEvents(events);
      clearTriggersEvents(finalTriggerEvents);
      addTriggersEvents(finalTriggerEvents, allPassingRuns);
      scriptServer.saveScript(uniqueId, finalTriggerEvents, scriptId, {}, {},
          {state: 'final-triggers'});

      if (callback)
        callback(uniqueId);
      return;
    }

    var userEventIds = userEvents.map(function(e) {return e.meta.id;});
    console.log('Finding triggers for event:', userEventIds);

    // mapping between user events and potential trigger events
    var triggerMapping = getPotentialTriggers(events, allPassingRuns);
    // learningTriggers.push(triggerMapping);

    var potentialTriggers = [];
    
    for (var i = 0, ii = userEventIds; i < ii; ++i) {
      var id = userEventIds[i];
      var triggers = triggerMapping[id];
      potentialTriggers = potentialTriggers.concat(triggers.map(function(t) {
        return {id: id, trigger: t};
      }));
    } 
    console.log('Found potential triggers:', potentialTriggers);

    /* slight hack, if triggerIdx == -1, then we try no trigger */
    function testTriggersLoop(triggerIdx) {
      /* we gone through all possible triggers */
      if (triggerIdx >= potentialTriggers.length) {
        /* lets add all possible triggers + timeout */
        console.warn('Cannot find working trigger:', userEventIds);

        /* add all potential triggers to this event, since we could not find a
         * single event, notice that the default timing is not changed */
        var updatedEvents = copyEvents(events);
        for (var i = 0, ii = potentialTriggers.length; i < ii; ++i) {
          var t = potentialTriggers[i];
          addTriggers(getEvent(updatedEvents, t.id), t.trigger);
        }
        setTimeout(function() {
          perturbScriptLoop(updatedEvents, userEventIdxEnd + 1);
        }, 0);
        return;
      }

      /* make a copy of the events */
      var testEvents = copyEvents(events);

      userEventIds.forEach(function(id) {
        clearWaits(testEvents, id);
      });
      var triggerDesc = {};
      /* update script with new trigger, -1 index means that we clear timing */
      if (triggerIdx == -1) {
        triggerDesc = {event: userEventIds, trigger: "nowait"} ;
        console.log('Checking trigger: no wait');
      } else {
        var t = potentialTriggers[triggerIdx];
        addTriggers(getEvent(testEvents, t.id), [t.trigger]);

        triggerDesc = {event: t.id, trigger: t.trigger.eventId} ;
        console.log('Checking trigger:', t);
      }
      
      scriptServer.saveScript(uniqueId, testEvents, scriptId, {}, {},
          {state: 'perturb', trigger: triggerDesc});

      /* run script */
      runScript(testEvents, numRuns, timeout, function(err, runs) {
        // learningReplays.push(runs);

        for (var i = 0, ii = runs.length; i < ii; ++i) {
          var success = checkReplaySuccess(testEvents, runs[i]);
          var runEvents = saveEvents ? runs[i].events : [];
          scriptServer.saveScript(uniqueId, runEvents, scriptId, {}, {},
              {state: 'perturb', replay: true, run: i, trigger: triggerDesc,
               success: success});
        }

        /* check if runs are successful */
        var allPassed = true;
        for (var i = 0, ii = runs.length; i < ii; ++i) {
          if (!checkReplaySuccess(testEvents, runs[i])) {
            allPassed = false;
            break;
          }
        }

        /* if all runs are successful, then lets assign triggers to the 
         * current event */
        if (allPassed) {
          allPassingRuns = allPassingRuns.concat(runs);
          var updatedTriggers = getPotentialTriggers(testEvents,
              allPassingRuns);

          var updatedEvents = copyEvents(events);

          for (var i = 0, ii = userEventIds.length; i < ii; ++i) {
            var userEventId = userEventIds[i];
            var allUserEvents = updatedEvents.filter(isUserEvent); 

            /* collect all potential triggers up until the current event */
            var allTriggers = [];
            /* find all triggers that are already assigned */
            var assignedTriggers = [];

            for (var j = 0, jj = allUserEvents.length; j < jj; ++j) {
              var e = allUserEvents[j];
              var id = e.meta.id;

              allTriggers = allTriggers.concat(updatedTriggers[id]);

              var triggerEventIds = getTriggers(e).map(function(t) {
                return t.eventId;
              });
              assignedTriggers = assignedTriggers.concat(triggerEventIds);

              /* break when we hit the current event */
              if (id == userEventId)
                break;
            }

            /* remove triggers that are already assigned */
            var unassignedTriggers = allTriggers.filter(function(t) {
              return assignedTriggers.indexOf(t.eventId) < 0;
            });

            /* add remaining triggers to current event */
            clearWaits(updatedEvents, userEventId);
            addTriggers(getEvent(updatedEvents, userEventId),
                unassignedTriggers);
            console.log('Passed. Adding triggers:', userEventId,
                unassignedTriggers);
          }
          
          setTimeout(function() {
            perturbScriptLoop(updatedEvents, userEventIdxEnd + 1);
          }, 0);
          return;
        /* continue trying to perturb the execution with a different trigger */
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

