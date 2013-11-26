/* -*- Mode: Java; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* vim: set shiftwidth=2 tabstop=2 autoindent cindent expandtab: */

'use strict';

var port; // port variable to send msgs to content script
var annotationEvents = {}; // current annotation events used during replay

// closure so global scope won't get dirty
(function() {

// global variables
var recording = RecordState.STOPPED;
var id = 'setme';

// record variables
var pageEventId = 0; // counter to give each event on page a unique id
var lastRecordEvent; // last event recorded
var lastRecordSnapshot; // snapshot (before and after) for last event
var curRecordSnapshot; // snapshot (before and after) the current event

// replay variables
var lastReplayEvent; // last event replayed
var lastReplaySnapshot; // snapshop taken before the event is replayed
var curReplaySnapshot; // snapshot taken before the next event is replayed
var dispatchingEvent = false;
var retryTimeout = null;
var portEvents = null;
var portEventsIdx = 0;
var timeoutInfo = {startTime: 0, startIndex: 0, request: null};

// loggers
var log = getLog('content');
var recordLog = getLog('record');
var replayLog = getLog('replay');

// ***************************************************************************
// Recording code
// ***************************************************************************

// return the type of an event, which is used to init and dispatch it
function getEventType(type) {
  for (var eventType in params.events) {
    var eventTypes = params.events[eventType];
    for (var e in eventTypes) {
      if (e == type) {
        return eventType;
      }
    }
  }
  return null;
};

// return the default event properties for an event
function getEventProps(type) {
  var eventType = getEventType(type);
  return params.defaultProps[eventType];
}

function getMatchingEvent(eventData) {
  if (!dispatchingEvent)
    return null;

  if (portEventsIdx == null || portEventsIdx >= portEvents.length)
    return null;

  var eventObject = portEvents[portEventsIdx];
  var eventRecord = eventObject.msg.value;
  if (eventRecord.type == eventData.type) {
    portEventsIdx++;
    return eventObject;
  }

  return null;
}

// create an event record given the data from the event handler
function recordEvent(eventData) {
  var eventMessage;

  // check if we are stopped, then just return
  if (recording == RecordState.STOPPED)
    return true;

  var type = eventData.type;
  var dispatchType = getEventType(type);

  var shouldRecord = params.events[dispatchType][type];

  // cancel the affects of events which are not extension generated or are not
  // picked up by the recorder
  if (recording == RecordState.REPLAYING && !dispatchingEvent &&
      params.replaying.cancelUnknownEvents) {
    recordLog.debug('[' + id + '] cancel unknown event during replay:',
         type, dispatchType, eventData);
    eventData.stopImmediatePropagation();
    eventData.preventDefault();
    return false;
  }
  
  if (recording == RecordState.RECORDING && 
      params.recording.cancelUnrecordedEvents && !shouldRecord) {
    recordLog.debug('[' + id + '] cancel unrecorded event:', type, dispatchType,
                  eventData);
    eventData.stopImmediatePropagation();
    eventData.preventDefault();
    return false;
  }

  // if we are not recording this type of event, we should exit
  if (!shouldRecord)
    return true;

  // continue recording the event
  recordLog.debug('[' + id + '] process event:', type, dispatchType,
                eventData);

  var properties = getEventProps(type);
  var target = eventData.target;
  var nodeName = target.nodeName.toLowerCase();
      
  eventMessage = {};

  // deal with all the replay mess that we can't do in simulate
  if (recording == RecordState.REPLAYING) {
    addBenchmarkLog('recorded: ' + type);

    var replayEvent = getMatchingEvent(eventData);
    if (replayEvent) {
      eventMessage.recordId = replayEvent.id;

      replayEvent.replayed = true;
      replayEvent = replayEvent.msg.value;

      snapshotReplay(target);

      // make sure the deltas from the last event actually happened
      if (params.synthesis.enabled && lastReplayEvent) {
        var recordDeltas = lastReplayEvent.deltas;
        if (typeof recordDeltas == 'undefined') {
          recordLog.error('no deltas found for last event:', lastReplayEvent);
          recordDeltas = [];
        }

        // make sure replay matches recording
        if (lastReplaySnapshot) {
          var replayDeltas = getDeltas(lastReplaySnapshot.before,
                                       lastReplaySnapshot.after);
          // check if these deltas match the last simulated event
          // and correct for unmatched deltas
          fixDeltas(recordDeltas, replayDeltas, lastReplayEvent,
                     lastReplaySnapshot.after);
        }

        //annotation events may have changed the effects of the last event
        //have to make sure that anything associated with this event isn't
        //from annotation events of last event
        resnapshotBefore(target);
      }
      lastReplayEvent = replayEvent;
    }
  }

  // deal with snapshotting the DOM, calculating the deltas, and sending
  // updates
  updateDeltas(target);

  eventMessage['target'] = saveTargetInfo(target, recording);
  eventMessage['URL'] = document.URL;
  eventMessage['dispatchType'] = dispatchType;
  eventMessage['nodeName'] = nodeName;
  eventMessage['pageEventId'] = pageEventId++;
  eventMessage['recordState'] = recording;

  // record all properties of the event object
  if (params.recording.allEventProps) {
    for (var prop in eventData) {
      try {
        var data = eventData[prop];
        var type = typeof(data);
        if (type == 'number' || type == 'boolean' || type == 'string' ||
            type == 'undefined') {
          eventMessage[prop] = eventData[prop];
        } else if (prop == 'relatedTarget' && isElement(data)) {
          eventMessage[prop] = saveTargetInfo(data, recording);
        }
      } catch (e) {
        recordLog.error('[' + id + '] error recording property:', prop, e);
      }
    }
  // only record the default event properties
  } else {
    for (var prop in properties) {
      if (prop in eventData)
        eventMessage[prop] = eventData[prop];
    }
  }

  // record the actual character, instead of just the charCode
  if (eventMessage['charCode'])
    eventMessage['char'] = String.fromCharCode(eventMessage['charCode']);

  // save the event record
  recordLog.debug('[' + id + '] saving event message:', eventMessage);
  port.postMessage({type: 'event', value: eventMessage, state: recording});

  lastRecordEvent = eventMessage;

  // just spin for some number of seconds to delay the page compared
  // to some server
  if (recording == RecordState.RECORDING && params.recording.delayEvents) {
    var curTime = new Date().getTime();
    var endTime = curTime + params.recording.delay;
    while (curTime < endTime)
      curTime = new Date().getTime();
  }

  setTimeout(function() {
    var update = {
      type: 'updateEvent',
      value: {
        'endEventId': lastRecordEvent.pageEventId,
        'pageEventId': eventMessage.pageEventId,
        'recording': recording
      },
      state: recording
    };
    port.postMessage(update);
  }, 0);


  // TODO: special case with mouseover, need to return false
  return true;
};

function resetRecord() {
  lastRecordEvent = null;
  lastRecordSnapshot = null;
  curRecordSnapshot = null;
}

function snapshotRecord(target) {
  if (params.localSnapshot) {
    lastRecordSnapshot = curRecordSnapshot;
    if (lastRecordSnapshot)
      lastRecordSnapshot.after = snapshotNode(lastRecordSnapshot.target);

    curRecordSnapshot = {before: snapshotNode(target), target: target};
  } else {
    var curSnapshot = snapshot();

    lastRecordSnapshot = curRecordSnapshot;
    if (lastRecordSnapshot)
      lastRecordSnapshot.after = curSnapshot;

    curRecordSnapshot = {before: curSnapshot};
  }
}

function updateDeltas(target) {
  snapshotRecord(target);

  if (lastRecordEvent && lastRecordSnapshot) {
    var deltas = getDeltas(lastRecordSnapshot.before,
                           lastRecordSnapshot.after);
    lastRecordEvent.deltas = deltas;
    var update = {
      type: 'updateEvent',
      value: {
        'deltas': deltas,
        'nodeSnapshot': snapshotNode(lastRecordSnapshot.target),
        'pageEventId': lastRecordEvent.pageEventId,
        'recording': recording
      },
      state: recording
    };
    port.postMessage(update);
  }
}

// ***************************************************************************
// Capture code
// ***************************************************************************

var domOutline = DomOutline({
    borderWidth: 2,
    onClick: captureNodeReply
  }
);

function captureNode() {
  if (recording == RecordState.RECORDING) {
    log.log('starting node capture');
    recording = RecordState.STOPPED;
    domOutline.start();
  }
}

function cancelCaptureNode() {
  recording = RecordState.RECORDING;
  domOutline.stop();
}

function captureNodeReply(target) {
  recording = RecordState.RECORDING;

  var eventMessage = {};
  eventMessage['type'] = 'capture';
  eventMessage['target'] = saveTargetInfo(target, recording);
  eventMessage['URL'] = document.URL;
  eventMessage['nodeName'] = target.nodeName.toLowerCase();
  eventMessage['timeStamp'] = new Date().getTime();
  eventMessage['recordState'] = recording;

  log.log('capturing:', target, eventMessage);
  port.postMessage({type: 'event', value: eventMessage, state: recording});
}

// ***************************************************************************
// Replaying code
// ***************************************************************************

function setPortEvents(events) {
  portEvents = events;
}

function getPortEventIndex(id) {
  for (var i = 0, ii = portEvents.length; i < ii; ++i) {
    var e = portEvents[i];
    if (e.id == id) {
      return i;
    }
  }
  return -1;
}

// needed since some event properties are marked as read only
function setEventProp(e, prop, value) {
  Object.defineProperty(e, prop, {value: value});
  if (e.prop != value) {
    Object.defineProperty(e, prop, {get: function() {value}});
    Object.defineProperty(e, prop, {value: value});
  }
}

function checkTimeout(request, startIndex) {
  var timeout = params.replaying.targetTimeout;
  if (timeout != null && timeout > 0) {
    var curTime = new Date().getTime();

    // we havent changed event
    if (timeoutInfo.request == request &&
        timeoutInfo.startIndex == startIndex) {
      if (curTime - timeoutInfo.startTime > timeout * 1000)
        return true;
    } else {
      timeoutInfo = {startTime: curTime, startIndex: startIndex, 
                     request:request};
    }
  }
  return false;
}

// replay an event from an event message
function simulate(request, startIndex) {
  // since we are simulating new events, lets clear out any retries 
  clearRetry();

  var events = request.value;
  for (var i = startIndex, ii = events.length; i < ii; ++i) {
    var eventRecord = events[i];
    var msg = eventRecord.msg;
    var id = eventRecord.id;
    var eventData = msg.value;
    var eventName = eventData.type;

    portEventsIdx = getPortEventIndex(id);

    // this event was detected by the recorder, so lets skip it
    if (params.replaying.cascadeCheck && portEvents[portEventsIdx].replayed) {
      // port.postMessage({type: 'ack', value: true});
      continue;
    }

    replayLog.debug('simulating:', eventName, eventData);
    addBenchmarkLog('simulating: ' + eventName);
/*
    if (eventName == 'wait') {
      replayLog.debug('checking wait:', eventData);
      var result = eval(eventData.condition);
      port.postMessage({type: 'ack', value: result});
      return;
    } else if (eventName == 'custom') {
      var script = eval(eventData.script);
      script(element, eventData);
      return;
    }
*/

    var targetInfo = eventData.target;
    var target = getTarget(targetInfo);
    if (params.benchmarking.targetInfo) {
      var actualTargets = getTargetFunction(targetInfo);
      addBenchmarkLog('num targets: ' + actualTargets.length);

      for (var strategy in targetFunctions) {
        var strategyTargets = targetFunctions[strategy](targetInfo);
        var common = actualTargets.filter(function(t) {
          return strategyTargets.indexOf(t) != -1;
        });
        addBenchmarkLog('comparison: ' + strategy + ',' + 
                        strategyTargets.length + ',' + common.length);
      }
    }

    // lets try to dispatch this event a little bit in the future, in case the
    // future in the case the page needs to change
    if (!target) {
      if (eventName != 'capture' && checkTimeout(request, i)) {
        replayLog.log('timeout finding target, skip event: ', request, i);
        // we timed out with this target, so lets skip the event
        i++;
      }

      setRetry(request, i, params.replaying.defaultWait);
      port.postMessage({type: 'debug', value: 'no target found'});
      return;
    }
    
    if (params.replaying.highlightTarget) {
      highlightNode(target, 100);
    }

    if (eventName == 'capture') {
      replayLog.log('found capture node:', target);

      var msg = {innerHtml: target.innerHTML,
                 innerText: target.innerText,
                 nodeName: target.nodeName.toLowerCase()}

      port.postMessage({type: 'saveCapture', value: msg});
      continue;
    }

    var eventType = getEventType(eventName);
    var defaultProperties = getEventProps(eventName);

    if (!eventType) {
      replayLog.error("can't find event type ", eventName);
      return;
    }

    var options = jQuery.extend({}, defaultProperties, eventData);

    var oEvent = document.createEvent(eventType);
    if (eventType == 'Event') {
      oEvent.initEvent(eventName, options.bubbles, options.cancelable);
    } else if (eventType == 'FocusEvent') {
      var relatedTarget = null;
    
      if (eventData.relatedTarget)
        relatedTarget = getTarget(eventData.relatedTarget); 
     
      oEvent.initUIEvent(eventName, options.bubbles, options.cancelable,
          document.defaultView, options.detail);
      setEventProp(oEvent, 'relatedTarget', relatedTarget);
    } else if (eventType == 'MouseEvent') {
      var relatedTarget = null;

      if (eventData.relatedTarget)
        relatedTarget = getTarget(eventData.relatedTarget); 

      oEvent.initMouseEvent(eventName, options.bubbles, options.cancelable,
          document.defaultView, options.detail, options.screenX,
          options.screenY, options.clientX, options.clientY,
          options.ctrlKey, options.altKey, options.shiftKey, options.metaKey,
          options.button, relatedTarget);
    } else if (eventType == 'KeyboardEvent') {
      // TODO: nonstandard initKeyboardEvent
      oEvent.initKeyboardEvent(eventName, options.bubbles, options.cancelable,
          document.defaultView, options.keyIdentifier, options.keyLocation, 
          options.ctrlKey, options.altKey, options.shiftKey, options.metaKey);
      
      var propsToSet = ['charCode', 'keyCode'];

      for (var j = 0, jj = propsToSet.length; j < jj; ++j) {
        var prop = propsToSet[j];
        setEventProp(oEvent, prop, options[prop]);
      }
      
    } else if (eventType == 'TextEvent') {
      oEvent.initTextEvent(eventName, options.bubbles, options.cancelable,
          document.defaultView, options.data, options.inputMethod,
          options.locale);
    } else {
      replayLog.error('unknown type of event');
    }

    // used to detect extension generated events
    oEvent.extensionGenerated = true;
    if (eventData.cascading) {
      oEvent.cascading = eventData.cascading;
      oEvent.cascadingOrigin = eventData.cascadingOrigin;
    }

    replayLog.debug('[' + id + '] dispatchEvent', eventName, options, target,
                    oEvent);

    // this does the actual event simulation
    dispatchingEvent = true;
    target.dispatchEvent(oEvent);
    dispatchingEvent = false;

    // update panel showing event was sent
    sendAlert('Dispatched event: ' + eventData.type);
  }
  port.postMessage({type: 'ack', value: true});
  replayLog.debug('[' + id + '] sent ack');
}

/*
function addMemoizedTarget(xPath, target) {
  memoizedTargets.push([xPath, target]);

  if (memoizedTargets.length > 5)
    memoizedTargets.shift();
}

function getMemoizedTarget(xPath) {
  for (var i = memoizedTargets.length - 1; i >= 0; --i) {
    var t = memoizedTargets[i];
    if (t[0] === xPath)
      return t[1];
  }
  return null;
}
*/

var highlightCount = 0;

function highlightNode(target, time) {
  var boundingBox = target.getBoundingClientRect();
  var newDiv = $('<div/>');
  var idName = 'sbarman-hightlight-' + highlightCount
  newDiv.attr('id', idName);
  newDiv.css('width', boundingBox.width);
  newDiv.css('height', boundingBox.height);
  newDiv.css('top', boundingBox.top);
  newDiv.css('left', boundingBox.left);
  newDiv.css('position', 'absolute');
  newDiv.css('z-index', 1000);
  newDiv.css('background-color', '#00FF00');
  newDiv.css('opacity', .4);
  $(document.body).append(newDiv);

  if (time) {
    setTimeout(function() {
      dehighlightNode(idName);
    }, 100);
  }

  return idName;
}

function dehighlightNode(id) {
  $('#' + id).remove();
}

function clearRetry() {
  if (retryTimeout) {
    clearTimeout(retryTimeout);
    retryTimeout = null;
  }
}

function setRetry(request, startIndex, timeout) {
  retryTimeout = setTimeout(function() {
    simulate(request, startIndex);
  }, timeout);
  return;
}

function updateEvent(request) {
  var update = request.value;
  if (lastReplayEvent.pageEventId == update.pageEventId) {
    for (var key in update) {
      lastReplayEvent[key] = update[key];
    }
  }
}

function snapshotReplay(target) {
  replayLog.log('snapshot target:', target);
  if (params.localSnapshot) {
    lastReplaySnapshot = curReplaySnapshot;
    if (lastReplaySnapshot)
      lastReplaySnapshot.after = snapshotNode(lastReplaySnapshot.target);

    curReplaySnapshot = {before: snapshotNode(target), target: target};
  } else {
    var curSnapshot = snapshot();

    lastReplaySnapshot = curReplaySnapshot;
    if (lastReplaySnapshot)
      lastReplaySnapshot.after = curSnapshot;

    curReplaySnapshot = {before: curSnapshot};
  }
}

function resnapshotBefore(target) {
  if (params.localSnapshot)
    curReplaySnapshot.before = snapshotNode(target);
  else
    curReplaySnapshot.before = snapshot();
}

function fixDeltas(recordDeltas, replayDeltas, recordEvent, snapshot) {
  replayLog.info('record deltas:', recordDeltas);
  replayLog.info('replay deltas:', replayDeltas);

  // effects of events that were found in record browser but not replay browser
  var recordDeltasNotMatched = filterDeltas(recordDeltas, replayDeltas);
  // effects of events that were found in replay browser but not record browser
  var replayDeltasNotMatched = filterDeltas(replayDeltas, recordDeltas);

  replayLog.info('record deltas not matched: ', recordDeltasNotMatched);
  replayLog.info('replay deltas not matched: ', replayDeltasNotMatched);

  var element = getTarget(recordEvent.target);

  for (var i = 0, ii = replayDeltasNotMatched.length; i < ii; ++i) {
    var delta = replayDeltasNotMatched[i];
    replayLog.debug('unmatched replay delta', delta);

    if (delta.type == 'Property is different.') {
      var divProp = delta.divergingProp;
//      addComment('replay delta', divProp + ':' + delta.orig.prop[divProp] +
//                 '->' + delta.changed.prop[divProp]);

      if (params.replaying.compensation == Compensation.FORCED) {
        if (element)
          element[divProp] = delta.orig.prop[divProp];
      }
    }

  }

  //the thing below is the stuff that's doing divergence synthesis
  for (var i = 0, ii = recordDeltasNotMatched.length; i < ii; ++i) {
    var delta = recordDeltasNotMatched[i];
    replayLog.debug('unmatched record delta', delta);

    if (delta.type == 'Property is different.') {
      var divProp = delta.divergingProp;
//      addComment('record delta', divProp + ':' + delta.orig.prop[divProp] +
//                 '->' + delta.changed.prop[divProp]);

      if (params.replaying.compensation == Compensation.SYNTH) {
        replayLog.debug('generating compensation event:', delta);
        generateCompensation(recordEvent, delta);
      } else if (params.replaying.compensation == Compensation.FORCED) {
        if (element)
          element[divProp] = delta.changed.prop[divProp];
      }
    }
  }
}

// ***************************************************************************
// Misc code
// ***************************************************************************

// given the new parameters, update the parameters for this content script
function updateParams(newParams) {
  var oldParams = params;
  params = newParams;

  var oldEvents = oldParams.events;
  var events = params.events;

  // if we are listening to all events, then we don't need to do anything since
  // we should have already added listeners to all events at the very
  // beginning
  if (params.recording.listenToAllEvents)
    return;

  for (var eventType in events) {
    var listOfEvents = events[eventType];
    var oldListOfEvents = oldEvents[eventType];
    for (var e in listOfEvents) {
      if (listOfEvents[e] && !oldListOfEvents[e]) {
        log.log('[' + id + '] extension listening for ' + e);
        document.addEventListener(e, recordEvent, true);
      } else if (!listOfEvents[e] && oldListOfEvents[e]) {
        log.log('[' + id + '] extension stopped listening for ' + e);
        document.removeEventListener(e, recordEvent, true);
      }
    }
  }
}

// event handler for messages coming from the background page
function handleMessage(request) {
  var type = request.type;

  log.log('[' + id + '] handle message:', request, type);
  if (type == 'recording') {
    recording = request.value;
  } else if (type == 'params') {
    updateParams(request.value);
  } else if (type == 'event') {
    simulate(request, 0);
  } else if (type == 'snapshot') {
    port.postMessage({type: 'snapshot', value: snapshot()});
  } else if (type == 'updateDeltas') {
    updateDeltas();
  } else if (type == 'reset') {
    resetRecord();
  } else if (type == 'resetCompensation') {
    annotationEvents = {};
  } else if (type == 'url') {
    port.postMessage({type: 'url', value: document.URL});
  } else if (type == 'updateEvent') {
    updateEvent(request);
  } else if (type == 'capture') {
    captureNode();
  } else if (type == 'cancelCapture') {
    cancelCaptureNode();
  } else if (type == 'pauseReplay') {
    clearRetry();
  } else if (type == 'portEvents') {
    setPortEvents(request.value);
  } else {
    log.error('cannot handle message:', request);
  }
}

// Attach the event handlers to their respective events
function addListenersForRecording() {
  var events = params.events;
  for (var eventType in events) {
    var listOfEvents = events[eventType];
    for (var e in listOfEvents) {
      listOfEvents[e] = true;
      document.addEventListener(e, recordEvent, true);
    }
  }
};


// We need to add all the events now before and other event listners are
// added to the page. We will remove the unwanted handlers once params is
// updated
addListenersForRecording();
  
// need to check if we are in an iframe
var value = {};
value.top = (self == top);
value.URL = document.URL;

// Add all the other handlers
chrome.runtime.sendMessage({type: 'getId', value: value}, function(resp) {
  id = resp.value;
  port = new Port(id);
  port.addListener(handleMessage);

  // see if recording is going on
  port.postMessage({type: 'getRecording', value: null});
  port.postMessage({type: 'getParams', value: null});
});

var pollUrlId = window.setInterval(function() {
  if (value.URL != document.URL) {
    var url = document.URL;
    value.URL = url;
    port.postMessage({type: 'url', value: url});
    log.log('url change: ', url);
  }
}, 1000);

/*
var s = document.createElement('script');
s.src = chrome.extension.getURL("scripts/content/injected.js");
s.onload = function() {
    this.parentNode.removeChild(this);
};
(document.head||document.documentElement).appendChild(s);
*/
})();
