// Global variables
var ports = {}; 
var recording = false;
var events = null;
var numPorts = 0;
var portNameToTab = {};
var tabIdToPortNames = {};

// Utility functions

// send a message to all other tabs, except for yourself
var sendToAll = function(message) {
  for (var portName in ports) {
    ports[portName].postMessage(message);
  }
};

// The user started recording
var start = function _start() {
  console.log("start");

  resetEvents();
  recording = true;

  // Update the UI
  chrome.browserAction.setBadgeBackgroundColor({color:[255, 0, 0, 64]});
  chrome.browserAction.setBadgeText({text: "ON"});
  $("#status").text("Recording");

  // Tell the content scripts to begin recording
  sendToAll({type: "recording", value: recording});
};

// The user stopped recording
var stop = function _stop() {
  console.log("stop");

  recording = false;

  // Update the UI
  chrome.browserAction.setBadgeBackgroundColor({color: [0, 0, 0, 0]});
  chrome.browserAction.setBadgeText({text: "OFF"});
  $("#status").text("Done");

  // Tell the content scripts to stop recording
  sendToAll({type: "recording", value: recording});
};

var sendEventNewTab = function(events, index, portMapping, tabMapping, tab) {
  var port = undefined;

  if (tab.id in tabIdToPortNames) {
    var allPortsInTab = tabIdToPortNames[tab.id];
    var portName = allPortsInTab[allPortsInTab.length - 1];
    port = ports[portName];
  }

  if (typeof port == 'undefined') {
    window.setTimeout(function() {
      sendEventNewTab(events, index, portMapping, tabMapping, tab);
    }, 1000);
  } else {
    port.postMessage(events[index].msg);
    portMapping[events[index].port] = port;
    tabMapping[events[index].tab.id] = tab.id;

    window.setTimeout(function() {
      replay(events, index + 1, portMapping, tabMapping);
    }, params.timeout);
  } 
}

// Replay the event stream, need to do this in CPS style because of the chrome
// extension API
var replay = function(events, index, portMapping, tabMapping) {
  if (index >= events.length)
    return;

  $("#status").text("Replay " + (index + 1));

  var e = events[index]
  var msg = e.msg;
  var port = e.port;
  var tab = e.tab.id;

  console.log("background replay:", msg, port, tab);

  // we have already seen this port, reuse existing mapping
  if (port in portMapping) {
    portMapping[port].postMessage(msg);

    window.setTimeout(function() {
      replay(events, index + 1, portMapping, tabMapping);
    }, params.timeout);
  // we have already seen this tab, find equivalent port for tab
  // for now we will just choose the last port added from this tab
  } else if (tab in tabMapping) {
    var newTabId = tabMapping[tab];
    var tabPorts = tabIdToPortNames[newTabId];
    var newPort = ports[tabPorts[tabPorts.length - 1]];
    newPort.postMessage(msg);
   
    portMapping[port] = newPort;

    window.setTimeout(function() {
      replay(events, index + 1, portMapping, tabMapping);
    }, params.timeout);
  } else {
    chrome.tabs.create({url: msg.value.URL, active: true}, 
        function(newTab) {
          sendEventNewTab(events, index, portMapping, tabMapping, newTab);
        }
    );
  }
};

// The first message content scripts send is to get a unique id
var handleIdMessage = function(request, sender, sendResponse) {
  console.log("background receiving:", request, "from", sender);
  if (request.type == "getId") {
    numPorts++;
    var portName = "" + numPorts
    sendResponse({type: "id", value: portName});
    portNameToTab[portName] = sender.tab;
   
    var tabId = sender.tab.id;
    if (typeof tabIdToPortNames[tabId] == "undefined") {
      tabIdToPortNames[tabId] = [];
    }
    tabIdToPortNames[tabId].push(portName);
  }
};

// Route messages from the ports
var handleMessage = function(port, request) {
  if (request.type == "event") {
    console.log("background adding event");
    addEvent(request, port.name);
  } else if (request.type == "getRecording") {
    port.postMessage({type: "recording", value: recording});
  } else if (request.type == "getParams") {
    port.postMessage({type: "params", value: params});
  }
};

