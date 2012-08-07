// Utility functions

// send a message to all other tabs, except for yourself
var sendToAll = function(message) {
  chrome.tabs.getCurrent(function(curTab) {
    chrome.tabs.query({}, function(tabs) {
      console.log("background sending:", message);
      var curId = curTab.id;
      for (var i = 0, ii = tabs.length; i < ii; ++i) {
        var id = tabs[i].id;
        if (id != curId) {
         chrome.tabs.sendMessage(tabs[i].id, message);
        }
      }
    });
  });
};

var recording = false;
var events = null;

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

// Replay the event stream, need to do this in CPS style because of the chrome
// extension API
var replay = function(events, index, tabMapping) {
  if (index >= events.length)
    return;

  $("#status").text("Replay " + (index + 1));

  var e = events[index].info;
  var tab = events[index].tab;

  console.log("background replay:", e, tab, tabMapping);

  if (tab.id in tabMapping) {
    chrome.tabs.sendMessage(tabMapping[tab.id], e);

    window.setTimeout(function() {
      replay(events, index + 1, tabMapping);
    }, params.timeout);
  } else {
    chrome.tabs.query({url: e.value.URL}, function(tabs) {
      if (tabs.length == 0) {
        chrome.tabs.create({url: e.value.URL, active: true}, 
            function(newTab) {
              window.setTimeout(function() {
                tabMapping[tab.id] = newTab.id;
                chrome.tabs.sendMessage(newTab.id, e);
  
                window.setTimeout(function() {
                  replay(events, index + 1, tabMapping);
                }, params.timeout);
              }, 2000);
            }
        );
      } else {
        var sameUrlTab = tabs[0];
        tabMapping[tab.id] = sameUrlTab.id;
        chrome.tabs.sendMessage(sameUrlTab.id, e);
        window.setTimeout(function() {
          replay(events, index + 1, tabMapping);
        }, params.timeout);
      }
    });
  }
}

var handleMessage = function(request, sender, sendResponse) {
  console.log("background receiving:", request, "from", sender);
  if (request.type == "event") {
    console.log("background adding event");
    addEvent(request, sender.tab);
  } else if (request.type == "getRecording") {
    chrome.tabs.sendMessage(sender.tab.id,{type: "recording", 
                            value: recording});
  } else if (request.type == "getParams") {
    chrome.tabs.sendMessage(sender.tab.id,{type: "params", value: params});
  }
}

// Remove all the events
var resetEvents = function() {
  events = []
  $("#events").empty();
  $("#status").text(""); 
}

// Add an event
var addEvent = function(eventRequest, tabInfo) {
  events.push({info: eventRequest, tab: tabInfo});
  var eventInfo = eventRequest.value;
  var newDiv = "<div class='event wordwrap'>";

  newDiv += "<b>[" + events.length + "]type:" + "</b>" + eventInfo.type + 
            "<br/>";

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
  var loadParamForm = function(form, paramObject, prefix) {
    for (param in paramObject) {
      var paramValue = paramObject[param];
      var paramType = typeof paramValue;
      var name = prefix + "." + param;

      if (paramType == "number") {
        var input = $("<input type=text name=" + name + "></input>");
        input.prop('value', paramValue);

        var newDiv = $("<div>" + param + "</div>");
        newDiv.append(input)
        form.append(newDiv);
      } else if (paramType == "boolean") {
        var input = $("<input type=checkbox name=" + name + "></input>");
        input.prop('checked', paramValue);

        var newDiv = $("<div>" + param + "</div>");
        newDiv.append(input);
        form.append(newDiv);
      } else if (paramType == "object") {
        form.append("<div>" + name + "</div>");
        loadParamForm(form, paramValue, name);
      }
    }
  }

  var form = $("#params");
  loadParamForm(form, params, "params");
  form.append("<input type='submit' value='Update' name='Update'/>");
  sendToAll({type: "params", value: params});
};

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
}

loadParams();

// Utility functions




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
    replay(events, 0, {});  
  }
});

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

chrome.extension.onMessage.addListener(handleMessage);

// window is closed so tell the content scripts to stop recording and reset the
// extension icon
$(window).unload( function() {
  stop();
  chrome.browserAction.setBadgeText({text: ""});
  chrome.extension.onMessage.removeListener(handleMessage);
});

stop();
