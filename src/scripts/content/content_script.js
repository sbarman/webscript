/* -*- Mode: Java; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* vim: set shiftwidth=2 tabstop=2 autoindent cindent expandtab: */

'use strict';

var port;
var annotationEvents = {};

(function() {

// Global variables
var recording = RecordState.STOPPED;
var id = 'setme';

// synthesis variabes
var inReplayTab = false;
var mostRecentEventMessage;

// record variables
var curRecordSnapshot = snapshot();
var prevRecordSnapshot;
var lastRecordEvent = null;
var eventId = 0;

// replay variables
var curReplaySnapshot = snapshot();
var prevReplaySnapshot;
var lastReplayEvent = null;

// loggers
var log = getLog('content');
var recordLog = getLog('record');
var replayLog = getLog('replay');
var synthesisLog = getLog('synthesis');

// Utility functions

function addComment(name, value) {
  log.log('comment added:', name, value);
  port.postMessage({type: 'comment', value: {name: name, value: value}});
}

// taken from http://stackoverflow.com/questions/2631820/im-storing-click-coor
// dinates-in-my-db-and-then-reloading-them-later-and-showing/2631931#2631931
function nodeToXPath(element) {
//  if (element.id !== '')
//    return 'id("' + element.id + '")';
  if (element.tagName.toLowerCase() === 'html')
    return element.tagName;

  var ix = 0;
  var siblings = element.parentNode.childNodes;
  for (var i = 0, ii = siblings.length; i < ii; i++) {
    var sibling = siblings[i];
    if (sibling === element)
      return nodeToXPath(element.parentNode) + '/' + element.tagName +
             '[' + (ix + 1) + ']';
    if (sibling.nodeType === 1 && sibling.tagName === element.tagName)
      ix++;
  }
}

// convert an xpath expression to an array of DOM nodes
function xPathToNodes(xpath) {
  // contains an node with a namspace (maybe?)
  if (xpath.indexOf(':') > 0) {
    var currentNode = document.documentElement;
    var paths = xpath.split('/');
    // assume first path is "HTML"
    paths: for (var i = 1, ii = paths.length; i < ii; ++i) {
      var children = currentNode.children;
      var path = paths[i];
      var splits = path.split(/\[|\]/)

      var tag = splits[0];
      if (splits.length > 1) {
        var index = parseInt(splits[1]);
      } else {
        var index = 1;
      }

      var seen = 0;
      children: for (var j = 0, jj = children.length; j < jj; ++j) {
        var c = children[j];
        if (c.tagName == tag) {
          seen++;
          if (seen == index) {
            currentNode = c;
            continue paths;
          }
        }
      }
      throw "Cannot find child"; 
    }
    return [currentNode];
  } else {
    var q = document.evaluate(xpath, document, null, XPathResult.ANY_TYPE,
                              null);
    var results = [];
  
    var next = q.iterateNext();
    while (next) {
      results.push(next);
      next = q.iterateNext();
    }
    return results;
  }
};

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

function reset() {
  lastRecordEvent = null;
}

// create an event record given the data from the event handler
function processEvent(eventData) {
  var eventMessage;
  if (recording == RecordState.RECORDING || 
      recording == RecordState.REPLAYING) {
    var type = eventData.type;
    var dispatchType = getEventType(type);
    var properties = getEventProps(type);
    recordLog.log('[' + id + '] process event:', type, dispatchType, eventData);

    var target = eventData.target;
    var nodeName = target.nodeName.toLowerCase();

    eventMessage = {};
    eventMessage['target'] = nodeToXPath(target);
    eventMessage['URL'] = document.URL;
    eventMessage['dispatchType'] = dispatchType;
    eventMessage['nodeName'] = nodeName;
    eventMessage['pageEventId'] =  eventId++;
    
    for (var prop in properties) {
      if (prop in eventData) {
        eventMessage[prop] = eventData[prop];
      }
    }

    if (params.recording.allEventProps) {
      for (var prop in eventData) {
        try {
          var type = typeof(eventData[prop]);
          if (type == 'number' || type == 'boolean' || type == 'string' ||
              type == 'undefined') {
            eventMessage[prop] = eventData[prop];
          }
        } catch (e) {}
      }
    }

    if (eventMessage['charCode']) {
      eventMessage['char'] = String.fromCharCode(eventMessage['charCode']);
    }

    recordLog.log('[' + id + '] event message:', eventMessage);
    port.postMessage({type: 'event', value: eventMessage});

    if (recording == RecordState.RECORDING) {
      prevRecordSnapshot = curRecordSnapshot;
      curRecordSnapshot = snapshot();

      updateRecordDeltas();
      lastRecordEvent = eventMessage;
    }
  }
  return true;
};

function updateRecordDeltas() {
  if (lastRecordEvent) {
    var deltas = getDomDivergence(prevRecordSnapshot, curRecordSnapshot);
    var update = {type: 'updateEvent', value: {'deltas': deltas,
                  'pageEventId': lastRecordEvent.pageEventId}};
    port.postMessage(update);
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
    port.postMessage({type: 'snapshot', value: snapshotDom(document)});
  } else if (request.type == 'deltas') {
    updateRecordDeltas();
  } else if (request.type == 'reset') {
    reset();
  } else if (request.type == 'url') {
    port.postMessage({type: 'url', value: document.URL});
  }
}

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
        document.addEventListener(e, processEvent, true);
      } else if (!listOfEvents[e] && oldListOfEvents[e]) {
        log.log('[' + id + '] extension stopped listening for ' + e);
        document.removeEventListener(e, processEvent, true);
      }
    }
  }
}

