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
    this.tabIdToTabInfo = {};
    this.portToSnapshot = {};
    this.tabIdToTab = {};
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
      var tabInfo = this.tabIdToTabInfo[tab];
      var ret = {};
      ret.frames = tabInfo.frames;

      var topFrames = tabInfo.top;
      if (topFrames.length > 0)
        ret.top = topFrames[topFrames.length - 1];

      return ret;
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
      // for some reason, the start page loads the content script but doesn't
      // have a tab id. in this case, don't assign an id
      if (!sender.tab) {
        portLog.log('request for new id without a tab id');
        return;
      }

      this.numPorts++;
      var portName = '' + this.numPorts;

      portLog.log('adding new id: ', portName, value);

      // Update various mappings
      var tabId = sender.tab.id;

      this.tabIdToTab[tabId] = sender.tab;
      this.portNameToTabId[portName] = tabId;
      this.portNameToPortInfo[portName] = value;
      value.portName = portName;

      var portNames = this.tabIdToPortNames[tabId];
      if (!portNames) {
        portNames = [];
        this.tabIdToPortNames[tabId] = portNames;
      }
      portNames.push(portName);

      var tabInfo = this.tabIdToTabInfo[tabId];
      if (!tabInfo) {
        tabInfo = {top: [], frames: []};
        this.tabIdToTabInfo[tabId] = tabInfo;
      }
      if (value.top) {
        tabInfo.top.push(value);
      } else {
        tabInfo.frames.push(value);
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

        var portInfo = portManager.portNameToPortInfo[portName];
        var tabId = portManager.portNameToTabId[portName];
        var tabInfo = portManager.tabIdToTabInfo[tabId];

        var frames;
        if (portInfo.top)
          var frames = tabInfo.top;
        else
          var frames = tabInfo.frames;

        var removed = false;
        for (var i = 0, ii = frames.length; i < ii; ++i) {
          if (frames[i].portName == portName) {
            frames.splice(i, 1);
            removed = true;
            break;
          }
        }

        if (!removed)
          throw "Can't find frame in tabInfo";
      });
    },
  };

  return PortManager;
})();

// handles recording of events from the content scripts
var Record = (function RecordClosure() {
  var recordLog = getLog('record');

  function Record(ports) {
    this.ports = ports;
    this.recordState = RecordState.STOPPED;
    this.listeners = [];

    this.reset();
  }

  Record.prototype = {
    reset: function _reset() {
      this.scriptId = null;
      this.events = [];
      this.comments = [];
      this.commentCounter = 0;
      this.lastTime = 0;
      this.capturing = false;

      this.updateListeners({reset: true});
      this.ports.sendToAll({type: 'reset', value: null});
    },
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

        var text = '';
        if (newStatus == RecordState.RECORDING)
          text = 'Recording';
        else if (newStatus == RecordState.STOPPED)
          text = 'Stopped';
        else if (newStatus == RecordState.REPLAYING)
          text = 'Replaying';
        else
          throw 'unknown status';
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
      commentList.push(comment);
      this.commentCounter += 1;
    },
    addEvent: function _addEvent(eventRequest, portName) {
      if (this.capturing && eventRequest.value.type == 'capture') {
        this.ports.sendToAll({type: 'cancelCapture', value: null});
        this.capturing = false;
      }

      var e = eventRequest.value;
      var ports = this.ports;
      var tab = ports.getTab(portName);
      var portInfo = ports.getTabInfo(tab);
      // TODO: this is broken, maybe
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


      var time = e.data.timeStamp;
      var lastTime = this.lastTime;
      if (lastTime == 0) {
        var waitTime = 0;
      } else {
        var waitTime = time - lastTime;
      }
      this.lastTime = time;

      e.frame.port = portName;
      e.frame.topURL = topURL;
      e.frame.topFrame = topFrame;
      e.frame.iframeIndex = iframeIndex;
      e.frame.tab = tab;
      e.timing.waitTime = waitTime;

      recordLog.log('added event:', eventRequest, portName);

      var events = this.events;
      e.meta.id = 'event' + events.length;

      this.events.push(eventRequest);
      this.updateListeners({event: eventRequest});

      this.commentCounter = 0;
    },
    updateEvent: function _updateEvent(eventRequest, portName) {
      var updates = eventRequest.value;
      var pageEventId = updates.meta.pageEventId;

      recordLog.log('updating event:', updates, pageEventId);

      var events = this.events;

      for (var i = events.length - 1; i >= 0; --i) {
        var e = events[i];
        var value = e.value;
        if (value.frame.port == portName && 
            value.meta.pageEventId == pageEventId) {
          for (var type in updates) {
            var typeUpdates = updates[type];
            for (var key in typeUpdates) {
              value[type][key] = typeUpdates[key];
            }
          }
          break;
        }
      }
    },
    getEvents: function _getEvents() {
      return jQuery.extend(true, [], this.events);
    },
    getComments: function _getComments() {
      return this.comments.slice(0);
    },
    setEvents: function _setEvents(events) {
      this.reset();
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
    },
    userUpdate: function _userUpdate(eventId, field, newVal) {
      function updateProp(obj, path, i) {
        if (i == path.length - 1)
          obj[path[i]] = newVal;
        else
          updateProp(obj[path[i]], path, i + 1);
      }

      function getProp(obj, path, i) {
        if (i == path.length - 1)
          return obj[path[i]];
        else
          return getProp(obj[path[i]], path, i + 1);
      }

      var events = this.events;
      for (var i = events.length - 1; i >= 0; --i) {
        var event = events[i];
        var value = event.value;
        if (value.meta.id == eventId) {
          var oldVal = getProp(value, field.split('.'), 0);
          if (!value.userUpdate)
            value.userUpdate = [];
          value.userUpdate.push({eventId: eventId, field: field, oldVal: oldVal,
                                 newVal: newVal});
          // updateProp(value, field.split('.'), 0);
        }
      }
    }
  };

  return Record;
})();

