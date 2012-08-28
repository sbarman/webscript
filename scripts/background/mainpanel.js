/* -*- Mode: Java; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* vim: set shiftwidth=2 tabstop=2 autoindent cindent expandtab: */

'use strict';

var PortManager = (function PortManager() {
  function PortManager() {
  }
  
  PortManager.prototype = {
  };

  return PortManager;
})();

var Panel = (function PanelClosure() {
  function Panel() {
    this.loadParams();
    this.attachHandlers();
  }

  Panel.prototype = {
    attachHandlers: function _attachHandlers() {
      $("#start").click(function(eventObject) {
        start();
      });
      
      $("#stop").click(function(eventObject) {
        stop();
      });
      
      $("#replay").click(function(eventObject) {
        stop();
        recordReplay.replay(events, 0, {}, {});  
      });
      
      $("#paramsDiv").hide(1000);
      
      $("#paramsHide").click(function(eventObject) {
        $("#paramsDiv").toggle(1000);
      });
      
      var panel = this;
      // when the form is submitted, the parameters should be dispatched to the
      // content scripts so that everything is kept insync
      $("#params").submit(function(eventObject) {
        panel.updateParams();
        sendToAll({type: "params", value: params});
        return false;
      });
    },
    loadParams: function _loadParams() {
      // create a form based on parameters
      var loadParamForm = function(node, paramObject, prefix) {
        for (var param in paramObject) {
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
            newDiv.append("<div>" + param + "</div>");
            loadParamForm(newDiv, paramValue, name);
            node.append(newDiv);
          }
        }
      }

      var form = $("#params");
      loadParamForm(form, params, "params");
      form.append("<input type='submit' value='Update' name='Update'/>");
    },
    updateParams: function _updateParams() {
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
    },
    addEvent: function _addEvent(eventRecord) {
      var eventInfo = eventRecord.msg.value;
      var id = eventRecord.id;
      var num = eventRecord.num;
      var tab = eventRecord.tab;
      var topURL = eventRecord.topURL;
      var portName = eventRecord.portName;
      var topFrame = eventRecord.topFrame;
      var iframeIndex = eventRecord.iframeIndex;

      var newDiv = "<div class='event wordwrap' id='" + id + "'>";

      newDiv += "<b>[" + num + "]type:" + "</b>" + eventInfo.type + 
                "<br/>";
      newDiv += "<b>tab:" + "</b>" + tab + "<br/>";
      newDiv += "<b>topURL:" + "</b>" + topURL + "<br/>";
      newDiv += "<b>port:" + "</b>" + portName + "<br/>";
      newDiv += "<b>topFrame:" + "</b>" + topFrame + "<br/>";
      newDiv += "<b>iframeIndex:" + "</b>" + iframeIndex + "<br/>";

      for (var prop in eventInfo) {
        if (prop != "type") {
          newDiv += "<b>" + prop + ":" + "</b>" + eventInfo[prop] + "<br/>";
        }
      }
      newDiv += "</div>";
      $("#events").append(newDiv);
    },
    clearEvents: function _clearEvents() {
      $("#events").empty();
      $("#status").text(""); 
    },
    startRecording: function _startRecording() {
      $("#status").text("Recording");
    },
    stopRecording: function _stopRecording() {
      $("#status").text("Stopped");
    }
  };

  return Panel;
})();

