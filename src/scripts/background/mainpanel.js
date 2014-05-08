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
    sendToAll: function _sendToAll(message) {
      portLog.log('sending to all:', message);
      var ports = this.ports;
      for (var portName in ports) {
        ports[portName].postMessage(message);
      }
    },
    getTab: function _getTab(portName) {
      return this.portNameToTabId[portName];
    },
    getTabInfo: function _getTabInfo(tab) {
      var tabInfo = this.tabIdToTabInfo[tab];
      if (!tabInfo)
        return null;

      var ret = {};
      ret.frames = tabInfo.frames;

      var topFrames = tabInfo.top;
      if (topFrames.length > 0)
        ret.top = topFrames[topFrames.length - 1];

      return ret;
    },
    getTabFromTabId: function _getTabFromTabId(tabId) {
      return this.tabIdToTab[tabId];
    },
    getPort: function _getPort(portName) {
      return this.ports[portName];
    },
    getSnapshot: function _getSnapshot(portName) {
      return this.portToSnapshot[portName];
    },
    addSnapshot: function _addSnapshot(name, snapshot) {
      this.portToSnapshot[name] = snapshot;
    },
    updateUrl: function _updateUrl(port, url) {
      this.portNameToPortInfo[port.name].URL = url;
    },
    removeTab: function _removeTab(tabId) {
      delete this.tabIdToPortNames[tabId];
      delete this.tabIdToTab[tabId];
    },
    getNewId: function _getNewId(value, sender) {
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
    connectPort: function _connectPort(port) {
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
    addEvent: function _addEvent(eventRequest, portName, index) {
      if (this.capturing && eventRequest.value.type == 'capture') {
        this.ports.sendToAll({type: 'cancelCapture', value: null});
        this.capturing = false;
      }

      var e = eventRequest.value;

      if (portName) {
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
      }

      recordLog.log('added event:', eventRequest, portName);

      var events = this.events;
      
      if (!e.meta)
        e.meta = {};
      e.meta.id = 'event' + events.length;

      if (typeof index == 'number') {
        this.events.splice(index, 0, eventRequest);
        this.updateListeners({event: eventRequest, index: index});
      } else {
        this.events.push(eventRequest);
        this.updateListeners({event: eventRequest});
        this.commentCounter = 0;
      }
      return e.meta.id;
    },
    updateEvent: function _updateEvent(eventRequest, portName) {
      var updates = eventRequest.value;
      var pageEventId = updates.meta.pageEventId;

      recordLog.log('updating event:', updates, pageEventId);

      var events = this.events;

      for (var i = events.length - 1; i >= 0; --i) {
        var e = events[i];
        var value = e.value;
        if (e.type == 'event' && value.frame.port == portName && 
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
    addGeneralLoop: function _addGeneralLoop(type, eventIds) {
      var events = this.events;

      var begin = events.indexOf(this.getEvent(eventIds[0]));
      var beginEvent = {type: 'begin' + type, value: {}};
      beginEvent.value.data = {};
      beginEvent.value.reset = {};
      beginEvent.value.timing = {waitTime: 0};
      var beginEventId = this.addEvent(beginEvent, null, begin);

      var end = events.indexOf(this.getEvent(eventIds[eventIds.length - 1]));
      var endEvent = {type: 'end' + type, value: {}};
      endEvent.value.data = {begin: beginEventId};
      endEvent.value.timing = {waitTime: 0};
      var endEventId = this.addEvent(endEvent, null, end + 1);

      beginEvent.value.data.end = endEventId;

      this.setEvents(events);
    },
    addLoop: function _addLoop(eventIds) {
      this.addGeneralLoop('loop', eventIds);
    },
    addNextLoop: function _addNextLoop(eventIds) {
      this.addGeneralLoop('next', eventIds);
    },
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
/*
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
*/
    replay: function _replay(events, scriptId, cont) {
      replayLog.log('starting replay');

      this.pause();
      this.reset();

      this.startTime = new Date().getTime();
      this.events = events;
      for (var i = 0, ii = events.length; i < ii; ++i)
        this.resetEvent(events[i]);

      this.scriptId = scriptId;
      this.cont = cont;
      this.replayState = ReplayState.REPLAYING;
//      this.eventsByPort = this.getEventsByPort(events);

//      this.gatherUpdates(events);

      this.record.startRecording(true);
      //this.ports.sendToAll({type: 'resetCompensation', value: null});
      this.setNextTimeout(0);
    },
    subReplay: function _subReplay(events, scriptId, tabMapping, check, cont,
                                   timeout) {
      var props = Object.keys(this);
      var copy = {};
      for (var i = 0, ii = props.length; i < ii; ++i) {
        var prop = props[i];
        copy[prop] = this[prop];
      }

      var replay = this;
      this.replay(events, scriptId, function(r) {
        if (timeout) {
          clearTimeout(timeoutId);
        }
        check(r);

        this.reset();
        for (var key in copy) {
          replay[key] = copy[key];
        }
        cont(r);
      });
      this.tabMapping = tabMapping;

      if (timeout) {
        var timeoutId = setTimeout(function() {
          replay.finish();
        }, timeout);
      }
    },
/*
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
*/
    reset: function _reset() {
      this.timeoutHandle = null;
      this.ack = null;
      this.index = 0;
      this.portMapping = {};
      this.tabMapping = {};
      this.replayState = ReplayState.STOPPED;
      this.timeoutInfo = {startTime: 0, index: -1};
      this.lastReplayPort = null;
      this.captures = [];
      this.scriptId = null;
      this.events = [];
      this.cont = null;
      this.debug = [];
      this.benchmarkLog = '';
      this.clipboard = null; 
      this.loopPrefix = [];
      this.firstEventReplayed = false;

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
        if (e.meta)
          this.updateListeners({simulate: e.meta.id});
      }
    },
    getNextTimingEventIndex: function _getNextTimingEventIndex() {
      var index = this.index;
      var events = this.events;

      for (var i = index, ii = events.length; i < ii; ++i) {
        var v = events[i].value;
        if (v.timing && 'waitTime' in v.timing)
          return i;
      }
      return events.length;
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

      var index = this.getNextTimingEventIndex();
      var events = this.events;
      var waitTime = 0;

      if (index < events.length)
        var defaultTime = events[index].value.timing.waitTime;
      else
        return 0;

      if (events[this.index].value.data.type == 'capture' &&
          typeof params.replaying.captureWait == 'number')
        defaultTime = Math.min(defaultTime, params.replaying.captureWait);

      if (defaultTime > 10000)
        defaultTime = 10000;

      if (index == 0 || index == events.length) {
        waitTime = 1000;
      } else if (timing == TimingStrategy.MIMIC) {
        waitTime = defaultTime;
      } else if (timing == TimingStrategy.SPEED) {
        waitTime = 0;
      } else if (timing == TimingStrategy.SLOWER) {
        waitTime = defaultTime * 2;
      } else if (timing == TimingStrategy.SLOWEST) {
        waitTime = defaultTime * 4;
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
          //scriptServer.saveCaptures(captures, scriptId);
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
    saveCapture: function _saveCapture(capture) {
      replayLog.log('capture:', capture);
      this.captures.push(capture);
      // this.scriptServer.saveCapture(capture, this.scriptId);
      this.updateListeners({capture: capture.innerText.trim()});

      if (params.replaying.saveCaptureLocal) {
        var loopPrefix = this.loopPrefix.join(',');
        var capId = this.scriptId + ':' + loopPrefix + ':' + capture.id;
        var storage = {}
        storage[capId] = JSON.stringify(capture);
        chrome.storage.local.set(storage);
      }
    },
    findPortInTab: function _findPortInTab(frame) {
      var ports = this.ports;
      var newTabId = this.tabMapping[frame.tab];
      var portInfo = ports.getTabInfo(newTabId);
      replayLog.log('trying to find port in tab:', portInfo);

      if (!portInfo)
        return;

      var port = null;

      if (frame.topFrame) {
        replayLog.log('assume port is top level page');
        var topFrame = portInfo.top;
        if (topFrame) {
          if (matchUrls(frame.URL, topFrame.URL))
            port = ports.getPort(topFrame.portName);
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
      replayLog.log('found port:', port);
      return port;
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
    getMatchingPort: function _getMatchingPort(eventObj) {
      var portMapping = this.portMapping;
      var tabMapping = this.tabMapping;

      var v = eventObj.value;
      var frame = v.frame;
      var port = frame.port;
      var tab = frame.tab;

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
          //newPort = true;
          replayLog.log('tab already seen, found port:', replayPort);
        } else {
          this.setNextTimeout(params.replaying.defaultWait);
          replayLog.log('tab already seen, no port found');
          this.addDebug('tab already seen, no port found');
        }
      // need to open new tab
      } else {
        var allTabs = Object.keys(this.ports.tabIdToTab);

        var revMapping = {};
        for (var t in tabMapping) {
          revMapping[tabMapping[t]] = true;
        }
       
        var unusedTabs = [];
        for (var i = 0, ii = allTabs.length; i < ii; ++i) {
          var tabId = allTabs[i];
          if (!revMapping[tabId])
            unusedTabs.push(tabId);
        }

        if (this.firstEventReplayed && unusedTabs.length == 1) {
          tabMapping[frame.tab] = unusedTabs[0];
          this.setNextTimeout(0);
          return;
        }

        var replay = this;
        var openNewTab = function() {
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
        }

        if (!this.firstEventReplayed && params.replaying.openNewTab) {
          openNewTab();
        } else {
          var prompt = "Does the page exist? If so select the tab then type " +
                       "'yes'. Else type 'no'.";
          var user = this.user;
          user.question(prompt, yesNoCheck, 'no', function(answer) {
            if (answer == 'no') {
              openNewTab();
            } else if (answer == 'yes') {
              var tabInfo = user.getActivatedTab()
              chrome.tabs.get(tabInfo.tabId, function(tab) {
                replayLog.log('mapping tab:', tab);
                var tabId = tab.id;
                replay.tabMapping[frame.tab] = tabId;
                // replay.ports.tabIdToTab[tabId] = tab;
                replay.setNextTimeout(0);
              });
            }
          });
        }
      }
      return replayPort;
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
        /*
        if (replayState == ReplayState.WAIT_ACK) {
          var ack = this.ack;
          if (ack != null && ack == true) {
            this.replayState = ReplayState.REPLAYING;
            this.incrementIndex();
            this.setNextTimeout(0);

            replayLog.log('found wait ack');
            return;
          }
        } else 
        */
        if (replayState == ReplayState.REPLAY_ACK ||
            replayState == ReplayState.REPLAY_ONE_ACK) {

          var ack = this.ack;
          if (!ack) {
            this.setNextTimeout(params.replaying.defaultWait);
            replayLog.log('continue waiting for replay ack');
            return;
          }

          type = ack.type;
          if (type == Ack.SUCCESS) {
            replayLog.log('found replay ack');
            this.incrementIndex();

            if (replayState == ReplayState.REPLAY_ACK)
              this.setNextTimeout();
            else
              this.pause();

            this.replayState = ReplayState.REPLAYING;
            this.lastReplayPort = null;
          } else if (type == Ack.PARTIAL) {
            throw "partially executed commands";
          } else if (type == Ack.GENERALIZE) {
            this.generalizeScript(ack);

            if (replayState == ReplayState.REPLAY_ACK)
              this.setNextTimeout();
            else
              this.pause();

            this.replayState = ReplayState.REPLAYING;
            this.lastReplayPort = null;
            replayLog.log('found replay ack');
          }
          return;
        }

        var events = this.events;
        var index = this.index;

        if (index >= events.length) {
          this.addDebug('finished script');
          this.finish();
          return;
        }

        var e = events[index];
        var v = e.value;
        var type = e.type;

        if (type == 'beginloop') {
          if ('generalPrefixes' in v.reset) {
            replayLog.log('have prefixes, starting loop');
  
            // reset mappings
            this.portMapping = jQuery.extend({}, v.reset.portMapping);
            this.tabMapping = jQuery.extend({}, v.reset.tabMapping);
            this.record.events = v.reset.recordEvents.slice(0);
  
            // close new tabs since original state
            var currentTabIds = Object.keys(this.ports.tabIdToTab);
            var tabIdToTab = v.reset.tabIdToTab; 
            for (var i = 0, ii = currentTabIds.length; i < ii; ++i) {
              var tabId = currentTabIds[i];
              if (!tabIdToTab[tabId])
                chrome.tabs.remove(parseInt(tabId));
            }

            var endEvent = this.getEvent(v.data.end);
            var endIndex = events.indexOf(endEvent);

            var prefixes = v.reset.generalPrefixes;
            var prefixIndex = v.reset.index;

            // end the loop and continue
            if (prefixIndex >= prefixes.length) {
              this.index = endIndex;
              this.incrementIndex();
              this.setNextTimeout();
              return;
            }

            this.loopPrefix.push(prefixIndex); 
            var newPrefix = prefixes[prefixIndex];
            v.reset.index++;
  
            var generalizeInfo = {
              orig: v.reset.origPrefix,
              new: newPrefix
            }
  
            for (var i = index + 1; i < endIndex; ++i) {
              events[i].value.generalize = generalizeInfo;
              this.resetEvent(events[i]);
            }
  
            //replayPort.postMessage({type: 'portEvents',
            //                        value: this.eventsByPort[frame.port]});
  
            this.incrementIndex();
            this.setNextTimeout();
          } else {
            var nextEventIdx = index + 1;
            for (var i = index + 1, ii = events.length; i < ii; ++i) {
              if (events[i].type == 'event') {
                var eventType = events[i].value.data.type;
                if (eventType.indexOf('mouse') != -1 ||
                    eventType == 'capture') {
                  nextEventIdx = i;
                  break;
                }
              }
            }

            var nextEvent = events[nextEventIdx];
            var port = this.getMatchingPort(nextEvent);

            if (!port)
              return;
            
            if (v.generalXPath) {
              replayLog.log('found general xpath, need prefixes');
              var value = {generalXPath: v.generalXPath, origXPath: v.origXPath};
              port.postMessage({type: 'prefix', value: value});
              this.replayState = ReplayState.REPLAY_ACK;
            } else {
              replayLog.log('no loop info, generalizing on next event');
              port.postMessage({type: 'generalize', value: nextEvent});
              this.replayState = ReplayState.REPLAY_ACK;
            }
          }
          return;
        } else if (type == 'endloop') {
          replayLog.log('end loop');

          this.loopPrefix.pop();
          var beginEvent = this.getEvent(v.data.begin);
          this.index = events.indexOf(beginEvent);
          this.setNextTimeout(0);
          return;
        } else if (type == 'beginnext') {
          if ('index' in v.reset) {
            console.log('executing next loop');

            // reset mappings
            this.portMapping = jQuery.extend({}, v.reset.portMapping);
            this.tabMapping = jQuery.extend({}, v.reset.tabMapping);
            this.record.events = v.reset.recordEvents.slice(0);
  
            // close new tabs since original state
            var currentTabIds = Object.keys(this.ports.tabIdToTab);
            var tabIdToTab = v.reset.tabIdToTab; 
            for (var i = 0, ii = currentTabIds.length; i < ii; ++i) {
              var tabId = currentTabIds[i];
              if (!tabIdToTab[tabId])
                chrome.tabs.remove(parseInt(tabId));
            }

            var endEvent = this.getEvent(v.data.end);
            var endIndex = events.indexOf(endEvent);
            for (var i = index + 1; i < endIndex; ++i) {
              this.resetEvent(events[i]);
            }

            var replay = this;
            var nextEvents = v.nextEvents;
            var index = v.reset.index;
            
            this.loopPrefix.push(index); 
  
            if (index == 0) {
              v.reset.index++;
              replay.incrementIndex();
              replay.setNextTimeout();
              return;
            }

            index -= 1;
            if (index >= nextEvents.length)
              index = nextEvents.length - 1;
            var nextEvent = nextEvents[index];

            var nextTabMapping = {};
            var tab = nextEvent[0].value.frame.tab;
            var origTab = -1;
            var origTabMapping = v.origTabMapping;
            for (var t in origTabMapping) {
              if (origTabMapping[t] == tab) {
                origTab = t;
                break;
              }
            }
            var newTab = this.tabMapping[origTab];
            nextTabMapping[tab] = newTab;

            var pass =  null;
            replay.subReplay(nextEvent, null, nextTabMapping,
                function(r) {
                  // check that events were executed
                  pass = r.events.length == r.index;
                },
                function(r) {
                  v.reset.index++;

                  if (pass == false) {
                    var endEvent = replay.getEvent(v.data.end);
                    var endIndex = events.indexOf(endEvent);
  
                    replay.index = endIndex;
                  }
                  replay.incrementIndex();
                  replay.setNextTimeout(params.replaying.defaultWaitNextEvent);
                },
                25000
            );
            return;
          } else if (v.nextEvents) {
            v.reset.portMapping = {};//jQuery.extend({}, this.portMapping);
            v.reset.tabMapping = jQuery.extend({}, this.tabMapping);
            v.reset.recordEvents = this.record.events.slice(0);
            v.reset.tabIdToTab = jQuery.extend({}, this.ports.tabIdToTab);
            v.reset.index = 0;
            
            this.setNextTimeout(0);
            return;
          } else {
            replayLog.log('recording next events');
            v.nextEvents = [];
            v.origPortMapping = jQuery.extend({}, this.portMapping);
            v.origTabMapping = jQuery.extend({}, this.tabMapping);

            var start = this.record.events.length;

            var user = this.user;
            var p = 'Demonstrate how to get the next set of data. Press enter ' +
              'when done.'

            var replay = this;
            var recordNextEvents = function() {
              user.question(p, function(a) {return true}, '', function(a) {
                var events = replay.record.events;
                var end = events.length;
                var nextEvent = events.slice(start, end).filter(function(e) {
                  return e.type == 'event';
                });
                start = end;
                v.nextEvents.push(nextEvent);

                user.question('Demonstrate another?', yesNoCheck, 'no',
                  function(answer) {
                    if (answer == 'yes') {
                      recordNextEvents();
                    } else {
                      // start from beginning
                      replay.replay(replay.events, replay.scriptId,
                                    replay.cont);
                    }
                  }
                );
              });
            }
            recordNextEvents();
            return;
          } 
        } else if (type == 'endnext') {
          replayLog.log('end loop');

          this.loopPrefix.pop();

          var beginEvent = this.getEvent(v.data.begin);
          this.index = events.indexOf(beginEvent);
          this.setNextTimeout(0);
          return;
        } else if (type != 'event') {
          replayLog.log('skipping event:', e);
          this.incrementIndex();
          this.setNextTimeout(0);
          return;
        }

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

        var meta = v.meta;
        //var newPort = false;

        replayLog.log('background replay:', meta.id, v);

        var replayPort = this.getMatchingPort(e);
        if (!replayPort)
          return;

        if (v.timing.waitEvent) {
          var waitEvent = this.getEvent(v.timing.waitEvent);
          var recordEvents = this.record.events;

          var matchedEvent = null;
          for (var i = recordEvents.length - 1; i >= 0; --i) {
            var otherEvent = recordEvents[i];
            console.log(otherEvent.type, waitEvent.type,
                otherEvent.value.data.url, waitEvent.value.data.url);
            if (otherEvent.type == waitEvent.type &&
                otherEvent.value.data.type == waitEvent.value.data.type &&
                matchUrls(otherEvent.value.data.url,
                          waitEvent.value.data.url, 0.9)) {
              matchedEvent = otherEvent;
              break;
            }
          }

          if (!matchedEvent) {
            this.setNextTimeout(params.replaying.defaultWait);
            return;
          }
        }

        // we have hopefully found a matching port, lets dispatch to that port
        this.lastReplayPort = replayPort;

        var type = v.data.type;

        try {
          /*
          if (replayState == ReplayState.WAIT_ACK) {
            var ackReturn = this.ports.getAck(this.ackVar);
            if (ackReturn == null || ackReturn != true) {
              replayPort.postMessage(e);
              this.setNextTimeout(params.replaying.defaultWait);

              replayLog.log('continue waiting for wait ack');
            }
          } else 
          */
          if (replayState == ReplayState.REPLAYING ||
              replayState == ReplayState.REPLAY_ONE) {
            this.ack = null;
            if (e.type == 'event') {
              // send message
/*
              if (newPort) {

                replayPort.postMessage({type: 'portEvents',
                                        value: this.eventsByPort[frame.port]});

                var mapping = this.xPathMapping[frame.port] || {};
                replayPort.postMessage({type: 'userUpdates', value: mapping});
              }
*/
              replayPort.postMessage({type: 'clipboard', value: this.clipboard});

              // TODO: we assume that events together are all from the same
              // port
              var eventGroup = [];
              var endEvent = meta.endEventId;
              if (params.replaying.atomic && endEvent) {
                var t = this.index;
                var events = this.events;
                while (t < events.length &&
                       endEvent >= events[t].value.meta.pageEventId &&
                       v.frame.port == events[t].value.frame.port) {
                  eventGroup.push(events[t]);
                  t++;
                }
              } else {
                eventGroup = [e];
              }

              replayPort.postMessage({type: 'event', value: eventGroup});
              this.firstEventReplayed = true;
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
                delete this.portMapping[e.value.frame.port];
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
            err.printStackTrace();
            throw err;
          }
        }
      } catch (err) {
        replayLog.error('error:', err.message, err);
        this.finish(err.toString());
      }
    },
    resetEvent: function _resetEvent(e) {
      var v = e.value;
      if (v.reset)
        v.reset = {};
    },
    receiveAck: function _receiveAck(ack) {
      this.ack = ack;
      if (ack.setTimeout)
        this.setNextTimeout(0);
    },
    setClipboard: function _setClipboard(text) {
      this.clipboard = text;
      this.ports.sendToAll({type: 'clipboard', value: text});
    },
    generalizeScript: function _generalize(ack) {
//      var eventId = ack.eventId;

      var events = this.events;
      var index = this.index;
      var e = events[index];

      var value = e.value;
      value.generalXPath = ack.generalXPath;
      value.origXPath = ack.origXPath;

      value.reset.generalPrefixes = ack.generalPrefixes;
      value.reset.origPrefix = ack.origPrefix;
      value.reset.portMapping = jQuery.extend({}, this.portMapping);
      value.reset.tabMapping = jQuery.extend({}, this.tabMapping);
      value.reset.index = 0;
      value.reset.recordEvents = this.record.events.slice(0);
      value.reset.tabIdToTab = jQuery.extend({}, this.ports.tabIdToTab);
    }
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
    question: function _question(prompt, validation, defaultAnswer, callback) {
      var panel = this.panel;
      var user = this;

      if (params.replaying.defaultUser) {
        callback(defaultAnswer);
      } else {
        panel.question(prompt, function(answer) {
          var sanitize = validation(answer);
          if (sanitize)
            callback(sanitize);
          else
            user.question(prompt, validation, defaultAnswer, callback);
        });
      }
    },
    activatedTab: function _activatedTab(tabInfo) {
      this.activeTab = tabInfo;
    },
    getActivatedTab: function _getActivatedTab() {
      return this.activeTab;
    },
    contentScriptQuestion: function _question(prompt, port) {
      this.question(prompt, function() {return true;}, "", function(answer) {
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
    loop: function(eventIds) {
      this.record.addLoop(eventIds);
    },
    next: function(eventIds) {
      this.record.addNextLoop(eventIds);
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
  } else if (request.type == 'clipboard') {
    replay.setClipboard(request.value);
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

chrome.tabs.onRemoved.addListener(function(tabId, removeInfo) {
  ports.removeTab(tabId);
});

var filter = {urls: ['http://*/*', 'https://*/*'], 
  types: ['main_frame', 'sub_frame', 'script', 'object', 'xmlhttprequest']};

function addBackgroundEvent(e) {
  if (record.recordState == RecordState.RECORDING)
    record.addEvent(e);
  else if (replay.record.recordState == RecordState.REPLAYING)
    replay.record.addEvent(e);
}

function addWebRequestEvent(details, type) {
  var e = {type: type};
  var v = {};
  var data = {};

  data.requestId = details.requestId;
  data.method = details.method;
  data.parentFrameId = details.parentFrameId;
  data.tabId = details.tabId;
  data.type = details.type;
  data.url = details.url;
  data.reqTimeStamp = details.timeStamp;
  data.timeStamp = (new Date()).getTime();

  v.data = data;
  e.value = v;

  addBackgroundEvent(e);
}

chrome.webRequest.onBeforeRequest.addListener(function(details) {
  bgLog.log('request start', details);
  addWebRequestEvent(details, 'start');
}, filter, ['blocking']);

chrome.webRequest.onCompleted.addListener(function(details) {
  bgLog.log('completed', details);
  addWebRequestEvent(details, 'completed');
}, filter);

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
controller.getScript('loopnext');


function printEvents() {
  var events = record.events;
  var text = JSON.stringify(events, null, 2);
  bgLog.log(text);
}

function printReplayEvents() {
  var events = replay.record.events;
  var text = JSON.stringify(events, null, 2);
  bgLog.log(text);
}
