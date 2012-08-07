// Mouse click
// Select text
// Input form
// Back / forward button
// Copy / Paste
// Page load

var processEvent = function _processEvent(eventData) {
//  var pageClone = $(document).clone(false, false);
  if (recording) {
    console.log("extension event:", eventData);

    var eventMessage = {}
    eventMessage["target"] = getPathTo(eventData.target);
    eventMessage["URL"] = document.URL;
    eventMessage["type"] = eventData.type;
    console.log("extension sending:", eventMessage);
    chrome.extension.sendMessage({type: "event", value: eventMessage});
  }
  return true;
};

var handleMessage = function(request, sender, sendResponse) {
  console.log("extension receiving:", request, "from", sender);
  if (request.type == "recording") {
    recording = request.value;
  } else if (request.type == "params") {
    updateParams(request.value);
  } else if (request.type == "event") {
    console.log("extension event", request)
    var e = request.value;
    var nodes = xPathToNodes(e.target);
    for (var i = 0, ii = nodes.length; i < ii; ++i) {
      simulate(nodes[i], e.type);
    }
  }
}

var updateParams = function(newParams) {
  var oldParams = params;
  params = newParams;
  
  var oldEvents = oldParams.events; 
  var events = params.events;

  for (var eventType in events) {
    var listOfEvents = events[eventType];
    var oldListOfEvents = oldEvents[eventType];
    for (var e in listOfEvents) {
      if (listOfEvents[e] && !oldListOfEvents[e]) {
        console.log("extension listening for " + e);
        document.addEventListener(e, processEvent, true);
      } else if (!listOfEvents[e] && oldListOfEvents[e]) {
        console.log("extension stopped listening for " + e);
        document.removeEventListener(e, processEvent, true);
      }
    }
  }
}

// taken from http://stackoverflow.com/questions/2631820/im-storing-click-coordinates-in-my-db-and-then-reloading-them-later-and-showing/2631931#2631931
function getPathTo(element) {
  if (element.id !== '')
    return 'id("' + element.id + '")';
  if (element.tagName.toLowerCase() === "html")
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
var xPathToNodes = function(xpath) {
  var q = document.evaluate(xpath, document, null, XPathResult.ANY_TYPE, null);
  var results = [];

  var next = q.iterateNext();
  while (next) {
    results.push(next);
    next = q.iterateNext();
  }
  return results;
};

// taken from http://stackoverflow.com/questions/6157929/how-to-simulate-mouse-
// click-using-javascript. used to simulate events on a page
function simulate(element, eventName) {

  function extend(destination, source) {
    for (var property in source)
      destination[property] = source[property];
    return destination;
  }

  var defaultOptions = {
    pointerX: 0,
    pointerY: 0,
    button: 0,
    ctrlKey: false,
    altKey: false,
    shiftKey: false,
    metaKey: false,
    bubbles: true,
    cancelable: true
  }

  var options = extend(defaultOptions, arguments[2] || {});
  var oEvent, eventType = null;

  for (var name in params.events) {
    if (eventName in params.events[name]) {
      eventType = name;
      break;
    }
  }

  if (!eventType)
    throw new SyntaxError('Only HTMLEvents and MouseEvents interfaces are ' +
                          'supported');

  if (document.createEvent) {
    oEvent = document.createEvent(eventType);
    if (eventType == 'HTMLEvents') {
      oEvent.initEvent(eventName, options.bubbles, options.cancelable);
    } else {
      oEvent.initMouseEvent(eventName, options.bubbles, options.cancelable,
          document.defaultView, options.button, options.pointerX,
          options.pointerY, options.pointerX, options.pointerY, options.ctrlKey,
          options.altKey, options.shiftKey, options.metaKey, options.button,
          element);
    }
    element.dispatchEvent(oEvent);
  } else {
    options.clientX = options.pointerX;
    options.clientY = options.pointerY;
    var evt = document.createEventObject();
    oEvent = extend(evt, options);
    element.fireEvent('on' + eventName, oEvent);
  }
  return element;
}


// Attach the event handlers to their respective events
var addListenersForRecording = function() {
  for (var eventType in capturedEvents) {
    var listOfEvents = capturedEvents[eventType];
    for (var e in listOfEvents) {
      listOfEvents[e] = true;
      document.addEventListener(e, processEvent, true);
    }
  }
};
addListenersForRecording();

chrome.extension.onMessage.addListener(handleMessage); 

// see if recording is going on
var recording;
chrome.extension.sendMessage({type: "getRecording", value: null});
chrome.extension.sendMessage({type: "getParams", value: null});

console.log(frames.length);