var RecordReplay = (function RecordReplayClosure() {
  function RecordReplay(panel) {
    this.panel = panel;
    this.events = [];
    this.recording = false;
    this.replaying = false;
    this.workQueue = [];
  }

  RecordReplay.prototype = {
    startRecording: function _startRecording() {
      this.recording = true;
      this.panel.startRecording();

      // Tell the content scripts to begin recording
      sendToAll({type: "recording", value: this.recording});
    },
    stopRecording: function _stopRecording() {
      this.recording = false;
      this.panel.stopRecording();

      // Tell the content scripts to stop recording
      sendToAll({type: "recording", value: this.recording});
    },
    addEvent: function _addEvent(eventRequest, portName) {
      if (this.recording) {
        var events = this.events;
        var num = events.length;
        var id = "event" + num 
        
        var tab = portNameToTabId[portName];
        var portInfo = tabIdToCurrentPortInfo[tab]
        var topURL = portInfo.top.URL;
        
        var topFrame = false;
        var iframeIndex = -1;

        if (portInfo.top.portName == portName) {
          topFrame == true;
        } else {
          var frames = portInfo.frames;
          for (var i = 0, ii = frames.length; i < ii; ++i) {
            var frame = frames[i];
            if (frame.portName == portName) {
              iframeIndex = i;
              break;
            }
          }
        }
        var topFrame = (portInfo.top.portName == portName);

        var eventRecord = {msg: eventRequest, port: portName, topURL: topURL,
            topFrame: topFrame, iframeIndex: iframeIndex, tab: tab, num: num,
            id: id};
        events.push(eventRecord);

        this.panel.addEvent(eventRecord);
      }
    },
    clearEvents: function _clearEvents() {
      this.events = []
      this.panel.clearEvents();
    },
    sendEventNewTab: function _sendEventsNewTab(events, index, portMapping,
                                                tabMapping, tab) {
      var port = undefined;
      var e = events[index];
      var tabId = tab.id;
      
      if (tabId in tabIdToCurrentPortInfo) {
        var portInfo = tabIdToCurrentPortInfo[tabId];
        var newPort = null;
        if (e.topFrame) {
          port = ports[portInfo.top.portName];
        } else {
          var frames = portInfo.frames;
          //port = frames[e.iframeIndex].portName;
          for (var i = frames.length - 1; i >= 0; i--) {
            if (frames[i].URL == e.msg.value.URL) {
              port = ports[frames[i].portName];
              break;
            }
          }
          if (!port) {
            window.setTimeout(function() {
              sendEventNewTab(events, index, portMapping, tabMapping, tab);
            }, 1000);
            return;
          }
        }
      }
    
      if (typeof port == 'undefined') {
        window.setTimeout(function() {
          sendEventNewTab(events, index, portMapping, tabMapping, tab);
        }, 1000);
      } else {
        port.postMessage(e.msg);
        portMapping[e.port] = port;
        tabMapping[e.tab] = tabId;
    
        window.setTimeout(function() {
          replay(events, index + 1, portMapping, tabMapping);
        }, params.timeout);
      } 
    },
    replay: function _replay(events, index, portMapping, tabMapping) {
      if (index >= events.length)
        return;

      var e = events[index]
      var msg = e.msg;
      var port = e.port;
      var tab = e.tab;
      var id = e.id;
      var url = e.topURL;
      var topFrame = e.topFrame;
      var iframeIndex = e.iframeIndex;

      $("#status").text("Replay " + e.num);
      $("#" + id).get(0).scrollIntoView();
      //$("#container").scrollTop($("#" + e.id).prop("offsetTop"));

      console.log("background replay:", id, msg, port, tab);

      // we have already seen this port, reuse existing mapping
      if (port in portMapping) {
        try {
          portMapping[port].postMessage(msg);
        } catch(err) {
          console.log(err.message);
        }
       
        // console.log(portMapping[port]);

        window.setTimeout(function() {
          replay(events, index + 1, portMapping, tabMapping);
        }, params.timeout);
      // we have already seen this tab, find equivalent port for tab
      // for now we will just choose the last port added from this tab
      } else if (tab in tabMapping) {
        var newTabId = tabMapping[tab];
        var portInfo = tabIdToCurrentPortInfo[newTabId];
        var newPort = null;
        if (topFrame) {
          newPort = ports[portInfo.top.portName];
        } else {
          var frames = portInfo.frames;
          //newPort = frames[iframeIndex];
          for (var i = frames.length - 1; i >= 0; i--) {
            if (frames[i].URL == msg.value.URL) {
              newPort = ports[frames[i].portName];
              break;
            }
          }
          if (!newPort) {
            window.setTimeout(function() {
              replay(events, index, portMapping, tabMapping);
            }, 1000);
            return;
          }
        }

        newPort.postMessage(msg);
       
        portMapping[port] = newPort;

        window.setTimeout(function() {
          replay(events, index + 1, portMapping, tabMapping);
        }, params.timeout);
      } else {
        chrome.tabs.create({url: url, active: true}, 
            function(newTab) {
              sendEventNewTab(events, index, portMapping, tabMapping, newTab);
            }
        );
      }
    }
  };
  
  return RecordReplay;
})();

