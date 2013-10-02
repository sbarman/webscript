/* -*- Mode: Java; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* vim: set shiftwidth=2 tabstop=2 autoindent cindent expandtab: */

'use strict';

// handles mapping between ports, tabs, iframes, etc
var PortManager = (function PortManagerClosure() {
  var portLog = getLog('ports');

  function PortManager() {
    this.numPorts = 0;
    this.ports = {};
    this.portNameToTabId = {};
    this.portNameToPortInfo = {};
    this.tabIdToPortNames = {};
    this.tabIdToCurrentPortInfo = {};
    this.portToSnapshot = {};
    this.tabIdToTab = {};
    this.ack = null;
  }

  PortManager.prototype = {
    sendToAll: function(message) {
      portLog.log('sending to all:', message);
      var ports = this.ports;
      for (var portName in ports) {
        ports[portName].postMessage(message);
      }
    },
    getTab: function(portName) {
      return this.portNameToTabId[portName];
    },
    getTabInfo: function(tab) {
      return this.tabIdToCurrentPortInfo[tab];
    },
    getTabFromTabId: function(tabId) {
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
    updateUrl: function(port, url) {
      this.portNameToPortInfo[port.name].URL = url;
    },
    getNewId: function(value, sender) {
      this.numPorts++;
      var portName = '' + this.numPorts;

      portLog.log('adding new id: ', portName, value);

      // Update various mappings
      var tabId = sender.tab.id;

      this.tabIdToTab[tabId] = sender.tab;
      this.portNameToTabId[portName] = tabId;
      this.portNameToPortInfo[portName] = value;

      var tabIdToPortNames = this.tabIdToPortNames;
      if (!(tabId in tabIdToPortNames))
        tabIdToPortNames[tabId] = [];

      tabIdToPortNames[tabId].push(portName);

      value.portName = portName;

      if (value.top) {
        this.tabIdToCurrentPortInfo[tabId] = {top: value, frames: []};
      } else {
        var tabIdToCurrentPortInfo = this.tabIdToCurrentPortInfo;

        if (!tabIdToCurrentPortInfo[tabId]) {
          portLog.error("can't find mapping in tabIdToCurrentPortInfo:", tabId);
          tabIdToCurrentPortInfo[tabId] = {top: null, frames: []};
        }
        var portInfo = tabIdToCurrentPortInfo[tabId];
        portInfo.frames.push(value);
      }
      return portName;
    },
    connectPort: function(port) {
      var portName = port.name;
      var ports = this.ports;

      ports[portName] = port;

      port.addMessageListener(function(msg) {
        handleMessage(port, msg);
      });

      var portManager = this;
      port.addDisconnectListener(function(evt) {
        portLog.log('disconnect port:', port);

        if (portName in ports) {
          delete ports[portName];
        } else {
          throw "Can't find port";
        }

        var tabIdToCurrentPortInfo = portManager.tabIdToCurrentPortInfo;
        var tabId = portManager.portNameToTabId[portName];
        var portInfo = portManager.tabIdToCurrentPortInfo[tabId];

        // the top level port might have already been disconnected which means
        // portInfo will be null
        // if (portInfo != undefined) {
          if (portInfo.top.portName == portName) {
            portInfo.top = null;
            // delete tabIdToCurrentPortInfo[tabId];
          } else {
            var frames = portInfo.frames;
            for (var i = 0, ii = frames.length; i < ii; ++i) {
              if (frames[i].portName == portName) {
                frames.splice(i, 1);
                break;
              }
            }
          }
        // }
      });
    },
    getAck: function() {
      return this.ack;
    },
    setAck: function(val) {
      portLog.log('set ack:', val);
      this.ack = val;
    },
    clearAck: function() {
      portLog.log('clear ack');
      this.ack = null;
    }
  };

  return PortManager;
})();

// handles user interface
var Panel = (function PanelClosure() {
  function Panel(controller) {
    this.controller = controller;

    this.loadParams();
    this.attachHandlers(controller);
    this.resize();

    var panel = this;
    controller.addListener(function(msg) {
      panel.controllerUpdate(msg); 
    });
  }

  Panel.prototype = {
    controllerUpdate: function _controllerUpdate(msg) {
      if ('event' in msg) {
        this.addEvent(msg.event);
      } else if ('status' in msg) {
        this.updateStatus(msg.status);
      } else if ('reset' in msg) {
        this.clearEvents();
      } else {
        throw "unknown controller update";
      }
    },
    attachHandlers: function _attachHandlers(controller) {
      $('#start').click(function(eventObject) {
        controller.start();
      });

      $('#stop').click(function(eventObject) {
        controller.stop();
      });

      $('#reset').click(function(eventObject) {
        controller.reset();
      });

      $('#capture').click(function(eventObject) {
        controller.capture();
      });

      $('#replay').click(function(eventObject) {
        controller.replayRecording();
      });

      $('#pause').click(function(eventObject) {
        controller.pause();
      });

      $('#restart').click(function(eventObject) {
        controller.restart();
      });

      $('#skip').click(function(eventObject) {
        controller.skip();
      });

      $('#resend').click(function(eventObject) {
        controller.resend();
      });

      $('#replayOne').click(function(eventObject) {
        controller.replayOne();
      });

      $('#paramsDiv').hide(1000);

      $('#paramsHide').click(function(eventObject) {
        $('#paramsDiv').toggle(1000);
      });

      $('#save').click(function(eventObject) {
        var name = $('#scriptname').prop('value');
        controller.saveScript(name);
      });

      $('#load').click(function(eventObject) {
        var name = $('#scriptname').prop('value');
        controller.getScript(name);
      });

      var panel = this;
      // when the form is submitted, the parameters should be dispatched to the
      // content scripts so that everything is kept in sync
      $('#params').change(function(eventObject) {
        panel.updateParams();
        return false;
      });
    },
    loadParams: function _loadParams() {
      // create a form based on parameters
      var loadParamForm = function(node, paramObject, prefix) {
        for (var param in paramObject) {
          var paramValue = paramObject[param];
          var paramType = typeof paramValue;
          var name = prefix + '.' + param;

          if (paramType == 'number') {
            var input = $('<input type=text name=' + name + '></input>');
            input.prop('value', paramValue);

            var newDiv = $('<div>' + param + '</div>');
            newDiv.append(input);
            node.append(newDiv);
          } else if (paramType == 'boolean') {
            var input = $('<input type=checkbox name=' + name + '></input>');
            input.prop('checked', paramValue);

            var newDiv = $('<div>' + param + '</div>');
            newDiv.append(input);
            node.append(newDiv);
          } else if (paramType == 'object') {
            var newDiv = $("<div class='boxed'></div>");
            newDiv.append('<div>' + param + '</div>');
            loadParamForm(newDiv, paramValue, name);
            node.append(newDiv);
          }
        }
      };

      var form = $('#params');
      loadParamForm(form, params, 'params');
    },
    updateParams: function _updateParams() {
      var obj = {};
      var inputs = $('#params').prop('elements');
      for (var i = 0, ii = inputs.length; i < ii; ++i) {
        var input = inputs[i];

        var val;
        if (input.type == 'checkbox') {
          val = input.checked;
        } else if (input.type == 'text') {
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
      this.controller.updateParams();
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

      newDiv += '<b>[' + id + ']type:' + '</b>' + eventInfo.type +
                '<br/>';
      newDiv += '<b>tab:' + '</b>' + tab + '<br/>';
      newDiv += '<b>topURL:' + '</b>' + topURL + '<br/>';
      newDiv += '<b>port:' + '</b>' + portName + '<br/>';
      newDiv += '<b>topFrame:' + '</b>' + topFrame + '<br/>';
      newDiv += '<b>iframeIndex:' + '</b>' + iframeIndex + '<br/>';
      newDiv += '<b>waitTime:' + '</b>' + waitTime + '<br/>';

      for (var prop in eventInfo) {
        if (prop != 'type') {
          newDiv += '<b>' + prop + ':' + '</b>' + eventInfo[prop] + '<br/>';
        }
      }
      newDiv += '</div>';
      $('#events').append(newDiv);
    },
    addMessage: function _addMessage(message) {
      var newDiv = $("<div class='message wordwrap'/>");
      newDiv.text(message);
      $('#messages').prepend(newDiv);
    },
    clearEvents: function _clearEvents() {
      $('#events').empty();
    },
    updateStatus: function _updateStatus(status) {
      $('#status').text(status);
    },
    resize: function _resize() {
      var total = $(window).height();
      var header = $('#headerDiv').outerHeight(true);
      var rest = total - header;
      var containerHeight = Math.round(.6 * rest);
      var messagesHeight = rest - containerHeight;

      $('#container').css('height', containerHeight + 'px');
      $('#messages').css('height', messagesHeight + 'px');
    }
  };

  return Panel;
})();

// handles recording of events from the content scripts
var Record = (function RecordClosure() {
  var recordLog = getLog('record');

  function Record(ports) {
    this.ports = ports;
    this.events = [];
    this.comments = [];
    this.commentCounter = 0;
    this.recordState = RecordState.STOPPED;
    // this.simultaneousReplayer = null;
    this.lastTime = 0;
    this.scriptId = null;
    this.capturing = false;

    this.listeners = [];
  }

  Record.prototype = {
    /*
    setSimultaneousReplayer: function(simultaneousReplayer) {
      this.simultaneousReplayer = simultaneousReplayer;
    },
    */
    addListener: function _addListener(callback) {
      this.listeners.push(callback);
    },
    updateListeners: function _updateListeners(msg) {
      var listeners = this.listeners;
      for (var i = 0, ii = listeners.length; i < ii; ++i) {
        listeners[i](msg);
      }
    },
    getStatus: function _getStatus() {
      return this.recordState;
    },
    updateStatus: function _updateStatus(newStatus) {
      if (this.recordState != newStatus) {
        this.recordState = newStatus;

        var text = "";
        if (newStatus == RecordState.RECORDING)
          text = 'Recording';
        else if (newStatus == RecordState.STOPPED)
          text = 'Stopped';
        else if (newStatus == RecordState.REPLAYING)
          text = 'Replaying';
        else
          throw "unknown status";
        this.updateListeners({status: text});
      }
    },
    startRecording: function _startRecording(replaying) {
      recordLog.log('starting record');
      if (replaying)
        this.updateStatus(RecordState.REPLAYING);
      else
        this.updateStatus(RecordState.RECORDING);

      // Tell the content scripts to begin recording
      this.ports.sendToAll({type: 'recording', value: this.getStatus()});
    },
    stopRecording: function _stopRecording() {
      recordLog.log('stopping record');
      this.updateStatus(RecordState.STOPPED);

      // Tell the content scripts to stop recording
      this.ports.sendToAll({type: 'updateDeltas', value: null});
      this.ports.sendToAll({type: 'recording', value: this.getStatus()});
    },
    captureNode: function _captureNode() {
      if (this.recordState == RecordState.RECORDING) {
        this.ports.sendToAll({type: 'capture', value: null});
        this.capturing = true;
      }
    },
    addComment: function _addComment(eventRequest, portName) {
      var value = eventRequest.value;
      var comment = {};
      comment.name = value.name;
      comment.value = value.value;

      recordLog.log('added comment:', comment, portName);

      var eventList = this.events;
      var commentList = this.comments;

      // order number is the index of the current event + some fraction
      comment.execution_order = (eventList.length - 1) + (0.01 * 
          (this.commentCounter + 1));
      commentList.push(comment)
      this.commentCounter += 1;
    },
    addEvent: function _addEvent(eventRequest, portName) {
      if (this.capturing && eventRequest.value.type == 'capture') {
        this.ports.sendToAll({type: 'cancelCapture', value: null});
        this.capturing = false;
      }

      var ports = this.ports;
      var tab = ports.getTab(portName);
      var portInfo = ports.getTabInfo(tab);
      // TODO: this is broken, maybe
      var topURL = portInfo.top.URL;

      /*
      // don't record this action if it's being generated by our simultaneous
      // replay
      var windowId = this.ports.getTabFromTabId(tab).windowId;
      if (windowId == this.simultaneousReplayer.twinWindow)
        return;
      */

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

      recordLog.log('added event:', eventRequest, portName, eventRecord);

      var recordState = eventRequest.value.recordState;

      var events = this.events;
      eventRecord.id = 'event' + events.length;

      this.events.push(eventRecord);
      this.updateListeners({event: eventRecord});

//      if (params.simultaneous)
//        this.simultaneousReplayer.simultaneousReplay(eventRecord);

      this.commentCounter = 0;
    },
    updateEvent: function _updateEvent(eventRequest, portName) {
      var updates = eventRequest.value;
      var pageEventId = updates.pageEventId;
      var recordState = updates.recording;

      recordLog.log('updating event:', updates, pageEventId);

      var events = this.events;

      for (var i = events.length - 1; i >= 0; --i) {
        var e = events[i];
        var msgValue = e.msg.value;
        if (e.port == portName && msgValue.pageEventId == pageEventId) {
          for (var key in updates) {
            msgValue[key] = updates[key];
          }
          break;
        }
      }

//      if (recordState == RecordState.RECORDING && params.simultaneous)
//        this.simultaneousReplayer.updateEvent(eventRequest, portName);
    },
    clearEvents: function _clearEvents() {
      this.scriptId = null;
      this.events = [];
      this.comments = [];

      this.updateListeners({reset: true});
      this.ports.sendToAll({type: 'reset', value: null});
    },
    getEvents: function _getEvents() {
      return jQuery.extend(true, [], this.events);
    },
    getComments: function _getComments() {
      return this.comments.slice(0);
    },
    setEvents: function _setEvents(events) {
      this.clearEvents();
      this.events = events;
      for (var i = 0, ii = events.length; i < ii; ++i) {
        this.updateListeners({event: events[i]});
      }
    },
    setScriptId: function _setScriptId(id) {
      this.scriptId = id;
    },
    getScriptId: function _getScriptId() {
      return this.scriptId;
    }
  };

  return Record;
})();

// Handles replaying scripts (not simulataneous)
var Replay = (function ReplayClosure() {
  var replayLog = getLog('replay');

  function Replay(ports, scriptServer) {
    this.ports = ports;
    this.scriptServer = scriptServer;
    this.record = new Record(ports);
    this.listeners = [];

    // replay variables
    this.reset();
  }

  Replay.prototype = {
    addListener: function _addListener(callback) {
      this.listeners.push(callback);
    },
    updateListeners: function _updateListeners(msg) {
      var listeners = this.listeners;
      for (var i = 0, ii = listeners.length; i < ii; ++i) {
        listeners[i](msg);
      }
    },
    replay: function _replay(events, scriptId, cont) {
      replayLog.log('starting replay');

      this.pause();
      this.reset();

      this.events = events;
      this.scriptId = scriptId;
      this.cont = cont;

      this.record.startRecording(true);
      this.ports.sendToAll({type: 'resetCompensation', value: null});
      this.replayState = ReplayState.REPLAYING;
      this.setNextTimeout();
    },
    reset: function _reset() {
      this.timeoutHandle = null;
      this.ackVar = null;
      this.index = 0;
      this.portMapping = {};
      this.tabMapping = {};
      this.replayState = ReplayState.STOPPED;
      this.timeoutInfo = {startTime: 0, index: -1};
      this.lastReplayPort = null;
      this.captures = [];
      this.scriptId = null;
      this.events = [];
      this.debug = [];
    },
    getStatus: function _getStatus() {
      return this.replayState;
    },
    setNextTimeout: function _setNextTimeout(time) {
      if (typeof time == 'undefined')
        time = this.getNextTime();

      var replay = this;
      this.timeoutHandle = setTimeout(function() {
        replay.guts();
      }, time);
    },
    getNextTime: function _getNextTime() {
      var timing = params.replaying.timingStrategy;

      var index = this.index;
      var events = this.events;
      var waitTime = 0;
       
      if (index < events.length) 
        var defaultTime = events[index].waitTime;
      else
        var defaultTime = 0

      if (defaultTime > 10000)
        defaultTime = 10000;

      if (index == 0 || index == events.length) {
        waitTime = 1000;
      } else if (timing == TimingStrategy.MIMIC) {
        waitTime = defaultTime
      } else if (timing == TimingStrategy.SPEED) {
        waitTime = 0;
      } else if (timing == TimingStrategy.SLOWER) {
        waitTime = defaultTime + 1000;
      } else if (timing == TimingStrategy.SLOWEST) {
        waitTime = defaultTime + 3000;
      } else if (timing == TimingStrategy.FIXED_1) {
        waitTime = 1000;
      } else if (timing == TimingStrategy.RANDOM_0_3) {
        waitTime = Math.round(Math.random() * 3000);
      } else if (timing == TimingStrategy.PERTURB_0_3) {
        waitTime = defaultTime + Math.round(Math.random() * 3000);
      } else {
        throw "unknown timing strategy";
      }
      replayLog.log('wait time:', waitTime);
      return waitTime;
    },
    markCascadingEvents: function _markCascadingEvents() {
      replayLog.log('marked cascading events');

      var events = this.events;
      var index = this.index;

      // we haven't started replay yet
      if (index == 0)
        return;

      var recordedEvents = this.record.getEvents();

      var lastExtGenEvent = -1;
      for (var i = recordedEvents.length - 1; i >= 0; --i) {
        var e = recordedEvents[i];
        var extGen = e.msg.value.extensionGenerated;

        if (extGen) {
          lastExtGenEvent = i;
          break;
        }
      }

      // no extension generated events recorded, so no cascading events exist
      if (lastExtGenEvent == -1)
        return;

      for (var i = lastExtGenEvent + 1, ii = recordedEvents.length,
               j = index, jj = events.length;
           i < ii && j < jj; ++i) {
        var r = recordedEvents[i].msg.value;
        var e = events[j].msg.value;

        if (r.type == e.type && r.target == e.target) {
          e.cascading = true;
          e.cascadingOrigin = index - 1;
          j++;
        }
      }
    },
    pause: function _pause() {
      var handle = this.timeoutHandle;
      if (handle) {
        clearTimeout(handle);
        this.timeoutHandle = null;
      }

      var port = this.lastReplayPort;
      if (port) {
        try {
          port.postMessage({type: 'pauseReplay', value: null});
        } catch (e) {
          replayLog.error('sending to a disconnected port:', e);
        }
      }
    },
    restart: function _restart() {
      if (this.timeoutHandle == null) {
        this.setNextTimeout(0);

        var replayState = this.replayState;
        if (replayState == ReplayState.REPLAY_ACK) {
          this.replayState = ReplayState.REPLAYING;
        } else if (replayState == ReplayState.REPLAY_ONE_ACK) {
          this.replayState == ReplayState.REPLAY_ONE;
        }
      }
    },
    replayOne: function _replayOne() {
      this.replayState = ReplayState.REPLAY_ONE;
      this.restart();
    },
    skip: function _skip() {
      this.index++;
      this.replayState = ReplayState.REPLAYING;
    },
    resend: function _resend() {
      if (this.replayState == ReplayState.REPLAY_ACK)
        this.replayState = ReplayState.REPLAYING;
    },
    addDebug: function _addDebug(msg) {
      this.debug.push(msg);
    },
    finish: function _finish(errorMsg) {
      replayLog.log('finishing replay');

      if (this.replayState == ReplayState.STOPPED)
        return;

      this.replayState = ReplayState.STOPPED;
      this.pause();

      if (errorMsg)
        this.addDebug('error:' + errorMsg);
      else
        this.addDebug('finished normally');

      var record = this.record;
      var replay = this;

      record.stopRecording();
      this.updateListeners({status: 'Finished'});

      var scriptServer = this.scriptServer;
      setTimeout(function() {
        var replayEvents = record.getEvents();
        var comments = record.getComments();
        var captures = replay.captures;
        var scriptId = replay.scriptId;

        if (params.replaying.saveReplay && scriptId &&
            replayEvents.length > 0) {
          scriptServer.saveCaptures(captures, scriptId);
          scriptServer.saveScript('replay ' + scriptId, replayEvents, comments,
                                  params, scriptId);
          replayLog.log('saving replay:', replayEvents);
        }
      }, 1000);

      if (this.cont) {
        var replay = this;
        setTimeout(function() {
          replay.cont(replay);
        }, 0);
      }
    },
    saveCapture: function _saveCapture(capture, scriptId) {
      replayLog.log('capture:', capture, scriptId);
      this.captures.push(capture);
    },
    findPortInTab: function _findPortInTab(tab, topFrame, snapshot, msg) {
      var ports = this.ports;
      var newTabId = this.tabMapping[tab];
      var portInfo = ports.getTabInfo(newTabId);
      replayLog.log('trying to find port in tab:', portInfo);

      if (!portInfo)
        return;

      var newPort = null;

      if (topFrame) {
        replayLog.log('assume port is top level page');
        var topFrame = portInfo.top;
        var commonUrl = lcs(topFrame.URL, msg.value.URL);

        var commonRatio = commonUrl.length / msg.value.URL.length;
        if (commonRatio > .8)
          newPort = ports.getPort(topFrame.portName);
      } else {
        replayLog.log('try to find port in one of the iframes');
        var frames = portInfo.frames;
        var urlFrames = [];
        for (var i = 0, ii = frames.length; i < ii; i++) {
          if (frames[i].URL == msg.value.URL) {
            urlFrames.push(frames[i]);
          }
        }

        if (urlFrames.length == 0) {
          this.addDebug('no iframes found for page')
          return;
        } else if (urlFrames.length == 1) {
          return ports.getPort(urlFrames[0].portName);
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
            if (typeof node1 != 'object' || typeof node2 != 'object') {
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
          };
          var topScore = -1;
          var index = -1;

          replayLog.warn('snapshots probably broken when finding correct ' +
                         'iframe', snapshot);

          for (var i = 0, ii = urlFrames.length; i < ii; ++i) {
            var score = similar(snapshot,
                                ports.getSnapshot(urlFrames[i].portName));
            if (score > topScore) {
              index = i;
              topScore = score;
            }
          }
          this.portToSnapshot = {};
          newPort = ports.getPort(urlFrames[index].portName);
        } else {
          for (var i = 0, ii = urlFrames.length; i < ii; i++) {
            var port = ports.getPort(urlFrames[i].portName);
            port.postMessage({type: 'snapshot', value: null});
          }
        }
      }
      replayLog.log('found port:', newPort);
      return newPort;
    },
    checkTimeout: function _checkTimeout() {
      var eventTimeout = params.replaying.eventTimeout;
      if (eventTimeout > 0) {
        var timeoutInfo = this.timeoutInfo;
        var curTime = new Date().getTime();

        // we havent changed events
        var index = this.index;
        if (timeoutInfo.index == index) {
          if (curTime - timeoutInfo.startTime > eventTimeout * 1000) {
            // lets call the end of this script
            replayLog.log('event ' + index + ' has timed out');
            this.finish('event ' + index + ' has timed out');
            return true;
          }
        } else {
          this.timeoutInfo = {startTime: curTime, index: index};
        }
      }
      return false;
    },
    guts: function _guts() {
      try {
        if (this.checkTimeout())
          return;

        var replayState = this.replayState;

        // check for acks
        if (replayState == ReplayState.WAIT_ACK) {
          var ackReturn = this.ports.getAck(this.ackVar);
          if (ackReturn != null && ackReturn == true) {
            this.replayState = ReplayState.REPLAYING;
            this.index++;
            this.setNextTimeout(0);

            replayLog.log('found wait ack');
            return;
          }
        } else if (replayState == ReplayState.REPLAY_ACK ||
                   replayState == ReplayState.REPLAY_ONE_ACK) {
          var ackReturn = this.ports.getAck(this.ackVar);
          // got ack
          if (ackReturn != null && ackReturn == true) {
            this.replayState = ReplayState.REPLAYING;
            this.index++;
            if (replayState == ReplayState.REPLAY_ACK)
              this.setNextTimeout();
            else
              this.pause();

            this.lastReplayPort = null;
            replayLog.log('found replay ack');
          // no ack, try again in one second
          } else {
            this.setNextTimeout(params.replaying.defaultWait);

            replayLog.log('continue waiting for replay ack');
          }
          return;
        }

        this.markCascadingEvents();

        var events = this.events;
        var index = this.index;
        var portMapping = this.portMapping;
        var tabMapping = this.tabMapping;

        if (index >= events.length) {
          this.addDebug('finished script');
          this.finish();
          return;
        }

        var e = events[index];
        var msg = e.msg;
        var port = e.port;
        var tab = e.tab;
        var id = e.id;
        var url = e.topURL;
        var topFrame = e.topFrame;
        var iframeIndex = e.iframeIndex;
        var snapshot = msg.value.snapshot;

        this.updateListeners({status: 'Replay ' + index});
        //$('#status').text('Replay ' + index);
        $('#' + id).get(0).scrollIntoView();

        replayLog.log('background replay:', id, msg, port, tab);

        // lets find the corresponding port
        var replayPort = null;
        // we have already seen this port, reuse existing mapping
        if (port in portMapping) {
          replayPort = portMapping[port];
          replayLog.log('port already seen', replayPort);

        // we have already seen this tab, find equivalent port for tab
        // for now we will just choose the last port added from this tab
        } else if (tab in tabMapping) {
          var newPort = this.findPortInTab(tab, topFrame, snapshot, msg);

          if (newPort) {
            portMapping[port] = newPort;
            replayPort = newPort;
            replayLog.log('tab already seen, found port:', replayPort);
          } else {
            this.setNextTimeout(params.replaying.defaultWait);
            replayLog.log('tab already seen, no port found');
            this.addDebug('tab already seen, no port found');
            return;
          }

        // need to open new tab
        } else {
          var replay = this;
          replayLog.log('need to open new tab');
          chrome.tabs.create({url: url, active: true},
            function(newTab) {
              replayLog.log('new tab opened:', newTab);
              var newTabId = newTab.id;
              replay.tabMapping[tab] = newTabId;
              replay.ports.tabIdToTab[newTabId] = newTab;
              replay.setNextTimeout(params.replaying.defaultWaitNewTab);
            }
          );
          return;
        }

        // we have hopefully found a matching port, lets dispatch to that port
        this.lastReplayPort = replayPort;

        var type = msg.value.type;

        try {
          if (replayState == ReplayState.WAIT_ACK) {
            var ackReturn = this.ports.getAck(this.ackVar);
            if (ackReturn == null || ackReturn != true) {
              replayPort.postMessage(msg);
              this.setNextTimeout(params.replaying.defaultWait);

              replayLog.log('continue waiting for wait ack');
            }
          } else if (replayState == ReplayState.REPLAYING ||
                     replayState == ReplayState.REPLAY_ONE) {
            this.ports.clearAck();
            if (type == 'wait') {
              replayPort.postMessage(msg);
              this.replayState = ReplayState.WAIT_ACK;
              this.setNextTimeout(0);

              replayLog.log('start waiting for wait ack');
            } else {
              // send message
              replayPort.postMessage(msg);
              replayLog.log('sent message', msg);
              if (replayState == ReplayState.REPLAYING)
                this.replayState = ReplayState.REPLAY_ACK;
              else
                this.replayState = ReplayState.REPLAY_ONE_ACK;

              replayLog.log('start waiting for replay ack');
              this.setNextTimeout(0);
            }
          } else {
            throw 'unknown replay state';
          }
        } catch (err) {
          replayLog.error('error:', err.message, err);
          if (err.message == 'Attempting to use a disconnected port object') {
            var strategy = params.replaying.brokenPortStrategy;
            if (strategy == BrokenPortStrategy.RETRY) {
              if (e.cascading) {
                this.index++;
                this.setNextTimeout(0);
              } else {
                // remove the mapping and try again
                this.addDebug('using disconnected port, removing and trying again');
                delete portMapping[port];
                this.setNextTimeout(0);
              }
            } else if (strategy == BrokenPortStrategey.SKIP) {
              // we probably navigated away from the page so lets skip all
              // events that use this same port
              while (index < events.length && events[index].port == port) {
                replayLog.log('skipping event:', index);
                ++index;
              }
              this.index = index;
              this.setNextTimeout(0);
            } else {
              throw "unknown broken port strategy";
            }
          } else {
            throw err;
          }
        }
      } catch (err) {
        replayLog.error('error:', err.message, err);
        this.finish(err.toString());
      }
    }
  };

  return Replay;
})();

/*
var SimultaneousReplay = (function SimultaneousReplayClosure() {
  function SimultaneousReplay(events, panels, ports) {
    Replay.call(this, events, panels, ports);
    this.twinWindow = null;
    this.portToTwinPortMapping = {};
    this.tabToTwinTabMapping = {};
  }


  var prototype = Object.create(Replay.prototype);
  SimultaneousReplay.prototype = prototype;

  prototype.simultaneousReplay = function _simultaneousReplay(e) {
    var recordReplay = this;
    this.timeoutHandle = setTimeout(function() {
      recordReplay.simultaneousReplayGuts(e);
    }, 0);
  };

  // update the events, used to add deltas
  prototype.updateEvent = function _updateEvent(eventRequest, portName) {
    var port = this.portToTwinPortMapping[portName];

    // if there is a corresponding port, then lets send the event update
    if (port)
      port.postMessage(eventRequest);
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
    if (desiredPort) {
      try {
        desiredPort.postMessage(msg);
      } catch (e) {
        console.log(e.message);
      }
    }
    //no twin port yet, but we have a twin tab
    else if (desiredTab) {
      var newPort = this.findPortInTab(desiredTab, e.topFrame,
                                             e.snapshot, e.msg);
      if (newPort) {
        this.portToTwinPortMapping[port] = newPort;
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
    else {
      if (!this.makingTab) {
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
      else {
        var replay = this;
        this.timeoutHandle = setTimeout(
          function() {
            //a tab is being made.  let's come back around soon
            replay.simultaneousReplayGuts(e);
          }, this.getNextTime()
        );
      }
    }
  };
  return SimultaneousReplay;
})();
*/

// Utility functions

var Controller = (function ControllerClosure() {
  var ctlLog = getLog('controllerLog');

  function Controller(record, replay, scriptServer, ports) {
    this.record = record;
    this.replay = replay;
    this.scriptServer = scriptServer;
    this.ports = ports;
    this.listeners = [];
  }

  Controller.prototype = {
    // The user started recording
    start: function() {
      ctlLog.log('start');
      if (params.simultaneous) {
        //make the window in which we will simulataneously replay events
        var record = this.record;
        chrome.windows.create({},
          function(newWin) {
            //let replay know where to simultaneously replay
            record.simultaneousReplayer.twinWindow = newWin.id;
            //start record
            record.startRecording();

            // Update the UI
            chrome.browserAction.setBadgeBackgroundColor(
                {color: [255, 0, 0, 64]});
            chrome.browserAction.setBadgeText({text: 'ON'});
          }
        );
      } else {
        this.record.startRecording();

        // Update the UI
        chrome.browserAction.setBadgeBackgroundColor({color: [255, 0, 0, 64]});
        chrome.browserAction.setBadgeText({text: 'ON'});
      }
    },
    stop: function() {
      ctlLog.log('stop');
      this.record.stopRecording();

      // Update the UI
      chrome.browserAction.setBadgeBackgroundColor({color: [0, 0, 0, 0]});
      chrome.browserAction.setBadgeText({text: 'OFF'});
    },
    reset: function() {
      ctlLog.log('reset');
      this.record.clearEvents();
    },
    capture: function() {
      ctlLog.log('capture');
      this.record.captureNode();
    },
    replayRecording: function _replayRecording(cont) {
      ctlLog.log('replay');
      this.stop();
      this.replay.pause();

      var record = this.record;
      var events = record.getEvents();
      
      this.replay.replay(record.getEvents(), record.getScriptId(), cont);
      return replay;
    },
    replayScript: function(scriptId, events, cont) {
      this.setEvents(scriptId, events);
      return this.replayRecording(cont);
    },
    pause: function() {
      this.replay.pause();
    },
    restart: function() {
      this.replay.restart();
    },
    skip: function() {
      this.replay.skip();
    },
    resend: function() {
      this.replay.resend();
    },
    replayOne: function() {
      this.replay.replayOne();
    },
    saveScript: function(name) {
      ctlLog.log('saving script');
      var events = this.record.getEvents();
      var comments = this.record.getComments();
      this.scriptServer.saveScript(name, events, comments, params);
    },
    getScript: function(name) {
      ctlLog.log('getting script');
      var controller = this;
      var events = this.scriptServer.getScript(name, true,
          function(scriptId, events, comments) {
            controller.setEvents(scriptId, events);
          });
    },
    setEvents: function(scriptId, events) {
      this.record.setEvents(events);
      this.record.setScriptId(scriptId);
    },
    saveCapture: function _saveCapture(capture) {
      var replay = this.replay;
      if (replay) {
        replay.saveCapture(capture);
      }
    },
    addDebug: function _addDebug(msg) {
      var replay = this.replay;
      if (replay) {
        replay.addDebug(msg);
      }
    },
    updateParams: function _updateParams() {
      this.ports.sendToAll({type: 'params', value: params});
    },
    addListener: function _addListener(callback) {
      this.listeners.push(callback);
      this.record.addListener(callback);
      this.replay.addListener(callback);
    }
  };

  return Controller;
})();

// Instantiate components
var ports = new PortManager();
var scriptServer = new ScriptServer(params.server);

var record = new Record(ports);
var replay = new Replay(ports, scriptServer);
var controller = new Controller(record, replay, scriptServer, ports);
var panel = new Panel(controller);

/*
var simultaneousReplayer = new SimultaneousReplay([], panel, ports);
record.setSimultaneousReplayer(simultaneousReplayer);
*/

// Add event handlers

var bgLog = getLog('background');
// The first message content scripts send is to get a unique id
function handleIdMessage(request, sender, sendResponse) {
  bgLog.log('background receiving:', request, 'from', sender);
  if (request.type == 'getId') {
    var portName = ports.getNewId(request.value, sender);
    sendResponse({type: 'id', value: portName});
  }
}

// Route messages from the ports
function handleMessage(port, request) {
  if (request.type == 'event') {
    if (request.state == RecordState.RECORDING)
      record.addEvent(request, port.name);
    else if (request.state == RecordState.REPLAYING)
      replay.record.addEvent(request, port.name);
  } else if (request.type == 'updateEvent') {
    if (request.state == RecordState.RECORDING)
      record.updateEvent(request, port.name);
    else if (request.state == RecordState.REPLAYING)
      replay.record.updateEvent(request, port.name);
  } else if (request.type == 'comment') {
    if (request.state == RecordState.RECORDING)
      record.addComment(request, port.name);
    else if (request.state == RecordState.REPLAYING)
      replay.record.addComment(request, port.name);
  } else if (request.type == 'saveCapture') {
    controller.saveCapture(request.value);
  } else if (request.type == 'message') {
    panel.addMessage('[' + port.name + '] ' + request.value);
  } else if (request.type == 'getRecording') {
    var recStatus = record.getStatus();
    var repStatus = replay.record.getStatus();

    if (recStatus == RecordState.RECORDING)
      port.postMessage({type: 'recording', value: recStatus});
    else if (repStatus == RecordState.REPLAYING)
      port.postMessage({type: 'recording', value: repStatus});
    else
      port.postMessage({type: 'recording', value: RecordState.STOPPED});
  } else if (request.type == 'getParams') {
    port.postMessage({type: 'params', value: params});
  } else if (request.type == 'snapshot') {
    ports.addSnapshot(port.name, request.value);
  } else if (request.type == 'ack') {
    ports.setAck(request.value);
    bgLog.log('got ack');
  } else if (request.type == 'url') {
    ports.updateUrl(port, request.value);
  } else if (request.type == 'debug') {
    controller.addDebug(request.value);
  }
}


// Attach the event handlers to their respective events
chrome.extension.onMessage.addListener(handleIdMessage);

chrome.extension.onConnect.addListener(function(port) {
  ports.connectPort(new Port(port));
});

// window is closed so tell the content scripts to stop recording and reset the
// extension icon
$(window).unload(function() {
  controller.stop();
  chrome.browserAction.setBadgeText({text: ''});
  chrome.extension.onMessage.removeListener(handleMessage);
});

$(window).resize(function() {
  panel.resize();
});

ports.sendToAll({type: 'params', value: params});
controller.stop();