// replay an event from an event message
function simulate(request) {

  var eventData = request.value;
  var eventName = eventData.type;

  replayLog.log('simulating: ', eventName, eventData);

  //we're in simulate, so we must be in a tab that's doing replay
  //we don't want to have to snapshot every time as though we're
  //recording.  so let's set inReplayTab to true
  inReplayTab = true;

  if (eventName == 'wait') {
    checkWait(eventData);
    return;
  }

  if (eventName == 'custom') {
    var script = eval(eventData.script);
    script(element, eventData);
    return;
  }

  var nodes = xPathToNodes(eventData.target);
  //if we don't successfully find nodes, let's alert
  if (nodes.length != 1) {
    sendAlert("Couldn't find the DOM node we needed.");
    return;
  }
  var target = nodes[0];

  if (params.synthesis.enabled && lastReplayEvent) {
    // make sure the deltas from the last event actually happened
    var recordDeltas = lastReplayEvent.deltas || [];

    // run the old compensation events
    for (var i in annotationEvents) {
      var annotation = annotationEvents[i];
      if (annotation.replay && annotation.guard(target, lastReplayEvent)) {
        if (synthesisVerbose){
          log.log("annotation event being used", i, annotation.recordNodes,
                      annotation.replayNodes);
        }
        annotation.replay(target, lastReplayEvent);
      }
    }

    // calculate the deltas between the last simulated event and this one
    prevReplaySnapshot = curReplaySnapshot;
    curReplaySnapshot = snapshot();
    var replayDeltas = getDomDivergence(prevReplaySnapshot, curReplaySnapshot);

    // check if these deltas match the deltas from the last simulated event
    // and synthesize appropriate compensation events for unmatched deltas
    synthesize(recordDeltas, replayDeltas, target, lastReplayEvent);

    // run the new compensation events
    for (var i in annotationEvents) {
      var annotation = annotationEvents[i];
      if (annotation.replay && annotation.guard(target, lastReplayEvent)) {
        if (synthesisVerbose){
          log.log("annotation event being used", i, annotation.recordNodes,
                      annotation.replayNodes);
        }
        annotation.replay(target, lastReplayEvent);
      }
    }

    curReplaySnapshot = snapshot();
  }

  lastReplayEvent = eventData

  var eventType = getEventType(eventName);
  var defaultProperties = getEventProps(eventName);

  if (!eventType)
    throw new SyntaxError(eventData.type + ' event not supported');

  var options = jQuery.extend({}, defaultProperties, eventData);

  var setEventProp = function(e, prop, value) {
    Object.defineProperty(e, prop, {value: value});
    if (e.prop != value) {
      Object.defineProperty(e, prop, {get: function() {value}});
      Object.defineProperty(e, prop, {value: value});
    }
  };

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
    /*
    for (var p in options) {
      if (p != "nodeName" && p != "dispatchType" && p != "URL" &&
          p != "timeStamp")
        setEventProp(oEvent, p, options[p]);
    }
    */
  } else if (eventType == 'TextEvent') {
    oEvent.initTextEvent(eventName, options.bubbles, options.cancelable,
        document.defaultView, options.data, options.inputMethod,
        options.locale);
  } else {
    log.log('Unknown type of event');
  }
  replayLog.log('[' + id + '] dispatchEvent', eventName, options, oEvent);
  port.postMessage({type: 'ack', value: true});
  replayLog.log('[' + id + '] sent ack');

  //we're going to use this for synthesis, if synthesis is on
  mostRecentEventMessage = eventData;
  log.log("DISPATCHING EVENT OF TYPE", mostRecentEventMessage.type);
  
  //this does the actual event simulation
  target.dispatchEvent(oEvent);

  //let's update a div letting us know what event we just got
  sendAlert('Received Event: ' + eventData.type);
}

