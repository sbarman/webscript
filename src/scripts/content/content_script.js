/* -*- Mode: Java; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* vim: set shiftwidth=2 tabstop=2 autoindent cindent expandtab: */

'use strict';

var port;

(function() {

// Global variables
var recording = false;
var id = 'setme';
var curSnapshotRecord;
var curSnapshotReplay;
/*
var similarityThreshold = .9;
var acceptTags = {"HTML":true, "BODY":true, "HEAD":true};
var initialDivergences = false;
var verbose = false;
var scenarioVerbose = false;
var synthesisVerbose = true;
*/
var synthesisVerbose = true;
var verbose = true;

var prevEvent;
var seenEvent = false;

var log = getLog('content');
var recordLog = getLog('record');
var replayLog = getLog('replay');

// Utility functions

curSnapshotRecord = snapshot();
curSnapshotReplay = curSnapshotRecord;


function addComment(name, value) {
  log.log('comment added:', name, value);
  port.postMessage({type: 'comment', value: {name: name, value: value}});
}

// taken from http://stackoverflow.com/questions/2631820/im-storing-click-coor
// dinates-in-my-db-and-then-reloading-them-later-and-showing/2631931#2631931
function getPathTo(element) {
//  if (element.id !== '')
//    return 'id("' + element.id + '")';
  if (element.tagName.toLowerCase() === 'html')
    return element.tagName;

  var ix = 0;
  var siblings = element.parentNode.childNodes;
  for (var i = 0, ii = siblings.length; i < ii; i++) {
    var sibling = siblings[i];
    if (sibling === element)
      return getPathTo(element.parentNode) + '/' + element.tagName +
             '[' + (ix + 1) + ']';
    if (sibling.nodeType === 1 && sibling.tagName === element.tagName)
      ix++;
  }
}

// convert an xpath expression to an array of DOM nodes
function xPathToNodes(xpath) {
  var q = document.evaluate(xpath, document, null, XPathResult.ANY_TYPE, null);
  var results = [];

  var next = q.iterateNext();
  while (next) {
    results.push(next);
    next = q.iterateNext();
  }
  return results;
};

// Functions to handle events
// Mouse click, Select text, Input form, Back / forward button, Copy / Paste
// Page load

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

function getEventProps(type) {
  var eventType = getEventType(type);
  return params.defaultProps[eventType];
}

// create an event record given the data from the event handler
function processEvent(eventData) {
  if (recording) {
    var type = eventData.type;
    var dispatchType = getEventType(type);
    var properties = getEventProps(type);
    recordLog.log('[' + id + '] process event:', type, dispatchType, eventData);

    var target = eventData.target;
    var nodeName = target.nodeName.toLowerCase();

    var eventMessage = {};
    eventMessage['target'] = getPathTo(target);
    eventMessage['URL'] = document.URL;
    eventMessage['dispatchType'] = dispatchType;
    eventMessage['nodeName'] = nodeName;

    curSnapshotRecord = snapshot();
    eventMessage['snapshotBefore'] = curSnapshotRecord;

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

/*
    var extension = extendEvents[type];
    if (extension) {
      extension.record(eventData, eventMessage);
    }

    for (var i in annotationEvents) {
      var annotation = annotationEvents[i];
      if (annotation.record && annotation.guard(eventData, eventMessage)) {
        annotation.record(eventData, eventMessage);
      }
    }
*/

   // console.log("extension sending:", eventMessage);
    recordLog.log('[' + id + '] event message:', eventMessage);
    port.postMessage({type: 'event', value: eventMessage});
  }
  return true;
};

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

function simulate(request) {
  //console.log("extension event", request, request.value.type)
  var eventData = request.value;
  var eventName = eventData.type;

  if (eventName == 'wait') {
    checkWait(eventData);
    return;
  }

  replayLog.log('simulating: ', eventData);

  var nodes = xPathToNodes(eventData.target);
  //if we don't successfully find nodes, let's alert
  if (nodes.length != 1) {
    sendAlert("Couldn't find the DOM node we needed.");
    return;
  }

  var element = nodes[0];

  if (eventName == 'custom') {
    var script = eval(eventData.script);
    script(element, eventData);
    return;
  }

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
        options.button, element);
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

  if (!seenEvent) {
    seenEvent = true;
    curSnapshotReplay = snapshot();
  }
  else {
    var recordDomBefore = prevEvent.eventData.snapshotBefore;
    var recordDomAfter = eventData.snapshotBefore;
    var replayDomBefore = curSnapshotReplay;
    curSnapshotReplay = snapshot();
    var replayDomAfter = curSnapshotReplay;

    if (synthesisVerbose) {
      log.log('EVENT for checking DIVERGENCE', prevEvent.eventData.type,
               prevEvent.eventData.nodeName);
      log.log('EVENT about to DISPATCH', eventData.type, eventData.nodeName);
    }

    //let's try seeing divergence for the last event, now that we have a
    //new more recent snapshot of the record DOM
    if (params.synthesis.enabled) {
      visualizeDivergence(prevEvent, recordDomBefore, recordDomAfter,
                          replayDomBefore, replayDomAfter, oEvent);
    }
  }
  //this does the actual event simulation
  element.dispatchEvent(oEvent);

/*
  // handle any quirks with the event type
  var extension = extendEvents[eventName];
  if (extension) {
    extension.replay(element, eventData);
  }

  // handle any more quirks with a specific version of the event type
  for (var i in annotationEvents) {
    var annotation = annotationEvents[i];
    if (annotation.replay && annotation.guard(element, eventData)) {
      if (synthesisVerbose){
        console.log("annotation event being used", i, annotation.recordNodes,
                    annotation.replayNodes);
      }
      annotation.replay(element, eventData);
    }
  }
*/

  //let's update a div letting us know what event we just got
  sendAlert('Received Event: ' + eventData.type);

  //now we need to store the current element and eventData into nextDivergence
  prevEvent = {'element': element, 'eventData': eventData};
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

})();
