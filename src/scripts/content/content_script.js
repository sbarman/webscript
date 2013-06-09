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
var accumulatedDeltas = [];

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

// create an event record given the data from the event handler
function recordEvent(eventData) {
  var eventMessage;

  // check if we are stopped, then just return
  if (recording == RecordState.STOPPED)
    return true;

  var type = eventData.type;
  var dispatchType = getEventType(type);

  // cancel the affects of events which are not extension generated
  if (recording == RecordState.REPLAYING && !eventData.extensionGenerated &&
      params.replaying.cancelUnknownEvents) {

    recordLog.debug('[' + id + '] cancel event:', type, dispatchType,
                  eventData);
    eventData.stopImmediatePropagation();
    eventData.preventDefault();

    return false;
  }

  // continue recording the event
  recordLog.debug('[' + id + '] process event:', type, dispatchType,
                eventData);

  var properties = getEventProps(type);
  var target = eventData.target;
  var nodeName = target.nodeName.toLowerCase();

  // deal with snapshotting the DOM, calculating the deltas, and sending
  // updates
  updateDeltas(target);

  eventMessage = {};
  eventMessage['target'] = nodeToXPath(target);
  eventMessage['URL'] = document.URL;
  eventMessage['dispatchType'] = dispatchType;
  eventMessage['nodeName'] = nodeName;
  eventMessage['pageEventId'] =  pageEventId++;
  eventMessage['recordState'] = recording;
  
  // record all properties of the event object
  if (params.recording.allEventProps) {
    for (var prop in eventData) {
      try {
        var type = typeof(eventData[prop]);
        if (type == 'number' || type == 'boolean' || type == 'string' ||
            type == 'undefined')
          eventMessage[prop] = eventData[prop];
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
  port.postMessage({type: 'event', value: eventMessage});

  lastRecordEvent = eventMessage;
  
  // just spin for some number of seconds to delay the page compared
  // to some server
  if (recording == RecordState.RECORDING && params.recording.delayEvents) {
    var curTime = new Date().getTime();
    var endTime = curTime + params.recording.delay;
    while (curTime < endTime)
      curTime = new Date().getTime();
  }
  
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
      }
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
  eventMessage['target'] = nodeToXPath(target);
  eventMessage['URL'] = document.URL;
  eventMessage['nodeName'] = target.nodeName.toLowerCase();
  eventMessage['timestamp'] = new Date().getTime();
  eventMessage['recordState'] = recording;

  log.log('capturing:', target, eventMessage);
  port.postMessage({type: 'event', value: eventMessage});
}

// ***************************************************************************
// Replaying code
// ***************************************************************************

// replay an event from an event message
function simulate(request) {

  var eventData = request.value;
  var eventName = eventData.type;

  replayLog.debug('simulating:', eventName, eventData);

  if (eventName == 'wait') {
    checkWait(eventData);
    return;
  } else if (eventName == 'custom') {
    var script = eval(eventData.script);
    script(element, eventData);
    return;
  } else if (eventName == 'capture') {
    var target = xPathToNode(eventData.target);
    replayLog.log('found capture node:', target);

    var innerHtml = target.innerHTML;
    var nodeName = target.nodeName.toLowerCase();
    var msg = {innerHtml: target.innerHTML,
               nodeName: target.nodeName.toLowerCase()};
    
    port.postMessage({type: 'saveCapture', value: msg});
    port.postMessage({type: 'ack', value: true});
    return;
  }

  if (params.replaying.skipCascadingEvents && eventData.cascading) {
    replayLog.debug('skipping event', eventData);
    port.postMessage({type: 'ack', value: true});

    if (params.synthesis.enabled)
      accumulatedDeltas =  accumulatedDeltas.concat(eventData.deltas);

    return;
  }

  var target = xPathToNode(eventData.target);

  // make sure the deltas from the last event actually happened
  if (params.synthesis.enabled && lastReplayEvent) {
    try {
      var lastTarget = xPathToNode(lastReplayEvent.target);
      // run the compensation events for the last event
      for (var i in annotationEvents) {
        var annotation = annotationEvents[i];
        if (annotation.replay && 
            annotation.guard(lastTarget, lastReplayEvent)) {

          replayLog.debug('annotation event being used', i,
                          annotation.recordNodes, annotation.replayNodes);
          annotation.replay(lastTarget, lastReplayEvent);
        }
      }
    } catch(e) {
      replayLog.error('error when replaying annotation events:', e);
    }

    var recordDeltas = lastReplayEvent.deltas;
    if (typeof recordDeltas == 'undefined') {
      replayLog.error('no deltas found for last event:', lastReplayEvent);
      recordDeltas = [];
    }

    // if we skipped any events, we need to add those deltas to the
    // deltas of the last event
    recordDeltas = recordDeltas.concat(accumulatedDeltas);
    accumulatedDeltas = [];

    // make sure replay matches recording
    snapshotReplay(target);
    if (lastReplaySnapshot){
      var replayDeltas = getDeltas(lastReplaySnapshot.before,
                                   lastReplaySnapshot.after);
      // check if these deltas match the deltas from the last simulated event
      // and synthesize appropriate compensation events for unmatched deltas
      synthesize(recordDeltas, replayDeltas, lastReplayEvent,
                 lastReplaySnapshot.after);
    }

    //annotation events may have changed the effects of the last event
    //have to make sure that anything associated with this event isn't
    //from annotation events of last event
    resnapshotBefore(target);
  }

  lastReplayEvent = eventData

  var eventType = getEventType(eventName);
  var defaultProperties = getEventProps(eventName);

  if (!eventType) {
    replayLog.error("can't find event type ", eventName);
    return;
  }

  var options = jQuery.extend({}, defaultProperties, eventData);

  // needed since some event properties are marked as read only
  function setEventProp(e, prop, value) {
    Object.defineProperty(e, prop, {value: value});
    if (e.prop != value) {
      Object.defineProperty(e, prop, {get: function() {value}});
      Object.defineProperty(e, prop, {value: value});
    }
  }

  var oEvent = document.createEvent(eventType);
  if (eventType == 'Event') {
    oEvent.initEvent(eventName, options.bubbles, options.cancelable);
  } else if (eventType == 'MouseEvent') {
    oEvent.initMouseEvent(eventName, options.bubbles, options.cancelable,
        document.defaultView, options.detail, options.screenX,
        options.screenY, options.clientX, options.clientY,
        options.ctrlKey, options.altKey, options.shiftKey, options.metaKey,
        options.button, target);
  } else if (eventType == 'KeyboardEvent') {
    oEvent.initKeyboardEvent(eventName, options.bubbles, options.cancelable,
        document.defaultView, options.ctrlKey, options.altKey,
        options.shiftKey, options.metaKey, options.keyCode,
        options.charCode);

    var propsToSet = ['charCode', 'keyCode', 'shiftKey', 'metaKey',
                      'keyIdentifier', 'which'];
    for (var i = 0, ii = propsToSet.length; i < ii; ++i) {
      var prop = propsToSet[i];
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

  // this does the actual event simulation
  target.dispatchEvent(oEvent);
  replayLog.debug('[' + id + '] dispatchEvent', eventName, options, target, 
                  oEvent);

  port.postMessage({type: 'ack', value: true});
  replayLog.debug('[' + id + '] sent ack');

  // update panel showing event was sent
  sendAlert('Received Event: ' + eventData.type);
}

function updateEvent(request) {
  var update = request.value;
  if (lastReplayEvent.pageEventId == update.pageEventId) {
    for (var key in update) {
      lastReplayEvent[key] = update[key];
    }
  }
}

function snapshotReplay(target){
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

function resnapshotBefore(target){
  if (params.localSnapshot)
    curReplaySnapshot.before = snapshotNode(target);
  else
    curReplaySnapshot.before = snapshot();
}

function synthesize(recordDeltas, replayDeltas, recordEvent, snapshot) {
  replayLog.info('record deltas:', recordDeltas);
  replayLog.info('replay deltas:', replayDeltas);

  // effects of events that were found in record browser but not replay browser
  var recordDeltasNotMatched = filterDeltas(recordDeltas, replayDeltas);
  // effects of events that were found in replay browser but not record browser
  var replayDeltasNotMatched = filterDeltas(replayDeltas, recordDeltas);

  replayLog.info('record deltas not matched: ', recordDeltasNotMatched);
  replayLog.info('replay deltas not matched: ', replayDeltasNotMatched);

  //the thing below is the stuff that's doing divergence synthesis
  for (var i = 0, ii = recordDeltasNotMatched.length; i < ii; i++) {
    var delta = recordDeltasNotMatched[i];
    if (delta.type == 'Property is different.')
      replayLog.debug('generating compensation event:', delta);
      generateCompensation(recordEvent, delta);
  }
}

function checkWait(eventData) {
  replayLog.debug('checking wait:', eventData);
  var result = eval(eventData.condition);
  port.postMessage({type: 'ack', value: result});
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
  log.log('[' + id + '] handle message:', request, request.type);
  if (request.type == 'recording') {
    recording = request.value;
  } else if (request.type == 'params') {
    updateParams(request.value);
  } else if (request.type == 'event') {
    simulate(request);
  } else if (request.type == 'snapshot') {
    port.postMessage({type: 'snapshot', value: snapshot()});
  } else if (request.type == 'updateDeltas') {
    updateDeltas();
  } else if (request.type == 'reset') {
    resetRecord();
  } else if (request.type == 'resetCompensation') {
    annotationEvents = {};
  } else if (request.type == 'url') {
    port.postMessage({type: 'url', value: document.URL});
  } else if (request.type == 'updateEvent') {
    updateEvent(request);
  } else if (request.type == 'capture') {
    captureNode();
  } else if (request.type == 'cancelCapture') {
    cancelCaptureNode();
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
chrome.extension.sendMessage({type: 'getId', value: value}, function(resp) {
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

})();