// Remove all the events
var resetEvents = function() {
  events = []
  $("#events").empty();
  $("#status").text(""); 
};

// Add an event
var addEvent = function(eventRequest, portName) {
  events.push({msg: eventRequest, port: portName, 
               tab: portNameToTab[portName]});
  var eventInfo = eventRequest.value;
  var newDiv = "<div class='event wordwrap'>";

  newDiv += "<b>[" + events.length + "]type:" + "</b>" + eventInfo.type + 
            "<br/>";
  newDiv += "<b>port:" + "</b>" + portName + "<br/>";

  for (prop in eventInfo) {
    if (prop != "type") {
      newDiv += "<b>" + prop + ":" + "</b>" + eventInfo[prop] + "<br/>";
    }
  }
  newDiv += "</div>";
  $("#events").append(newDiv);
};

// create a form on the panel so that parameters can be set. its a bit 
// complicated because changes in the panel need to conveyed to the content
// scripts on each page
var loadParams = function() {
  // create a form based on parameters
  var loadParamForm = function(node, paramObject, prefix) {
    for (param in paramObject) {
      var paramValue = paramObject[param];
      var paramType = typeof paramValue;
      var name = prefix + "." + param;

      if (paramType == "number") {
        var input = $("<input type=text name=" + name + "></input>");
        input.prop('value', paramValue);

        var newDiv = $("<div>" + param + "</div>");
        newDiv.append(input)
        node.append(newDiv);
      } else if (paramType == "boolean") {
        var input = $("<input type=checkbox name=" + name + "></input>");
        input.prop('checked', paramValue);

        var newDiv = $("<div>" + param + "</div>");
        newDiv.append(input);
        node.append(newDiv);
      } else if (paramType == "object") {
        var newDiv = $("<div class='boxed'></div>");
        newDiv.append("<div>" + name + "</div>");
        loadParamForm(newDiv, paramValue, name);
        node.append(newDiv);
      }
    }
  }

  var form = $("#params");
  loadParamForm(form, params, "params");
  form.append("<input type='submit' value='Update' name='Update'/>");
  sendToAll({type: "params", value: params});
};
loadParams();

// Go through the form and update the params variable
var updateParams = function() {
  var obj = {};
  var inputs = $("#params").prop("elements");
  for (var i = 0, ii = inputs.length; i < ii; ++i) {
    var input = inputs[i];

    var val;
    if (input.type == "checkbox") {
      val = input.checked;
    } else if (input.type == "text") {
      val = parseInt(input.value);
    } else {
      continue;
    }
    var names = input.name.split('.');

    var cur = obj;
    for (var j = 0, jj = names.length - 1; j < jj; ++j) {
      var key = names[j];
      if (!(key in cur)) {
        cur[key] = {};
      }
      cur = cur[key];
    }
    cur[names[names.length - 1]] = val;
  }

  params = obj.params;
};

// Attach the event handlers to their respective events
$("#start").click(function(eventObject) {
  start();
});

$("#stop").click(function(eventObject) {
  stop();
});

$("#replay").click(function(eventObject) {
  stop();

  if (events && events.length > 0) {
    replay(events, 0, {}, {});  
  }
});

$("#paramsDiv").hide(1000);

$("#paramsHide").click(function(eventObject) {
  $("#paramsDiv").toggle(1000);
});

// when the form is submitted, the parameters should be dispatched to the
// content scripts so that everything is kept insync
$("#params").submit(function(eventObject) {
  updateParams();
  sendToAll({type: "params", value: params});
  return false;
});

chrome.extension.onMessage.addListener(handleIdMessage);

chrome.extension.onConnect.addListener(function(port) {
  ports[port.name] = port;

  port.onMessage.addListener(function(msg) {
    handleMessage(port, msg);
  });

  port.onDisconnect.addListener(function(evt) {
    if (port.name in ports) {
      delete ports[port.name];
    } else {
      throw "Can't find port";
    }
  });
});

// window is closed so tell the content scripts to stop recording and reset the
// extension icon
$(window).unload( function() {
  stop();
  chrome.browserAction.setBadgeText({text: ""});
  chrome.extension.onMessage.removeListener(handleMessage);
});

stop();
