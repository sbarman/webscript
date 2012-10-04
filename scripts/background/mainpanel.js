/* -*- Mode: Java; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* vim: set shiftwidth=2 tabstop=2 autoindent cindent expandtab: */

'use strict';

var PortManager = (function PortManagerClosure() {
  function PortManager() {
    this.numPorts = 0;
    this.ports = {}; 
    this.portNameToTabId = {};
    this.tabIdToPortNames = {};
    this.tabIdToCurrentPortInfo = {};
    this.portToSnapshot = {}
  }
  
  PortManager.prototype = {
    sendToAll: function(message) {
      var ports = this.ports;
      for (var portName in ports) {
        ports[portName].postMessage(message);
      }
    },
    getTab: function(portName) {
      return this.portNameToTabId[portName];
    },
    getTabInfo: function(tab) {
      return this.tabIdToCurrentPortInfo[tab]
    },
    getPort: function(portName) {
      return this.ports[portName];
    },
    getSnapshot: function(portName) {
      return this.portToSnapshot[portName];
    },
    addSnapshot: function(name, snapshot) {
      this.portToSnapshot[name] = snapshot;
    },
    getNewId: function(value, sender) {
      this.numPorts++;
      var portName = "" + this.numPorts

      // Update various mappings
      var tabId = sender.tab.id;

      this.portNameToTabId[portName] = tabId;
     
      var tabIdToPortNames = this.tabIdToPortNames;
      if (!(tabId in tabIdToPortNames)) {
        tabIdToPortNames[tabId] = [];
      }
      tabIdToPortNames[tabId].push(portName);
      
      value.portName = portName;
      if (value.top) {
        this.tabIdToCurrentPortInfo[tabId] = {top: value, frames: []};
      } else {
        var portInfo = this.tabIdToCurrentPortInfo[tabId];
        portInfo.frames.push(value);
      }
      return portName;
    },
    connectPort: function(port) {
      var portName = port.name;
      var ports = this.ports;

      ports[portName] = port;
    
      port.onMessage.addListener(function(msg) {
        handleMessage(port, msg);
      });
    
      var portManager = this;
      port.onDisconnect.addListener(function(evt) {
        if (portName in ports) {
          delete ports[portName];
        } else {
          throw "Can't find port";
        }
    
        var tabIdToCurrentPortInfo = portManager.tabIdToCurrentPortInfo;
        var tabId = portManager.portNameToTabId[portName];
        var portInfo = portManager.tabIdToCurrentPortInfo[tabId];

        if (portInfo.top.portName == portName) {
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
    }
  };

  return PortManager;
})();

var ScriptServer = (function ScriptServerClosure() {
  function ScriptServer(server) {
    this.server = server;
  }

  ScriptServer.prototype = {
    saveScript: function _saveScript(name, events) {
      var server = this.server;
      var postMsg = {};
      postMsg["name"] = name;
      postMsg["user"] = "/api/v1/user/1/";
      postMsg["events"] = [];
      var req = $.ajax({
        success: function(data, textStatus, jqXHR) {
          console.log(data, jqXHR, textStatus);
          var scriptUrl = jqXHR.getResponseHeader("Location");
          console.log(scriptUrl);
     
          for (var i = 0, ii = events.length; i < ii; ++i) {
            var postMsg = {};
            var e = events[i];
            postMsg["dom_post_event_state"] = "";
            postMsg["dom_pre_event_state"] = "";
            postMsg["event_type"] = e.type;
            postMsg["execution_order"] = i;
            postMsg["parameters"] = [];
            postMsg["script"] = scriptUrl.substr(scriptUrl.indexOf("/api"));
            $.ajax({
              success: function(data, textStatus, jqXHR) {
                console.log(data, jqXHR, textStatus);
                var eventUrl = jqXHR.getResponseHeader("Location");
                console.log(eventUrl);
                for (var prop in e) {
                  var postMsg = {};
                  postMsg["name"] = prop;
                  postMsg["value"] = e[prop];
                  postMsg["event"] = eventUrl.substr(eventUrl.indexOf("/api"));
                  $.ajax({
                    complete: function(s, x) {
                      console.log(s, x);
                    },
                    contentType: "application/json",
                    data: JSON.stringify(postMsg),
                    dataType: "json",
                    processData: false,
                    type: "POST",
                    url: server + "parameter/",
                  });
                }
              },
              contentType: "application/json",
              data: JSON.stringify(postMsg),
              dataType: "json",
              processData: false,
              type: "POST",
              url: server + "event/",

            });
          }

        },
        contentType: "application/json",
        data: JSON.stringify(postMsg),
        dataType: "json",
        processData: false,
        type: "POST",
        url: server + "script/",
      });
      console.log(req);
    },
    getScript: function _getScript(name) {
    }
  };

  return ScriptServer;
})();

var Panel = (function PanelClosure() {
  function Panel(controller, ports) {
    this.controller = controller;
    this.ports = ports;

    this.loadParams();
    this.attachHandlers(controller);
  }

  Panel.prototype = {
    attachHandlers: function _attachHandlers(controller) {
      $("#start").click(function(eventObject) {
        controller.start();
      });
      
      $("#stop").click(function(eventObject) {
        controller.stop();
      });

      $("#reset").click(function(eventObject) {
        controller.reset();
      });
      
      $("#replay").click(function(eventObject) {
        controller.replayScript();
      });

      $("#pause").click(function(eventObject) {
        controller.pause();
      });

      $("#replayReset").click(function(eventObject) {
        controller.replayReset();
      });
      
      $("#paramsDiv").hide(1000);
      
      $("#paramsHide").click(function(eventObject) {
        $("#paramsDiv").toggle(1000);
      });

      $("#save").click(function(eventObject) {
        var name = $("#scriptname").prop("value");
        controller.saveScript(name);
      });
      
      var panel = this;
      // when the form is submitted, the parameters should be dispatched to the
      // content scripts so that everything is kept insync
      $("#params").submit(function(eventObject) {
        panel.updateParams();
        this.ports.sendToAll({type: "params", value: params});
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
      var window = eventRecord.window;
      
      //don't record this action if it's being generated by our simultaneous replay
      if (window==this.twinWindow) return;

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

var Record = (function RecordClosure() {
  function Record(ports) {
    this.ports = ports;
    this.events = [];
    this.recordState = RecordState.STOPPED;
  }

  var RecordState = {
    RECORDING: 0,
    STOPPED: 1
  };

  Record.prototype = {
    setPanel: function _setPanel(panel) {
      this.panel = panel;
    },
    isRecording: function _isRecording() {
      return this.recordState == RecordState.RECORDING;
    },
    startRecording: function _startRecording() {
      this.recordState = RecordState.RECORDING;
      this.panel.startRecording();

      // Tell the content scripts to begin recording
      this.ports.sendToAll({type: "recording", value: this.isRecording()});
    },
    stopRecording: function _stopRecording() {
      this.recordState = RecordState.STOPPED;
      this.panel.stopRecording();

      // Tell the content scripts to stop recording
      this.ports.sendToAll({type: "recording", value: this.isRecording()});
    },
    addEvent: function _addEvent(eventRequest, portName) {
      if (this.recordState == RecordState.RECORDING) {
        var events = this.events;
        var num = events.length;
        var id = "event" + num 
       
        var ports = this.ports; 
        var tab = ports.getTab(portName);
        var portInfo = ports.getTabInfo(tab);
        var topURL = portInfo.top.URL;
        var window = tab.windowId;
        
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
            id: id, window: window};

        this.events.push(eventRecord);
        this.panel.addEvent(eventRecord);
      }
    },
    clearEvents: function _clearEvents() {
      this.events = []
      this.panel.clearEvents();
    },
    getEvents: function _getEvents() {
      return this.events.slice(0);
    }
  };
  
  return Record;
})();

var Replay = (function ReplayClosure() {
  function Replay(events, panel, ports) {
    this.panel = panel;
    this.events = events;
    this.ports = ports;
    this.workQueue = [];
    this.timeoutHandle = null;
    this.twinWindow = null;

    // replay variables
    this.replayReset();
  }

  var ReplayState = {
    REPLAYING: 0,
    TABID: 1,
    STOPPED: 2
  }

  Replay.prototype = {
    replay: function _replay() {
      var replay = this;
      this.timeoutHandle = setTimeout(function() {
        replay.replayGuts();
      }, 0);
    },
    simultaneousReplay: function _simultaneousReplay(e) {
      var recordReplay = this;
      this.timeoutHandle = setTimeout(function() {
        recordReplay.simultaneousReplayGuts(e);
      }, 0);
    },
    replayReset: function _replayReset() {
      this.index = 0;
      this.portMapping = {};
      this.tabMapping = {};
      this.replayState = ReplayState.REPLAYING;
    },
    replayPause: function _replayPause() {
      clearTimeout(this.timeoutHandle);
    },
    replayFindPortInTab: function _replayFindPortInTab(tab, topFrame,
        snapshot, msg) {

      var ports = this.ports;
      var newTabId = this.tabMapping[tab];
      var portInfo = ports.getTabInfo(newTabId);
      if (!portInfo) {
        return;
      }
      var newPort = null;
      if (topFrame) {
        newPort = ports.getPort(portInfo.top.portName);
      } else {
        var frames = portInfo.frames;
        var urlFrames = [];
        for (var i = 0, ii = frames.length; i < ii; i++) {
          if (frames[i].URL == msg.value.URL) {
            urlFrames.push(frames[i]);
          }
        }
        
        var allFrameSnapshots = true;
        for (var i = 0, ii = urlFrames.length; i < ii; i++) {
          if (!ports.getSnapshot(urlFrames[i].portName)) {
            allFrameSnapshots = false;
            break;
          }
        }

        if (allFrameSnapshots) {
          var similar = function(node1, node2) {
            if (typeof node1 != "object" || typeof node2 != "object") {
              return 0;
            }
            var score = 0;
            var attr1 = node1.attr;
            var attr2 = node2.attr;
            for (var a in attr1) {
              if (a in attr2) {
                score++;
              }
            }
             
            var children1 = node1.children;
            var children2 = node2.children;
            var c1length = children1.length;
            var c2length = children2.length;
            if (c1length < c2length) {
              var length = c1length;
            } else {
              var length = c2length;
            }
            for (var i = 0; i < length; ++i) {
              score += similar(children1[i], children2[i]);
            }
            return score;
          }
          var topScore = -1;
          var index = -1;
          for (var i = 0, ii = urlFrames.length; i < ii; ++i) {
            var score = similar(snapshot,
                                ports.getSnapshot(urlFrames[i].portName));
            if (score > topScore) {
              index = i;
              topScore = score;
            }
          }
          newPort = ports[urlFrames[index].portName];
          portToSnapshot = {}; 
        } else {
          for (var i = 0, ii = urlFrames.length; i < ii; i++) {
            var port = ports.getPort(urlFrames[i].portName);
            port.postMessage({type: "snapshot", value: null});
          }
        }
      }
      return newPort;
    },
    replayGuts: function _replayGuts() {
      var events = this.events;
      var index = this.index;
      var portMapping = this.portMapping;
      var tabMapping = this.tabMapping;

      if (index >= events.length) {
        this.replayReset();
        return;
      }

      var e = events[index]
      var msg = e.msg;
      var port = e.port;
      var tab = e.tab;
      var id = e.id;
      var url = e.topURL;
      var topFrame = e.topFrame;
      var iframeIndex = e.iframeIndex;
      var snapshot = msg.value.snapshot;

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

        this.index++;
       
        var replay = this;
        this.timeoutHandle = setTimeout(function() {
          replay.replayGuts();
        }, params.timeout);

      // we have already seen this tab, find equivalent port for tab
      // for now we will just choose the last port added from this tab
      } else if (tab in tabMapping) {
        var newPort = this.replayFindPortInTab(tab, topFrame, snapshot, msg);

        if (newPort) {
          portMapping[port] = newPort;
          newPort.postMessage(msg);
        
          this.index++;

          var replay = this;
          this.timeoutHandle = setTimeout(function() {
            replay.replayGuts();
          }, params.timeout);
        } else {
          var replay = this;
          this.timeoutHandle = setTimeout(function() {
            replay.replayGuts();
          }, params.timeout);
        }
      // need to open new tab
      } else {
        var replay = this;
        chrome.tabs.create({url: url, active: true}, 
          function(newTab) {
            var newTabId = newTab.id;
            replay.tabMapping[tab] = newTabId;
            replay.timeoutHandle = setTimeout(function() {
              replay.replayGuts();
            }, 1000);
          }
        );
      }
    },
    
    simultaneousReplayGuts: function _simultaneousReplayGuts(e) {
      var portMapping = this.portMapping;
      var tabMapping = this.tabMapping;
      var tab = e.tab;
      
      var desiredIndex;
      (tab.index)?desiredIndex = tab.index:desiredIndex = 0;
      
      console.log("simultaneous replay should be in window", this.twinWindow, "and index", desiredIndex);
      
      var twinWindowId = this.twinWindow;
      var recordReplay = this;
      
      chrome.windows.getAll({populate : true}, function (windowList) {
        var desiredTab;
        for(var i=0;i<windowList.length;i++) {
          if (windowList[i].id == twinWindowId){
            var tabs = windowList[i].tabs;
            for(var j=0;j<tabs.length;j++){
              var tab = tabs[j];
              if (tab.index==desiredIndex){
                desiredTab = tab;
                break;
              }
            }
            break;
          }
        }
        recordReplay.simultaneousReplayGutsInTab(e,desiredTab);
      });
    },
  
    simultaneousReplayGutsInTab: function _simultaneousReplayGuts(e, desiredTab) {
      var portMapping = this.portMapping;
      var tabMapping = this.tabMapping;
      
      var msg = e.msg;
      var port = e.port;
      var tab = e.tab;
      var id = e.id;
      var url = e.topURL;
      var topFrame = e.topFrame;
      var iframeIndex = e.iframeIndex;
      var snapshot = msg.value.snapshot;

      console.log("simultaneous replay in tab:", id, msg, desiredTab);
      
      //to check if we already have a port for the tab in which we want
      // to play the event, we have to get the port for the tab we want
      // to use
      var desiredPort = tabIdToPortNames[desiredTab.id];
      
      console.log("msg", msg);
      
      // we have already seen this port, reuse existing mapping
      if (desiredPort in portMapping) {
        console.log("PORT IN MAPPING");
        try {
          portMapping[desiredPort].postMessage(msg);
        } catch(err) {
          console.log(err.message);
        }

       // we have already seen this tab, find equivalent port for tab
       // for now we will just choose the last port added from this tab
      } else if (desiredTab in tabMapping) {
        console.log("TAB IN MAPPING");
        if(desiredTab){
          var newPort = this.replayFindPortInTab(desiredTab, topFrame, snapshot, msg);
        }
        if (newPort) {
          console.log("NEW PORT");
          console.log(newPort);
          
          
          portMapping[newPort.name] = newPort;
          console.log("simultaneous replay in window", desiredTab.windowId, "and index", desiredTab.index);
          newPort.postMessage(msg);
        } else {
          console.log("NO NEW PORT");
          var recordReplay = this;
          this.timeoutHandle = setTimeout(function() {
            recordReplay.simultaneousReplayGutsInTab(e,desiredTab);
          }, params.timeout);
        }  
      } else {
        if (!this.makingTab){
          //prevent other events from making a new tab while one is
          //already being made, in case they want to make the same
          //tab
          this.makingTab = true;
          console.log("TAB NOT IN MAPPING");
          var desiredIndex;
          (tab.index)?desiredIndex = tab.index:desiredIndex = 0; 
          var recordReplay = this;
          chrome.tabs.create({windowId: this.twinWindow, active: true, index: desiredIndex, url:url}, 
            function(newTab) {	
              console.log("created new tab with url", url, "to replay event", e, "in tab", newTab);  
              var newTabId = newTab.id;
              recordReplay.tabMapping[newTab] = newTabId;
              this.makingTab = false;
              recordReplay.timeoutHandle = setTimeout(function() {
                recordReplay.simultaneousReplayGutsInTab(e,newTab);
              }, 1000);
            }
          );
        }
        else{
          var recordReplay = this;
          this.timeoutHandle = setTimeout(
            function() {
              recordReplay.simultaneousReplayGutsInTab(e,desiredTab);
            }, params.timeout);
        }
      }
    }
  };
  
  return Replay;
})();

// Utility functions

var Controller = (function ControllerClosure() {
  function Controller(record, scriptServer, ports) {
    this.record = record;
    this.scriptServer = scriptServer;
    this.ports = ports;
  }
  
  Controller.prototype = {
    setPanel: function(panel) {
      this.panel = panel;
    },
    // The user started recording
    start: function() {
      console.log("start");
      //make the window in which we will simulataneously replay events
      chrome.windows.create({}, 
        function(newWin) {
          //make a replay object to control our simultaneous replay
          var replay = new Replay(this.record.getEvents(), this.panel, this.ports);
          //let the panel know which window it sould ignore
          this.panel.twinWindow = newWin.id;
          //let replay know where to simultaneously replay
          this.replay.twinWindow = newWin.id;
          //start record
          this.record.startRecording();
          
          // Update the UI
          chrome.browserAction.setBadgeBackgroundColor({color:[255, 0, 0, 64]});
          chrome.browserAction.setBadgeText({text: "ON"});
        }
      );
    },
    stop: function() {
      console.log("stop");
      this.record.stopRecording();
    
      // Update the UI
      chrome.browserAction.setBadgeBackgroundColor({color: [0, 0, 0, 0]});
      chrome.browserAction.setBadgeText({text: "OFF"});
    },
    reset: function() {
      console.log("reset");
      this.record.clearEvents();
    },    
    replayScript: function() {
      console.log("replay");
      this.stop();
      var replay = new Replay(this.record.getEvents(), this.panel, this.ports);
      this.replay = replay;
      replay.replay();
    },
    pause: function() {
      this.replay.replayPause();
    },
    replayReset: function() {
      this.replay.replayReset();
    },
    saveScript: function(name) {
      console.log("saving script");
      var events = this.record.getEvents();
      this.scriptServer.saveScript(name, events); 
    }
  }

  return Controller;
})();

// Instantiate components
var ports = new PortManager();
var record = new Record(ports);
var scriptServer = new ScriptServer("http://localhost:8000/api/v1/");
var controller = new Controller(record, scriptServer, ports);
var panel = new Panel(controller, ports); 

controller.setPanel(panel);
record.setPanel(panel);

// Add event handlers

// The first message content scripts send is to get a unique id
function handleIdMessage(request, sender, sendResponse) {
  console.log("background receiving:", request, "from", sender);
  if (request.type == "getId") {
    var portName = ports.getNewId(request.value, sender)
    sendResponse({type: "id", value: portName});
  }
}

// Route messages from the ports
var handleMessage = function(port, request) {
  if (request.type == "event") {
    record.addEvent(request, port.name);
  } else if (request.type == "getRecording") {
    port.postMessage({type: "recording", value: record.isRecording()});
  } else if (request.type == "getParams") {
    port.postMessage({type: "params", value: params});
  } else if (request.type == "snapshot") {
    ports.addSnapshot(port.name, request.value);
  }
};


// Attach the event handlers to their respective events
chrome.extension.onMessage.addListener(handleIdMessage);

chrome.extension.onConnect.addListener(function(port) {
  ports.connectPort(port);
});

// window is closed so tell the content scripts to stop recording and reset the
// extension icon
$(window).unload( function() {
  controller.stop();
  chrome.browserAction.setBadgeText({text: ""});
  chrome.extension.onMessage.removeListener(handleMessage);
});

ports.sendToAll({type: "params", value: params});
controller.stop();
