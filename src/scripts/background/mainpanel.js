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
    this.portToSnapshot = {};
    this.tabIdToTab = {};
    this.ack = null;
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
    getTabFromTabId: function(tabId){
      return this.tabIdToTab[tabId];
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

      this.tabIdToTab[tabId]=sender.tab;
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
    },
    getAck: function() {
      return this.ack;
    },
    setAck: function(val) {
      this.ack = val;
    },
    clearAck: function() {
      this.ack = null;
    }
  };

  return PortManager;
})();

var ScriptServer = (function ScriptServerClosure() {
  function ScriptServer(server) {
    this.server = server;
  }

  ScriptServer.prototype = {
    saveEvents: function _saveEvents(isScriptEvent, parentId, events,
                                     comments) {
      var server = this.server;
      var eventUrl = isScriptEvent ? server + "event/" :
                                     server + "replay_event/";

      function saveEvent(i) {
        if (i >= events.length) {
          console.log("Done saving");
          return;
        }

        // need to create new scope to variables don't get clobbered
        var postMsg = {};
        var evtMsg = {};

        var e = events[i];
        var msgValue = e.msg.value;
        evtMsg["dom_post_event_state"] = JSON.stringify(msgValue.snapshotAfter);
        evtMsg["dom_pre_event_state"] = JSON.stringify(msgValue.snapshotBefore);
        evtMsg["event_type"] = msgValue.type;
        evtMsg["execution_order"] = i;

        var parameters = [];
        prop: for (var prop in e) {
          if (prop == "msg") {
            continue prop;
          }
          var propMsg = {};
          var val = e[prop];
          propMsg["name"] = "_" + prop;
          propMsg["value"] = JSON.stringify(val);
          propMsg["data_type"] = typeof val; 
          parameters.push(propMsg);
        }
        
        msgprop: for (var prop in msgValue) {
          if (prop == "snapshotBefore" || prop == "snapshotAfter") {
            continue msgprop;
          }
          var propMsg = {};
          var val = msgValue[prop];
          propMsg["name"] = prop;
          propMsg["value"] = JSON.stringify(val);
          propMsg["data_type"] = typeof val; 
          parameters.push(propMsg);
        }

        evtMsg["parameters"] = parameters;
        
        if (isScriptEvent) {
          postMsg["script_id"] = parentId;
        } else {
          postMsg["replay_id"] = parentId;
        }
        postMsg["events"] = [evtMsg];

        console.log("saving event:", postMsg);
        $.ajax({
          error: function(jqXHR, textStatus, errorThrown) {
            console.log("error saving event", jqXHR, textStatus, errorThrown);
          },
          success: function(data, textStatus, jqXHR) {
            console.log(data, jqXHR, textStatus);
            saveEvent(i + 1);
          },
          contentType: "application/json",
          data: JSON.stringify(postMsg),
          dataType: "json",
          processData: false,
          type: "POST",
          url: eventUrl,
        });
      }

      function saveComments() {
        if (!comments)
          return;

        var postMsg = {};
        var commentMsg = [];
        for (var i = 0, ii = comments.length; i < ii; ++i) {
          var comment = comments[i];
          if (isScriptEvent) {
            comment["script_id"] = parentId;
          } else {
            comment["replay_id"] = parentId;
          }
          commentMsg.push(comment);
        }

        postMsg["comments"] = commentMsg;
        console.log("saving comments:", postMsg);
        $.ajax({
          error: function(jqXHR, textStatus, errorThrown) {
            console.log("error comments", jqXHR, textStatus, errorThrown);
          },
          success: function(data, textStatus, jqXHR) {
            console.log(data, jqXHR, textStatus);
          },
          contentType: "application/json",
          data: JSON.stringify(postMsg),
          dataType: "json",
          processData: false,
          type: "POST",
          url: server + "comment/",
        });
      }

      saveEvent(0);
      saveComments(); 
    },
    saveReplay: function _saveReplay(events, comments, origScriptId) {
      if (events.length == 0)
        return;

      var scriptServer = this;
      var server = this.server;
      var postMsg = {};
      postMsg["script_id"] = origScriptId
      postMsg["user"] = {username: "shaon"};
      postMsg["events"] = [];
      console.log("saving replay:", postMsg);

      var req = $.ajax({
        error: function(jqXHR, textStatus, errorThrown) {
          console.log("error saving replay:", jqXHR, textStatus, errorThrown);
        },
        success: function(data, textStatus, jqXHR) {
          console.log(data, jqXHR, textStatus);

          var replayId = data.id;
          scriptServer.saveEvents(false, replayId, events, comments);
        },
        contentType: "application/json",
        data: JSON.stringify(postMsg),
        dataType: "json",
        processData: false,
        type: "POST",
        url: server + "replay/",
      });
      console.log(req);
    },
    saveScript: function _saveScript(name, events, comments) {
      if (events.length == 0)
        return;

      var scriptServer = this;
      var server = this.server;
      var postMsg = {};
      postMsg["name"] = name;
      postMsg["user"] = {username: "shaon"};
      postMsg["events"] = [];
      console.log("saving script:", postMsg);

      var req = $.ajax({
        error: function(jqXHR, textStatus, errorThrown) {
          console.log("error saving script", jqXHR, textStatus, errorThrown);
        },
        success: function(data, textStatus, jqXHR) {
          console.log(data, jqXHR, textStatus);

          var scriptId = data.id;
          scriptServer.saveEvents(true, scriptId, events, comments);
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
    getScript: function _getScript(name, controller) {
      var server = this.server;
      $.ajax({
        error: function(jqXHR, textStatus, errorThrown) {
          console.log(jqXHR, textStatus, errorThrown);
        },
        success: function(data, textStatus, jqXHR) {
          console.log(data, textStatus, jqXHR);
          var scripts = data;
          if (scripts.length != 0) {
            var script = scripts[0];
            for (var i = 0, ii = scripts.length; i < ii; ++i) {
              var s = scripts[i];
              if (parseInt(script.id) < parseInt(s.id)) {
                script = s;
              }
            }
            var events = [];
            var serverEvents = script.events.sort(function(a,b) {
              return a.execution_order - b.execution_order;
            });

            for (var i = 0, ii = serverEvents.length; i < ii; ++i) {
              var e = serverEvents[i];
              var serverParams = e.parameters;
              var event = {}
              event.msg = {type: "event", value: {}};

              var msgValue = event.msg.value;
              msgValue.snapshotBefore = JSON.parse(e.dom_pre_event_state);
              msgValue.snapshotAfter = JSON.parse(e.dom_post_event_state);

              for (var j = 0, jj = serverParams.length; j < jj; ++j) {
                var p = serverParams[j];
                if (p.name.charAt(0) == '_') {
                  event[p.name.slice(1)] = JSON.parse(p.value);
                } else {
                  msgValue[p.name] = JSON.parse(p.value);
                }
              }
              events.push(event);
            }
            controller.setLoadedEvents(script.id, events);
          }
        },
        url: server + "script/" + name + "/?format=json",
        type: 'GET',
        processData: false,
        accepts: 'application/json',
        dataType: 'json'
      })
      return [];
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

      $("#restart").click(function(eventObject) {
        controller.restart();
      });
      
      $("#paramsDiv").hide(1000);
      
      $("#paramsHide").click(function(eventObject) {
        $("#paramsDiv").toggle(1000);
      });

      $("#save").click(function(eventObject) {
        var name = $("#scriptname").prop("value");
        controller.saveScript(name);
      });

      $("#load").click(function(eventObject) {
        var name = $("#scriptname").prop("value");
        controller.getScript(name);
      });
      
      var panel = this;
      // when the form is submitted, the parameters should be dispatched to the
      // content scripts so that everything is kept insync
      $("#params").submit(function(eventObject) {
        panel.updateParams();
        panel.ports.sendToAll({type: "params", value: params});
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

        var cur = params;
        for (var j = 1, jj = names.length - 1; j < jj; ++j) {
          var key = names[j];
          if (!(key in cur)) {
            cur[key] = {};
          }
          cur = cur[key];
        }
        cur[names[names.length - 1]] = val;
      }
    },
    addEvent: function _addEvent(eventRecord) {
      var eventInfo = eventRecord.msg.value;
      var id = eventRecord.id;
      var tab = eventRecord.tab;
      var topURL = eventRecord.topURL;
      var portName = eventRecord.port;
      var topFrame = eventRecord.topFrame;
      var iframeIndex = eventRecord.iframeIndex;
      var waitTime = eventRecord.waitTime;  


      var newDiv = "<div class='event wordwrap' id='" + id + "'>";

      newDiv += "<b>[" + id + "]type:" + "</b>" + eventInfo.type + 
                "<br/>";
      newDiv += "<b>tab:" + "</b>" + tab + "<br/>";
      newDiv += "<b>topURL:" + "</b>" + topURL + "<br/>";
      newDiv += "<b>port:" + "</b>" + portName + "<br/>";
      newDiv += "<b>topFrame:" + "</b>" + topFrame + "<br/>";
      newDiv += "<b>iframeIndex:" + "</b>" + iframeIndex + "<br/>";
      newDiv += "<b>waitTime:" + "</b>" + waitTime + "<br/>";

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
    this.comments = [];
    this.replayEvents = [];
    this.replayComments = [];
    this.commentCounter = 0;
    this.recordState = RecordState.STOPPED;
    this.simultaneousReplayer = null;
    this.lastTime = 0;
    this.loadedScriptId = null;
  }

  var RecordState = {
    RECORDING: 0,
    STOPPED: 1,
    REPLAYING: 2
  };

  Record.prototype = {
    setPanel: function _setPanel(panel) {
      this.panel = panel;
    },
    setSimultaneousReplayer: function(simultaneousReplayer){
      this.simultaneousReplayer = simultaneousReplayer;
    },
    isRecording: function _isRecording() {
      var recordState = this.recordState;
      return recordState == RecordState.RECORDING || 
             recordState == RecordState.REPLAYING;
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
    startReplayRecording: function _startReplayRecording() {
      if (this.loadedScriptId != null) {
        this.recordState = RecordState.REPLAYING;
      } else {
        this.recordState = RecordState.STOPPED;
      }
      this.replayEvents = [];
      this.replayComments = [];
      this.commentCounter = 0;
      this.ports.sendToAll({type: "recording", value: this.isRecording()});
    },
    stopReplayRecording: function _stopReplayRecording() {
      this.stopRecording();
    },
    addComment: function _addComment(eventRequest, portName) {
      var value = eventRequest.value;
      var comment = {};
      comment.name = value.name;
      comment.value = value.value;

      if (this.recordState == RecordState.RECORDING) {
        comment.execution_order = this.events.length + (0.01 * 
            (this.commentCounter + 1));
        this.comments.push(comment);
      } else if (this.recordState == RecordState.REPLAYING) {
        comment.execution_order = this.replayEvents.length + (0.01 * 
            (this.commentCounter + 1));
        this.replayComments.push(comment);
      }   
      this.commentCounter += 1;
    },
    addEvent: function _addEvent(eventRequest, portName) {
      var ports = this.ports; 
      var tab = ports.getTab(portName);
      var portInfo = ports.getTabInfo(tab);
      var topURL = portInfo.top.URL;
      
      // don't record this action if it's being generated by our simultaneous
      // replay
      var window = this.ports.getTabFromTabId(tab).windowId;
      if (window==this.simultaneousReplayer.twinWindow) {return};
      
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
      
      var time = eventRequest.value.timeStamp;
      var lastTime = this.lastTime;
      if (lastTime == 0) {
        var waitTime = 0;
      } else {
        var waitTime = time - lastTime;
      }
      this.lastTime = time;

      var eventRecord = {msg: eventRequest, port: portName, topURL: topURL,
          topFrame: topFrame, iframeIndex: iframeIndex, tab: tab,
          waitTime: waitTime};
      
      if (this.recordState == RecordState.RECORDING) {
        this.loadedScriptId = null;

        var events = this.events;
        eventRecord.id = "event" + events.length;

        this.events.push(eventRecord);
        this.panel.addEvent(eventRecord);
        if(params.simultaneous){
          this.simultaneousReplayer.simultaneousReplay(eventRecord);
        }
      } else if (this.recordState == RecordState.REPLAYING) {
        var replayEvents = this.replayEvents;
        eventRecord.id = "event" + replayEvents.length;

        replayEvents.push(eventRecord);
      }
      this.commentCounter = 0;
    },
    clearEvents: function _clearEvents() {
      this.loadedScriptId = null;
      this.events = [];
      this.comments = [];
      this.panel.clearEvents();
    },
    getEvents: function _getEvents() {
      return this.events.slice(0);
    },
    getReplayEvents: function _getReplayEvents() {
      return this.replayEvents.slice(0);
    },
    getComments: function _getComments() {
      return this.comments.slice(0);
    },
    getReplayComments: function _getReplayComments() {
      return this.replayComments.slice(0);
    },
    setEvents: function _setEvents(events) {
      this.loadedScriptId = null;
      this.events = events;
      this.comments = [];
      this.panel.clearEvents();
      for (var i = 0, ii = events.length; i < ii; ++i) {
        this.panel.addEvent(events[i]);
      }
    },
    setLoadedScriptId: function _setLoadedScriptId(id) {
      this.loadedScriptId = id;
    },
    getLoadedScriptId: function _getLoadedScriptId() {
      return this.loadedScriptId;
    }
  };
  
  return Record;
})();

var Replay = (function ReplayClosure() {
  function Replay(events, panel, ports, record, scriptServer) {
    this.panel = panel;
    this.events = events;
    this.ports = ports;
    this.timeoutHandle = null;
    this.record = record;
    this.scriptServer = scriptServer;
    this.ackVar = null;

    // replay variables
    this.reset();
  }

  var ReplayState = {
    REPLAYING: 1,
    REPLAY_ACK: 2,
    WAIT_ACK: 3
  }

  Replay.prototype = {
    replay: function _replay() {
      this.record.startReplayRecording();

      var replay = this;
      this.timeoutHandle = setTimeout(function() {
        replay.guts();
      }, this.getNextTime());
    },
    reset: function _reset() {
      this.index = 0;
      this.portMapping = {};
      this.tabMapping = {};
      this.replayState = ReplayState.REPLAYING;
    },
    setNextEvent: function _setNextEvent(time) {
      if (typeof time == "undefined") {
        time = this.getNextTime();
      }

      var replay = this;
      this.timeoutHandle = setTimeout(function() {
        replay.guts();
      }, time);
    },
    getNextTime: function _getNextTime() {
      var timing = params.timing;
      var index = this.index;
      var events = this.events;

      if (index == 0 || index == events.length)
        return 0;

      if (timing == 0) {
        var waitTime = events[index].waitTime;
        if (waitTime > 10000)
          waitTime = 10000;

        return waitTime;
      } else {
        return timing;
      }
    },
    pause: function _pause() {
      clearTimeout(this.timeoutHandle);
      this.timeoutHandle = null;
    },
    restart: function _restart() {
      if (this.timeoutHandle == null) {
        this.setNextEvent(0);
      }
    },
    finish: function _finish() {
      var record = this.record;
      var scriptServer = this.scriptServer;
      setTimeout(function() {
        var replayEvents = record.getReplayEvents();
        var comments = record.getReplayComments();
        var scriptId = record.getLoadedScriptId();

        record.stopReplayRecording();

        if (scriptId && replayEvents.length > 0) {
          scriptServer.saveReplay(replayEvents, comments, scriptId);
          console.log(replayEvents);
        }
      }, 1000);
    },
    findPortInTab: function _findPortInTab(tab, topFrame,
        snapshot, msg) {

      var ports = this.ports;
      var newTabId = this.tabMapping[tab];
      var portInfo = ports.getTabInfo(newTabId);
      if (!portInfo) {
        return;
      }
      var newPort = null;
      if (topFrame) {
        var topFrame = portInfo.top;
        if (topFrame.URL == msg.value.URL)
          newPort = ports.getPort(topFrame.portName);
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
    guts: function _guts() {
      var events = this.events;
      var index = this.index;
      var portMapping = this.portMapping;
      var tabMapping = this.tabMapping;

      if (index >= events.length) {
        this.finish();
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

      $("#status").text("Replay " + index);
      $("#" + id).get(0).scrollIntoView();
      //$("#container").scrollTop($("#" + e.id).prop("offsetTop"));

      console.log("background replay:", id, msg, port, tab);

      // lets find the corresponding port
      var replayPort = null;
      // we have already seen this port, reuse existing mapping
      if (port in portMapping) {
        replayPort = portMapping[port];

      // we have already seen this tab, find equivalent port for tab
      // for now we will just choose the last port added from this tab
      } else if (tab in tabMapping) {
        var newPort = this.findPortInTab(tab, topFrame, snapshot, msg);

        if (newPort) {
          portMapping[port] = newPort;
          replayPort = newPort;
        } else {
          this.setNextEvent();
          return;
        }

      // need to open new tab
      } else {
        var replay = this;
        chrome.tabs.create({url: url, active: true}, 
          function(newTab) {
            var newTabId = newTab.id;
            replay.tabMapping[tab] = newTabId;
            replay.ports.tabIdToTab[newTabId] = newTab;
            replay.setNextEvent(1000);
          }
        );
        return;
      }

      // we have hopefully found a matching port, lets dispatch to that port
      var type = msg.value.type;
      var replayState = this.replayState;

      if (replayState == ReplayState.WAIT_ACK) {
        var ackReturn = this.ports.getAck(this.ackVar);
        if (ackReturn != null && ackReturn == true) {
          this.replayState = ReplayState.REPLAYING;
          this.setNextEvent(0); 
        } else {
          replayPort.postMessage(msg);
          this.setNextEvent(1000); 
        }
      } else if (replayState == ReplayState.REPLAY_ACK) {
        var ackReturn = this.ports.getAck(this.ackVar);
        if (ackReturn != null && ackReturn == true) {
          this.replayState = ReplayState.REPLAYING;
          this.setNextEvent(0);
        } else {
          this.setNextEvent(1000); 
        }
      } else if (replayState == ReplayState.REPLAYING) {
        this.ports.clearAck();
        if (type == "wait") {
          replayPort.postMessage(msg);
          this.index++;
          this.replayState = ReplayState.WAIT_ACK;
          this.setNextEvent(0); 
        } else {
          // send message 
          try {
            replayPort.postMessage(msg);
            this.index++;
            this.replayState = ReplayState.REPLAY_ACK;
          } catch(err) {
            console.log("Error:", err.message);
          }
          this.setNextEvent();
        }
      } else {
        throw "unknown replay state"
      }
    },
  };
  
  return Replay;
})();


var SimultaneousReplay = (function SimultaneousReplayClosure() {
  function SimultaneousReplay(events, panels, ports) {
    Replay.call(this, events, panels, ports);
    this.twinWindow = null;
    this.portToTwinPortMapping={};
    this.tabToTwinTabMapping={};
  }
  
  SimultaneousReplay.prototype = Object.create(Replay.prototype);
  var prototype = SimultaneousReplay.prototype;

  prototype.simultaneousReplay = function _simultaneousReplay(e) {
    var recordReplay = this;
    this.timeoutHandle = setTimeout(function() {
      recordReplay.simultaneousReplayGuts(e);
    }, 0);
  };

  //this function should find the tab that corresponds to the tab
  //in which the event was originally played
  prototype.simultaneousReplayGuts = function _simultaneousReplayGuts(e) {
    var port = e.port;
    var tab = e.tab;
    var replay = this;
    var msg = e.msg;
    
    var desiredPort = this.portToTwinPortMapping[port];
    var desiredTab = this.tabToTwinTabMapping[tab];
    //we've already found an appropriate twin port, stored in mapping
    if(desiredPort){
      try {
        desiredPort.postMessage(msg);
      } catch(err) {
        console.log(err.message);
      }
    }
    //no twin port yet, but we have a twin tab
    else if(desiredTab){
      var newPort = this.findPortInTab(desiredTab, e.topFrame,
                                             e.snapshot, e.msg);
      if (newPort) {
        this.portToTwinPortMapping[port]=newPort;
        newPort.postMessage(msg);
      } else {
        var replay = this;
        this.timeoutHandle = setTimeout(function() {
          replay.simultaneousReplayGuts(e);
        }, this.getNextTime());
      }
    }
    //we haven't made a tab to correspond to the source tab
    //make one now...as long as we're not already in the process of
    //making a tab
    else{
      if(!this.makingTab){
        //prevent other events from making a new tab while one is
        //already being made, in case they want to make the same
        //tab
        this.makingTab = true;
        chrome.tabs.create({windowId: this.twinWindow, url: e.topURL,
                           active: true}, 
          function(newTab) {
            var newTabId = newTab.id;
            replay.tabToTwinTabMapping[tab] = newTab;
            replay.tabMapping[newTab] = newTabId;
            replay.ports.tabIdToTab[newTabId] = newTab;
            replay.makingTab = false;
            replay.timeoutHandle = setTimeout(function() {
              replay.simultaneousReplayGuts(e);
            }, 1000);
          }
        );
      }
      else{
        var replay = this;
        this.timeoutHandle = setTimeout(
          function() {
            //a tab is being made.  let's come back around soon
            replay.simultaneousReplayGuts(e);
          }, this.getNextTime());
      }
    }
  };
  return SimultaneousReplay;
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
      console.log("setting the controller's panel");
    },
    // The user started recording
    start: function() {
      console.log("start");
      if (params.simultaneous){
        //make the window in which we will simulataneously replay events
        var panel = this.panel;
        var record = this.record;
        chrome.windows.create({}, 
          function(newWin) {
            //let the panel know which events it shoudn't record
            panel.twinWindow = newWin.id;
            //let replay know where to simultaneously replay
            record.simultaneousReplayer.twinWindow = newWin.id;
            //start record
            record.startRecording();
            
            // Update the UI
            chrome.browserAction.setBadgeBackgroundColor({color:[255, 0, 0, 64]});
            chrome.browserAction.setBadgeText({text: "ON"});
          }
        );
      }
      else{
        this.record.startRecording();

        // Update the UI
        chrome.browserAction.setBadgeBackgroundColor({color:[255, 0, 0, 64]});
        chrome.browserAction.setBadgeText({text: "ON"});
      }
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

      var record = this.record;
      var events = record.getEvents();
      var replay = new Replay(events, this.panel, this.ports, record,
                              this.scriptServer);
      this.replay = replay;
      replay.replay();
    },
    pause: function() {
      this.replay.pause();
    },
    restart: function() {
      this.replay.restart();
    },
    saveScript: function(name) {
      console.log("saving script");
      var events = this.record.getEvents();
      var comments = this.record.getComments();
      this.scriptServer.saveScript(name, events, comments); 
    },
    getScript: function(name) {
      console.log("getting script");
      var events = this.scriptServer.getScript(name, this);
    },
    setLoadedEvents: function(scriptId, events) {
      this.record.setEvents(events);
      this.record.setLoadedScriptId(scriptId);
    }
  }

  return Controller;
})();

// Instantiate components
var ports = new PortManager();
var record = new Record(ports);
//var scriptServer = new ScriptServer("http://localhost:8000/api/");
//var scriptServer = new ScriptServer("http://webscriptdb.herokuapp.com/api/");
var scriptServer = new ScriptServer(params.server);
var controller = new Controller(record, scriptServer, ports);
var panel = new Panel(controller, ports); 

controller.setPanel(panel);
record.setPanel(panel);

var simultaneousReplayer = new SimultaneousReplay([],panel,ports);
record.setSimultaneousReplayer(simultaneousReplayer);

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
  } else if (request.type == "comment") {
    record.addComment(request, port.name);
  } else if (request.type == "getRecording") {
    port.postMessage({type: "recording", value: record.isRecording()});
  } else if (request.type == "getParams") {
    port.postMessage({type: "params", value: params});
  } else if (request.type == "snapshot") {
    ports.addSnapshot(port.name, request.value);
  } else if (request.type == "ack") {
    ports.setAck(request.value);
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
