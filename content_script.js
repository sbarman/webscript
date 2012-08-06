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

// Attach the event handlers to their respective events
var addListenersForRecording = function() {
  for (var eventType in capturedEvents) {
    var listOfEvents = capturedEvents[eventType];
    for (var e in listOfEvents) {
      if (listOfEvents[e]) {
        document.addEventListener(e, processEvent, true);
      }
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