// Handles replaying scripts (not simulataneous)
var Replay = (function ReplayClosure() {
  var replayLog = getLog('replay');

  function Replay(ports, scriptServer, user) {
    this.ports = ports;
    this.scriptServer = scriptServer;
    this.user = user;
    this.record = new Record(ports);
    this.listeners = [];

    // replay variables
    this.reset();
  }

  function yesNoCheck(response) {
    if (response == 'yes' || response == 'y')
      return 'yes';
    else if (response == 'no' || response == 'n')
      return 'no';

    return null;
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
    getEvent: function _getEvent(eventId) {
      var events = this.events;
      if (!events)
        return null;

      for (var i = 0, ii = events.length; i < ii; ++i) {
        var e = events[i];
        if (e.value.meta.id == eventId)
          return e
      }
      return null;
    },
    getEventsByPort: function _getEventsByPort(events) {
      var map = {};
      for (var i = 0, ii = events.length; i < ii; ++i) {
        var event = events[i];
        var port = event.value.frame.port;
        if (!(port in map))
          map[port] = [];

        map[port].push(event);
      }
      return map;
    },
    replay: function _replay(events, scriptId, cont) {
      replayLog.log('starting replay');

      this.pause();
      this.reset();

      this.startTime = new Date().getTime();
      this.events = events;
      this.scriptId = scriptId;
      this.cont = cont;
      this.replayState = ReplayState.REPLAYING;
      this.eventsByPort = this.getEventsByPort(events);

      this.gatherUpdates(events);

      this.record.startRecording(true);
      this.ports.sendToAll({type: 'resetCompensation', value: null});
      this.setNextTimeout();
    },
    gatherUpdates: function _gatherUpdates(events) {
      var allUpdates = [];
      for (var i = 0, ii = events.length; i < ii; ++i) {
        var e = events[i];
        var userUpdate = e.value.userUpdate;
        if (userUpdate)
          allUpdates = allUpdates.concat(userUpdate);
      }

      var xPathMapping = {};
      for (var i = 0, ii = allUpdates.length; i < ii; ++i) {
        var update = allUpdates[i];
        if (update.field == 'data.target.xpath') {
          var e = this.getEvent(update.eventId);
          var portName = e.value.frame.port;

          if (!xPathMapping[portName])
            xPathMapping[portName] = {};

          xPathMapping[portName][update.oldVal] = update;
        }
      }
      this.xPathMapping = xPathMapping;
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
      this.benchmarkLog = '';

      this.record.reset();
    },
    addBenchmarkLog: function _addBenchmarkLog(text) {
      this.benchmarkLog += text + '\n';
    },
    getStatus: function _getStatus() {
      return this.replayState;
    },
    incrementIndex: function _incrementIndex() {
      this.index += 1;

      var index = this.index;
      var events = this.events;
      if (index < events.length) {
        var e = events[index].value;
        this.updateListeners({simulate: e.meta.id});
      }
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
        var defaultTime = events[index].value.timing.waitTime;
      else
        var defaultTime = 0;

      if (defaultTime > 10000)
        defaultTime = 10000;

      if (index == 0 || index == events.length) {
        waitTime = 1000;
      } else if (timing == TimingStrategy.MIMIC) {
        waitTime = defaultTime;
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
      } else if (timing == TimingStrategy.PERTURB) {
        var scale = 0.7 + (Math.random() * 0.6);
        waitTime = Math.round(defaultTime * scale);
      } else {
        throw 'unknown timing strategy';
      }
      replayLog.log('wait time:', waitTime);
      return waitTime;
    },
    pause: function _pause() {
      var handle = this.timeoutHandle;
      if (handle) {
        clearTimeout(handle);
        this.timeoutHandle = null;
      }

      // tell whatever page was trying to execute the last event to pause
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
        var replayState = this.replayState;
        if (replayState == ReplayState.REPLAY_ACK) {
          this.replayState = ReplayState.REPLAYING;
        } else if (replayState == ReplayState.REPLAY_ONE_ACK) {
          this.replayState == ReplayState.REPLAY_ONE;
        }

        this.setNextTimeout(0);
      }
    },
    replayOne: function _replayOne() {
      this.replayState = ReplayState.REPLAY_ONE;
      this.restart();
    },
    skip: function _skip() {
      this.incrementIndex();
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
      this.time = new Date().getTime() - this.startTime;
      this.record.stopRecording();
      this.updateListeners({status: 'Finished'});

      if (errorMsg)
        this.addDebug('error:' + errorMsg);
      else
        this.addDebug('finished normally');

      var record = this.record;
      var replay = this;

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
      this.updateListeners({capture: capture.innerText.trim()});
    },
    findPortInTab: function _findPortInTab(frame) {
      var ports = this.ports;
      var newTabId = this.tabMapping[frame.tab];
      var portInfo = ports.getTabInfo(newTabId);
      replayLog.log('trying to find port in tab:', portInfo);

      if (!portInfo)
        return;

      var newPort = null;

      if (frame.topFrame) {
        replayLog.log('assume port is top level page');
        var topFrame = portInfo.top;
        if (topFrame) {
          if (matchUrls(frame.URL, topFrame.URL))
            newPort = ports.getPort(topFrame.portName);
        }
      } else {
        replayLog.log('try to find port in one of the iframes');
        var frames = portInfo.frames;
        var urlFrames = [];
        for (var i = 0, ii = frames.length; i < ii; i++) {
          if (frames[i].URL == frame.URL) {
            urlFrames.push(frames[i]);
          }
        }

        if (urlFrames.length == 0) {
          this.addDebug('no iframes found for page');
          return;
        } else if (urlFrames.length == 1) {
          return ports.getPort(urlFrames[0].portName);
        }

        replayLog.warn('multiple iframes with same url:', urlFrames);

        /*
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
        */
      }
      replayLog.log('found port:', newPort);
      return newPort;
    },
    checkReplayed: function _checkReplayed(e) {
      var id = e.meta.id;
      var recordedEvents = this.record.events;
      for (var i = recordedEvents.length - 1; i >= 0; --i) {
        var recordedEvent = recordedEvents[i];
        if (recordedEvent.value.meta.recordId == id)
          return true;
      }
      return false;
    },
    checkTimeout: function _checkTimeout() {
      var eventTimeout = params.replaying.eventTimeout;
      if (eventTimeout != null && eventTimeout > 0) {
        var timeoutInfo = this.timeoutInfo;
        var curTime = new Date().getTime();

        // we havent changed events
        var index = this.index;
        if (timeoutInfo.index == index) {
          if (curTime - timeoutInfo.startTime > eventTimeout * 1000) {
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
        if (this.checkTimeout()) {
          // lets call the end of this script
          var msg = 'event ' + this.index + ' has times out';
          replayLog.log(msg);
          this.finish(msg);
          return;
        }

        var replayState = this.replayState;

        // check for acks
        if (replayState == ReplayState.WAIT_ACK) {
          var ackReturn = this.ports.getAck(this.ackVar);
          if (ackReturn != null && ackReturn == true) {
            this.replayState = ReplayState.REPLAYING;
            this.incrementIndex();
            this.setNextTimeout(0);

            replayLog.log('found wait ack');
            return;
          }
        } else if (replayState == ReplayState.REPLAY_ACK ||
                   replayState == ReplayState.REPLAY_ONE_ACK) {
          var ackReturn = this.ports.getAck(this.ackVar);
          // got ack
          if (ackReturn != null && ackReturn == true) {
            this.incrementIndex();
            if (replayState == ReplayState.REPLAY_ACK)
              this.setNextTimeout();
            else
              this.pause();

            this.replayState = ReplayState.REPLAYING;
            this.lastReplayPort = null;
            replayLog.log('found replay ack');
          // no ack, try again in one second
          } else {
            this.setNextTimeout(params.replaying.defaultWait);
            replayLog.log('continue waiting for replay ack');
          }
          return;
        }

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
        var v = e.value;

        if (params.replaying.cascadeCheck && this.checkReplayed(v)) {
          replayLog.debug('skipping event: ' + e.id);
          this.incrementIndex();
          if (replayState == ReplayState.REPLAYING)
            this.setNextTimeout();
          else if (replayState == ReplayState.REPLAY_ONE)
            this.pause();

          this.replayState = ReplayState.REPLAYING;
          this.lastReplayPort = null;
          return;
        }

        var frame = v.frame;
        var meta = v.meta;
        var port = frame.port;
        var tab = frame.tab;
        var newPort = false;

        this.updateListeners({status: 'Replay ' + index});

        replayLog.log('background replay:', meta.id, v, port, tab);

        // lets find the corresponding port
        var replayPort = null;
        // we have already seen this port, reuse existing mapping
        if (port in portMapping) {
          replayPort = portMapping[port];
          replayLog.log('port already seen', replayPort);

        // we have already seen this tab, find equivalent port for tab
        // for now we will just choose the last port added from this tab
        } else if (tab in tabMapping) {
          var replayPort = this.findPortInTab(frame);

          if (replayPort) {
            portMapping[port] = replayPort;
            newPort = true;
            replayLog.log('tab already seen, found port:', replayPort);
          } else {
            this.setNextTimeout(params.replaying.defaultWait);
            replayLog.log('tab already seen, no port found');
            this.addDebug('tab already seen, no port found');
            return;
          }
        // need to open new tab
        } else {
          var prompt = "Does the page exist? If so select the tab then type " +
                       "'yes'. Else type 'no'.";
          var replay = this;
          var user = this.user;
          user.question(prompt, yesNoCheck, function(answer) {
            if (answer == 'no') {
              replayLog.log('need to open new tab');
              chrome.tabs.create({url: frame.topURL, active: true},
                function(newTab) {
                  replayLog.log('new tab opened:', newTab);
                  var newTabId = newTab.id;
                  replay.tabMapping[frame.tab] = newTabId;
                  replay.ports.tabIdToTab[newTabId] = newTab;
                  replay.setNextTimeout(params.replaying.defaultWaitNewTab);
                }
              );
            } else if (answer == 'yes') {
              var tabInfo = user.getActivatedTab()
              chrome.tabs.get(tabInfo.tabId, function(tab) {
                replayLog.log('mapping tab:', tab);
                var tabId = tab.id;
                replay.tabMapping[frame.tab] = tabId;
                replay.ports.tabIdToTab[tabId] = tab;
                replay.setNextTimeout(params.replaying.defaultWaitNewTab);
              });
            }
          });
          return;
        }

        // we have hopefully found a matching port, lets dispatch to that port
        this.lastReplayPort = replayPort;

        var type = v.data.type;

        try {
          if (replayState == ReplayState.WAIT_ACK) {
            var ackReturn = this.ports.getAck(this.ackVar);
            if (ackReturn == null || ackReturn != true) {
              replayPort.postMessage(e);
              this.setNextTimeout(params.replaying.defaultWait);

              replayLog.log('continue waiting for wait ack');
            }
          } else if (replayState == ReplayState.REPLAYING ||
                     replayState == ReplayState.REPLAY_ONE) {
            this.ports.clearAck();
            if (e.type == 'event') {
              // send message
              if (newPort) {
                replayPort.postMessage({type: 'portEvents',
                                        value: this.eventsByPort[frame.port]});

                var mapping = this.xPathMapping[frame.port] || {};
                replayPort.postMessage({type: 'userUpdates', value: mapping});
              }

              // TODO: we assume that events together are all from the same
              // port
              var eventGroup = [];
              var endEvent = meta.endEventId;
              if (params.replaying.atomic && endEvent) {
                var t = this.index;
                var events = this.events;
                while (t < events.length &&
                       endEvent >= events[t].value.meta.pageEventId &&
                       port == events[t].value.frame.port) {
                  eventGroup.push(events[t]);
                  t++;
                }
              } else {
                eventGroup = [e];
              }

              replayPort.postMessage({type: 'event', value: eventGroup});
              replayLog.log('sent message', eventGroup);
              if (replayState == ReplayState.REPLAYING)
                this.replayState = ReplayState.REPLAY_ACK;
              else if (replayState == ReplayState.REPLAY_ONE)
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
              if (v.data.cascading) {
                this.incrementIndex();
                this.setNextTimeout(0);
              } else {
                // remove the mapping and try again
                this.addDebug('using disconnected port, remove and try again');
                delete portMapping[port];
                this.setNextTimeout(0);
              }
            } else if (strategy == BrokenPortStrategey.SKIP) {
              // we probably navigated away from the page so lets skip all
              // events that use this same port
              while (index < events.length && 
                     events[index].value.frameport == port) {
                replayLog.log('skipping event:', index);
                ++index;
              }
              this.index = index;
              this.setNextTimeout(0);
            } else {
              throw 'unknown broken port strategy';
            }
          } else {
            throw err;
          }
        }
      } catch (err) {
        replayLog.error('error:', err.message, err);
        this.finish(err.toString());
      }
    },
  };

  return Replay;
})();

var User = (function UserClosure() {
  var log = getLog('user');

  function User(panel) {
    this.panel = panel;
    this.activeTab = null;
  }

  User.prototype = {
    setPanel: function _setPanel(panel) {
      this.panel = panel;
    },
    question: function _question(prompt, validation, callback) {
      var panel = this.panel;
      var user = this;
      panel.question(prompt, function(answer) {
        var sanitize = validation(answer);
        if (sanitize)
          callback(sanitize);
        else
          user.question(prompt, validation, callback);
      });
    },
    activatedTab: function _activatedTab(tabInfo) {
      this.activeTab = tabInfo;
    },
    getActivatedTab: function _getActivatedTab() {
      return this.activeTab;
    },
    contentScriptQuestion: function _question(prompt, port) {
      this.question(prompt, function() {return true;}, function(answer) {
        port.postMessage({type: 'promptResponse', value: answer});
      });
    }
  };

  return User;
})();

var Controller = (function ControllerClosure() {
  var ctlLog = getLog('controller');

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
      this.record.startRecording();

      // Update the UI
      chrome.browserAction.setBadgeBackgroundColor({color: [255, 0, 0, 64]});
      chrome.browserAction.setBadgeText({text: 'ON'});
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
      this.record.reset();
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
    },
    updateListeners: function _updateListeners(msg) {
      var listeners = this.listeners;
      for (var i = 0, ii = listeners.length; i < ii; ++i) {
        listeners[i](msg);
      }
    },
    submitInput: function _submitInput(text) {
      ctlLog.log(text);
    },
    userUpdate: function _userUpdate(eventId, field, value) {
      ctlLog.log('update:', eventId, field, value);
      this.record.userUpdate(eventId, field, value);
    }
  };

  return Controller;
})();