function synthesize(recordDeltas, replayDeltas, target, recordEventMessage) {

  log.log('RECORD DELTAS', recordDeltas);
  log.log('REPLAY DELTAS', replayDeltas);

  //effects of events that were found in record browser but not replay browser
  var recordDeltasNotMatched = filterDivergences(recordDeltas, replayDeltas);
  //effects of events that were found in replay browser but not record browser
  var replayDeltasNotMatched = filterDivergences(replayDeltas, recordDeltas);

  log.log('recordDeltasNotMatched', recordDeltasNotMatched);
  log.log('replayDeltasNotMatched', replayDeltasNotMatched);

  //the thing below is the stuff that's doing divergence synthesis

  for (var i = 0, ii = recordDeltasNotMatched.length; i < ii; i++) {
    var delta = recordDeltasNotMatched[i];
    //addComment('delta', JSON.stringify(recordDeltasNotMatched));
    if (delta.type == "We expect these nodes to be the same, but they're " +
                      'not.') {
      generateCompensationEvent(target, recordEventMessage, 
                                delta, true);
    }
  }

  // not currently true
  //generateCompensationEvent will change the state of the DOM to be what it
  //should have been, if the proper compensation events were in place
  //but we don't want to associate these changes with the next event
  //so let's snapshot the DOM again
  /*if (recordDeltasNotMatched.length > 0 || replayDeltasNotMatched.length > 0) {
    //curSnapshotReplay = snapshot();
    prevSnapshotRecord = curSnapshotRecord;
    curSnapshotRecord = snapshot();
  }
*/
}

function checkWait(eventData) {
  replayLog.log('checking:', eventData);
  var result = eval(eventData.condition);
  port.postMessage({type: 'ack', value: result});
}

// Attach the event handlers to their respective events
function addListenersForRecording() {
  var events = params.events;
  for (var eventType in events) {
    var listOfEvents = events[eventType];
    for (var e in listOfEvents) {
      listOfEvents[e] = true;
      document.addEventListener(e, processEvent, true);
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
  port = chrome.extension.connect({name: id});
  port.onMessage.addListener(handleMessage);

  // see if recording is going on
  port.postMessage({type: 'getRecording', value: null});
  port.postMessage({type: 'getParams', value: null});
});

var pollUrlId = window.setInterval(function() {
  if (value.URL != document.URL) {
    port.postMessage({type: 'url', value: document.URL});
    value.URL = document.URL;
  }
}, 1000);

})();