// Global variables
var numPorts = 0;
var ports = {}; 
var portNameToTabId = {};
var tabIdToPortNames = {};
var tabIdToCurrentPortInfo = {};

// Utility functions

var sendToAll = function(message) {
  for (var portName in ports) {
    ports[portName].postMessage(message);
  }
};

// The user started recording
var start = function _start() {
  console.log("start");
  recordReplay.startRecording();

  // Update the UI
  chrome.browserAction.setBadgeBackgroundColor({color:[255, 0, 0, 64]});
  chrome.browserAction.setBadgeText({text: "ON"});
};

// The user stopped recording
var stop = function _stop() {
  console.log("stop");
  recordReplay.stopRecording();

  // Update the UI
  chrome.browserAction.setBadgeBackgroundColor({color: [0, 0, 0, 0]});
  chrome.browserAction.setBadgeText({text: "OFF"});
};

// The first message content scripts send is to get a unique id
var handleIdMessage = function(request, sender, sendResponse) {
  console.log("background receiving:", request, "from", sender);
  if (request.type == "getId") {
    numPorts++;
    var portName = "" + numPorts
    sendResponse({type: "id", value: portName});

    // Update various mappings
    var tabId = sender.tab.id;

    portNameToTabId[portName] = tabId;
   
    if (typeof tabIdToPortNames[tabId] == "undefined") {
      tabIdToPortNames[tabId] = [];
    }
    tabIdToPortNames[tabId].push(portName);
    
    var value = request.value;
    value.portName = portName;
    if (value.top) {
      tabIdToCurrentPortInfo[tabId] = {top: value, frames: []};
    } else {
      var portInfo = tabIdToCurrentPortInfo[tabId];
      portInfo.frames.push(value);
    }
  }
};

// Route messages from the ports
var handleMessage = function(port, request) {
  if (request.type == "event") {
    console.log("background adding event");
    addEvent(request, port.name);
  } else if (request.type == "getRecording") {
    port.postMessage({type: "recording", value: recordReplay.recording});
  } else if (request.type == "getParams") {
    port.postMessage({type: "params", value: params});
  }
};

// Remove all the events
var resetEvents = function() {
  recordReplay.clearEvents();
};

// Add an event
var addEvent = function(eventRequest, portName) {
  recordReplay.addEvent(eventRequest, portName);
}

// Attach the event handlers to their respective events
chrome.extension.onMessage.addListener(handleIdMessage);

chrome.extension.onConnect.addListener(function(port) {
  console.log("background connecting:", port);
  var portName = port.name;

  ports[portName] = port;

  port.onMessage.addListener(function(msg) {
    handleMessage(port, msg);
  });

  port.onDisconnect.addListener(function(evt) {
    if (portName in ports) {
      delete ports[portName];
    } else {
      throw "Can't find port";
    }

    var tabId = portNameToTabId[portName];
    var portInfo = tabIdToCurrentPortInfo[tabId];
    if (portInfo.topFrame.portName == portName) {
      delete tabIdToCurrentPortInfo[tabId];
    } else {
      var frames = portInfo.frames;
      for (var i = 0, ii = frames.length; i < ii; ++i) {
        if (frames[i].portName == portName) {
          frames.splice(i, 1);
          break;
        }
      }
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

var panel = new Panel(); 
var recordReplay = new RecordReplay(panel);


sendToAll({type: "params", value: params});
stop();