// Instantiate components
var ports = new PortManager();
var scriptServer = new ScriptServer(params.server);

var user = new User(user);
var record = new Record(ports);
var replay = new Replay(ports, scriptServer, user);
var controller = new Controller(record, replay, scriptServer, ports);
var panel = new Panel(controller);
user.setPanel(panel);

// Add event handlers

var bgLog = getLog('background');
// The first message content scripts send is to get a unique id
function handleIdMessage(request, sender, sendResponse) {
  bgLog.log('background receiving:', request, 'from', sender);
  if (request.type == 'getId') {
    var portName = ports.getNewId(request.value, sender);
    if(portName)
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
  } else if (request.type == 'alert') {
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
    replay.receiveAck(request.value);
  } else if (request.type == 'url') {
    ports.updateUrl(port, request.value);
  } else if (request.type == 'debug') {
    controller.addDebug(request.value);
  } else if (request.type == 'benchmarkLog') {
    replay.addBenchmarkLog(request.value);
  } else if (request.type == 'prompt') {
    user.contentScriptQuestion(request.value, port);
  }
}


// Attach the event handlers to their respective events
chrome.runtime.onMessage.addListener(handleIdMessage);

chrome.runtime.onConnect.addListener(function(port) {
  ports.connectPort(new Port(port));
});

chrome.tabs.getCurrent(function(curTab) {
  var tabId = curTab.id;
  chrome.tabs.onActivated.addListener(function(activeInfo) {
    if (activeInfo.tabId != tabId)
      user.activatedTab(activeInfo);
  });
});

// window is closed so tell the content scripts to stop recording and reset the
// extension icon
$(window).unload(function() {
  controller.stop();
  chrome.browserAction.setBadgeText({text: ''});
  chrome.runtime.onMessage.removeListener(handleMessage);
});

$(window).resize(function() {
  panel.resize();
});

ports.sendToAll({type: 'params', value: params});
controller.stop();
controller.getScript('fbtest');
