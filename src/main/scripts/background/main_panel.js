/* -*- Mode: Java; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* vim: set shiftwidth=2 tabstop=2 autoindent cindent expandtab: */

'use strict';

/* Store mappings between ports, tabs, iframes, etc */
var PortManager = (function PortManagerClosure() {
  var portLog = getLog('ports');

  function PortManager() {
    this.numPorts = 0;
    this.portIdToPort = {};
    this.portIdToTabId = {};
    this.portIdToPortInfo = {};
    this.tabIdToPortIds = {};
    this.tabIdToTabInfo = {};
    this.tabIdToTab = {};
  }

  PortManager.prototype = {
    /* Send a message to all content scripts. Messages should be in the form
     * {type: ..., value: ...} */
    sendToAll: function _sendToAll(message) {
      portLog.log('sending to all:', message);
      var ports = this.portIdToPort;
      for (var portId in ports) {
        ports[portId].postMessage(message);
      }
    },
    getTabId: function _getTabId(portId) {
      return this.portIdToTabId[portId];
    },
    getTabInfo: function _getTabInfo(tabId) {
      var tabInfo = this.tabIdToTabInfo[tabId];
      if (!tabInfo)
        return null;

      var ret = {};
      ret.frames = tabInfo.frames;

      /* we store all the top frames, so just return the last frame */
      var topFrames = tabInfo.top;
      if (topFrames.length > 0)
        ret.top = topFrames[topFrames.length - 1];

      return ret;
    },
    getTabFromTabId: function _getTabFromTabId(tabId) {
      return this.tabIdToTab[tabId];
    },
    getPort: function _getPort(portId) {
      return this.portIdToPort[portId];
    },
    updateUrl: function _updateUrl(port, url) {
      this.portIdToPortInfo[port.name].URL = url;
    },
    removeTab: function _removeTab(tabId) {
      delete this.tabIdToPortIds[tabId];
      delete this.tabIdToTab[tabId];
      delete this.tabIdToTabInfo[tabId];
    },
    getNewId: function _getNewId(value, sender) {
      /* for some reason, the start page loads the content script but doesn't
       * have a tab id. in this case, don't assign an id */
      if (!sender.tab) {
        portLog.warn('request for new id without a tab id');
        return;
      }

      this.numPorts++;
      var portId = '' + this.numPorts;

      portLog.log('adding new id: ', portId, value);

      /* Update various mappings */
      var tabId = sender.tab.id;
      this.tabIdToTab[tabId] = sender.tab;
      this.portIdToTabId[portId] = tabId;
      this.portIdToPortInfo[portId] = value;
      value.portId = portId;

      var portIds = this.tabIdToPortIds[tabId];
      if (!portIds) {
        portIds = [];
        this.tabIdToPortIds[tabId] = portIds;
      }
      portIds.push(portId);

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
      return portId;
    },
    connectPort: function _connectPort(port) {
      var portId = port.name;
      var ports = this.portIdToPort;

      ports[portId] = port;

      port.addMessageListener(function(msg) {
        handleMessage(port, msg);
      });

      var portManager = this;
      port.addDisconnectListener(function(evt) {
        portLog.log('disconnect port:', port);

        if (portId in ports) {
          delete ports[portId];
        } else {
          throw "Can't find port";
        }

        var portInfo = portManager.portIdToPortInfo[portId];
        var tabId = portManager.portIdToTabId[portId];
        var tabInfo = portManager.tabIdToTabInfo[tabId];

        var frames;
        if (portInfo.top)
          var frames = tabInfo.top;
        else
          var frames = tabInfo.frames;

        var removed = false;
        for (var i = 0, ii = frames.length; i < ii; ++i) {
          if (frames[i].portId == portId) {
            frames.splice(i, 1);
            removed = true;
            break;
          }
        }

        if (!removed)
          throw "Can't find frame in tabInfo";
      });
    }
  };

  return PortManager;
})();

/* Handles recording of events from the content scripts */
var Record = (function RecordClosure() {
  var recordLog = getLog('record');

  function Record(ports) {
    this.ports = ports;
    this.listeners = [];

    this.reset();
  }

  Record.prototype = {
    reset: function _reset() {
      this.recordState = RecordState.STOPPED;
      this.scriptId = null;
      this.events = [];
      /* the time the last event was recorded */
      this.lastTime = 0;
      /* whether a node capture is occuring */
      this.capturing = false;

      this.updateListeners({type: 'reset', value: null});
      this.ports.sendToAll({type: 'reset', value: null});
    },
    /* Messages should be in the form {type:..., value:...} */
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
        this.updateListeners({type: 'status', value: newStatus});
      }
    },
    /* Begin recording events.
     *
     * @param {boolean} replaying Whether we are recording a user's
     *     interactions or the events raised by the replayer. 
     */
    startRecording: function _startRecording(replaying) {
      recordLog.log('starting record');
      var s = replaying ? RecordState.REPLAYING : RecordState.RECORDING;
      this.updateStatus(s);

      /* Tell the content scripts to begin recording */
      this.ports.sendToAll({type: 'recording', value: this.getStatus()});
    },
    stopRecording: function _stopRecording() {
      recordLog.log('stopping record');
      this.updateStatus(RecordState.STOPPED);

      /* Tell the content scripts to stop recording */
      this.ports.sendToAll({type: 'updateDeltas', value: null});
      this.ports.sendToAll({type: 'recording', value: this.getStatus()});
    },
    captureNode: function _captureNode() {
      if (this.recordState == RecordState.RECORDING) {
        this.ports.sendToAll({type: 'capture', value: null});
        this.capturing = true;
      }
    },
    /* Add the event to be recorded
     *
     * @param {object} eventRequest Details of about the saved event
     * @param {string} portId Optional name of the port for the event
     * @param {index} index Index where put the event. Defaults to the end of
     *     the event array if undefined
     *
     * @returns {string} Id assigned to the event
     */
    addEvent: function _addEvent(eventRequest, portId, index) {
      recordLog.log('added event:', eventRequest, portId);

      /* Tell other frames to stop capturing */
      if (this.capturing && eventRequest.value.type == 'capture') {
        this.ports.sendToAll({type: 'cancelCapture', value: null});
        this.capturing = false;
      }

      var e = eventRequest.value;

      /* Check if the event is coming from a content script */
      if (portId) {
        var ports = this.ports;
        var tab = ports.getTabId(portId);
        var tabInfo = ports.getTabInfo(tab);
        // TODO: this is broken, maybe
        var topURL = tabInfo.top.URL;

        var iframeIndex = -1;
        var topFrame = (tabInfo.top.portId == portId);

        if (topFrame) {
          var topFrame = true;
        } else {
          var topFrame = false;
          var frames = tabInfo.frames;
          for (var i = 0, ii = frames.length; i < ii; ++i) {
            var frame = frames[i];
            if (frame.portId == portId) {
              iframeIndex = i;
              break;
            }
          }
        }

        e.frame.port = portId;
        e.frame.topURL = topURL;
        e.frame.topFrame = topFrame;
        e.frame.iframeIndex = iframeIndex;
        e.frame.tab = tab;
      }

      /* Save timing info */
      var time = e.data.timeStamp;
      var lastTime = this.lastTime;
      if (lastTime == 0) {
        var waitTime = 0;
      } else {
        var waitTime = time - lastTime;
      }
      if (!('timing' in e))
        e.timing = {};
      e.timing.waitTime = waitTime;
      this.lastTime = time;

      /* Give this event an unique id */
      var events = this.events;
      if (!('meta' in e))
        e.meta = {};
      e.meta.id = 'event' + events.length;

      if (typeof index == 'undefined') {
        this.events.push(eventRequest);
        this.updateListeners({type: 'event', value: {event: eventRequest}});
      } else {
        this.events.splice(index, 0, eventRequest);
        this.updateListeners({type: 'event', 
            value: {event: eventRequest, index: index}});
      }
      return e.meta.id;
    },
    /* Update the properties of an event. @link{eventRequest} should contain the
     * pageEventId so that the event can be matched.
     *
     * @param {object} eventRequest Updates to be made and meta data used to 
     *     identify event
     * @param {string} portId Id of port which requests came through
     */
    updateEvent: function _updateEvent(eventRequest, portId) {
      var request = eventRequest.value;
      var pageEventId = request.pageEventId;
      var updates = request.updates;

      recordLog.log('updating event:', updates, pageEventId);

      var events = this.events;

      for (var i = events.length - 1; i >= 0; --i) {
        var e = events[i];
        var value = e.value;
        /* Check if its the right event */
        if (value.frame && value.frame.port == portId &&
            value.meta && value.meta.pageEventId == pageEventId) {
          var id = value.meta.id;
          for (var i = 0, ii = updates.length; i < ii; ++i) {
            var u = updates[i];
            this.userUpdate(id, u.field, u.value); 
          }
          break;
        }
      }
    },
    /* Finds the event based upon the eventId and updates the event's 
     * @link{field} to @link{newVal}. */
    userUpdate: function _userUpdate(eventId, field, newVal) {
      function updateProp(obj, path, i) {
        if (i == path.length - 1)
          obj[path[i]] = newVal;
        else
          updateProp(obj[path[i]], path, i + 1);
      }

      var events = this.events;
      for (var i = events.length - 1; i >= 0; --i) {
        var event = events[i];
        var value = event.value;
        if (value.meta.id == eventId) {
          updateProp(value, field.split('.'), 0);
        }
      }
    },
    /* Create a copy of the events recorded */
    getEvents: function _getEvents() {
      return jQuery.extend(true, [], this.events);
    },
    /* Set the recorded events */
    setEvents: function _setEvents(events) {
      this.reset();
      this.events = events;
      for (var i = 0, ii = events.length; i < ii; ++i) {
        this.updateListeners({type: 'event', value: {event: events[i]}});
      }
    },
    setScriptId: function _setScriptId(id) {
      this.scriptId = id;
    },
    getScriptId: function _getScriptId() {
      return this.scriptId;
    },
    getEvent: function _getEvent(eventId) {
      var events = this.events;
      if (!events)
        return null;

      for (var i = 0, ii = events.length; i < ii; ++i) {
        var e = events[i];
        if (e.value.meta.id == eventId)
          return e;
      }
      return null;
    }
  };

  return Record;
})();

/* Handles replaying scripts */
var Replay = (function ReplayClosure() {
  var replayLog = getLog('replay');

  function Replay(ports, scriptServer, user) {
    this.ports = ports;
    this.scriptServer = scriptServer;
    /* The user interface to interact with the replayer */
    this.user = user;
    this.record = new Record(ports);
    this.listeners = [];
    this.replayableEvents = {
      dom: 'true',
      capture: 'true'
    }

    this.reset();
  }

  /* Used to validate the user's response */
  function yesNoCheck(response) {
    if (response == 'yes' || response == 'y')
      return 'yes';
    else if (response == 'no' || response == 'n')
      return 'no';

    return null;
  }

  Replay.prototype = {
    reset: function _reset() {
      /* execution proceeds as callbacks so that the page's JS can execute, this
       * is the handle to the current callback */
      this.callbackHandle = null;
      this.replayState = ReplayState.STOPPED;
      this.replayOne = false;
      /* record the first execution attempt of the first event */
      this.timeoutInfo = {startTime: 0, index: -1};
      /* stores responses from the content script */
      this.ack = null;
      /* list of events */
      this.events = [];
      /* current event index */
      this.index = 0;
      /* maps between the record and replay time ports and tabs */
      this.portMapping = {};
      this.tabMapping = {};
      /* data captured during replay */ 
      this.captures = [];
      /* used to link the replayed events with the original recording */
      this.scriptId = null;
      /* callback executed after replay has finished */
      this.cont = null;
      this.firstEventReplayed = false;
      this.startTime = 0;

      this.record.reset();
    },
    /* Messages should be in the form {type:..., value:...} */
    addListener: function _addListener(callback) {
      this.listeners.push(callback);
    },
    updateListeners: function _updateListeners(msg) {
      var listeners = this.listeners;
      for (var i = 0, ii = listeners.length; i < ii; ++i) {
        listeners[i](msg);
      }
    },
    /* Begin replaying a list of events.
     *
     * @param {array} events List of events
     * @param {string} scriptId Id of the original recording
     * @param {function} cont Callback thats executed after replay is finished
     */
    replay: function _replay(events, scriptId, cont) {
      replayLog.log('starting replay');

      /* Pause and reset and previous executions */
      this.pause();
      this.reset();

      /* Record start time for debugging */
      this.startTime = new Date().getTime();
      /* If these events were already replayed, we may need to reset them */
      this.events = events;
      for (var i = 0, ii = events.length; i < ii; ++i)
        this.resetEvent(events[i]);

      this.scriptId = scriptId;
      this.cont = cont;
      this.replayState = ReplayState.REPLAYING;

      this.record.startRecording(true);
      this.setNextTimeout(0);
    },
    /* Replay a different set of events as a subexecution. This requires 
     * saving the context of the current execution and resetting it once
     * the execution is finished.
     *
     * @param {array} events List of events to replay
     * @param {string} scriptId Id of script
     * @param {object} tabMapping Initial tab mapping
     * @param {object} portMapping Initial port mapping
     * @param {function} check Callback after subreplay is finished. The replay
     *     is passed in as an argument.
     * @param {function} cont Callback after subreplay is finished and replayer's
     *     state is reset to original.
     * @param {number} timeout Optional argument specifying a timeout for the
     *     subreplay.
     */
    subReplay: function _subReplay(events, scriptId, tabMapping, portMapping,
                                   check, cont, timeout) {
      /* copy the properties of the replayer (so that they can be later reset) */
      var props = Object.keys(this);
      var copy = {};
      for (var i = 0, ii = props.length; i < ii; ++i) {
        var prop = props[i];
        copy[prop] = this[prop];
      }

      /* replay the events */
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

      /* set the mappings */
      this.tabMapping = tabMapping;
      this.portMapping = portMapping;

      if (timeout) {
        var timeoutId = setTimeout(function() {
          replay.finish();
        }, timeout);
      }
    },
    /* Get an event object based upon its id */
    getEvent: function _getEvent(eventId) {
      var events = this.events;
      if (!events)
        return null;

      for (var i = 0, ii = events.length; i < ii; ++i) {
        var e = events[i];
        if (e.value.meta.id == eventId)
          return e;
      }
      return null;
    },
    getStatus: function _getStatus() {
      return this.replayState;
    },
    /* Increase the index and update the listeners */
    incrementIndex: function _incrementIndex() {
      this.index += 1;

      var index = this.index;
      var events = this.events;
      if (index < events.length) {
        var e = events[index].value;
        if (e.meta)
          this.updateListeners({type: 'simulate', value: e.meta.id});
      }
    },
    /* Return the index of the next event that should be replayed */ 
    getNextReplayableEventIndex: function _getNextReplayableEventIndex() {
      var index = this.index;
      var events = this.events;
      var replayableEvents = this.replayableEvents;

      for (var i = index, ii = events.length; i < ii; ++i) {
        var v = events[i].type;
        if (events[i].type in replayableEvents)
          return i;
      }
      return events.length;
    },
    /* Return the time in the future the next replayable event should be
     * executed based upon the current timing strategy. */
    getNextTime: function _getNextTime() {
      var timing = params.replay.timingStrategy;

      var curIndex = this.index;
      var nextIndex = this.getNextReplayableEventIndex();
      var events = this.events;
      var waitTime = 0;

      /* Check if there are any events to replay */
      if (nextIndex >= events.length)
        return 0;
      if (curIndex == 0)
        return 1000;

      var defaultTime = 0;
      for (var i = curIndex; i <= nextIndex; ++i)
        defaultTime += events[i].value.timing.waitTime;

      if (events[nextIndex].type == 'capture' &&
          typeof params.replay.captureWait == 'number')
        defaultTime = Math.min(defaultTime, params.replay.captureWait);

      if (defaultTime > 10000)
        defaultTime = 10000;

      if (timing == TimingStrategy.MIMIC) {
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
    /* Set the callback to replay the next event
     *
     * @param {number} time Optional delay when callback should be executed. The
     *     default will use whatever strategy is set in the parameters.
    */
    setNextTimeout: function _setNextTimeout(time) {
      if (typeof time == 'undefined')
        time = this.getNextTime();

      var replay = this;
      this.callbackHandle = setTimeout(function() {
        replay.guts();
      }, time);
    },
    /* Pause the execution by clearing out the callback */
    pause: function _pause() {
      var handle = this.callbackHandle;
      if (handle) {
        clearTimeout(handle);
        this.callbackHandle = null;
      }

      /* tell whatever page was trying to execute the last event to pause */
      this.ports.sendToAll({type: 'pauseReplay', value: null});
    },
    /* Restart by setting the next callback immediately */
    restart: function _restart() {
      if (this.callbackHandle == null) {
        var replayState = this.replayState;
        if (replayState == ReplayState.ACK) {
          this.replayState = ReplayState.REPLAYING;
        }

        this.setNextTimeout(0);
      }
    },
    replayOne: function _replayOne() {
      this.replayState = ReplayState.REPLAYING;
      this.restart();
    },
    skip: function _skip() {
      this.incrementIndex();
      this.replayState = ReplayState.REPLAYING;
    },
    resend: function _resend() {
      if (this.replayState == ReplayState.ACK)
        this.replayState = ReplayState.REPLAYING;
    },
    /* Replay has finished, and now we need to call the continuation */
    finish: function _finish(errorMsg) {
      replayLog.log('finishing replay');

      if (this.replayState == ReplayState.STOPPED)
        return;

      this.replayState = ReplayState.STOPPED;
      this.pause();
      this.time = new Date().getTime() - this.startTime;
      this.record.stopRecording();
      this.updateListeners({type: 'status', value: 'Finished'});

      var record = this.record;
      var replay = this;

      /* save the recorded replay execution */
      var scriptServer = this.scriptServer;
      setTimeout(function() {
        var replayEvents = record.getEvents();
        var captures = replay.captures;
        var scriptId = replay.scriptId;

        if (params.replay.saveReplay && scriptId &&
            replayEvents.length > 0) {
          scriptServer.saveScript('replay ' + scriptId, replayEvents, params,
                                  scriptId);
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
    /* Store the data captured during the execution */
    saveCapture: function _saveCapture(capture) {
      replayLog.log('capture:', capture);
      this.captures.push(capture);
      this.updateListeners({type: 'capture', value: capture.innerText.trim()});

      /* in case the server down, we can save it to local storage */
      if (params.replay.saveCaptureLocal) {
        var capId = this.scriptId + ':' + capture.id;
        var storage = {};
        storage[capId] = JSON.stringify(capture);
        chrome.storage.local.set(storage);
      }
    },
    /* Given an event, find the corresponding port */
    getMatchingPort: function _getMatchingPort(eventObj) {
      var portMapping = this.portMapping;
      var tabMapping = this.tabMapping;

      var v = eventObj.value;
      var frame = v.frame;
      var port = frame.port;
      var tab = frame.tab;

      /* lets find the corresponding port */
      var replayPort = null;
      /* we have already seen this port, reuse existing mapping */
      if (port in portMapping) {
        replayPort = portMapping[port];
        replayLog.log('port already seen', replayPort);

      /* we have already seen this tab, find equivalent port for tab
       * for now we will just choose the last port added from this tab */
      } else if (tab in tabMapping) {
        var replayPort = this.findPortInTab(tabMapping[tab], frame);

        if (replayPort) {
          portMapping[port] = replayPort;
          replayLog.log('tab already seen, found port:', replayPort);
        } else {
          this.setNextTimeout(params.replay.defaultWait);
          replayLog.log('tab already seen, no port found');
        }
      /* nothing matched, so we need to open new tab */
      } else {
        var allTabs = Object.keys(this.ports.tabIdToTab);

        /* create list of all current tabs that are mapped to */
        var revMapping = {};
        for (var t in tabMapping) {
          revMapping[tabMapping[t]] = true;
        }

        /* find all tabs that exist, but are not mapped to */
        var unusedTabs = [];
        for (var i = 0, ii = allTabs.length; i < ii; ++i) {
          var tabId = allTabs[i];
          if (!revMapping[tabId])
            unusedTabs.push(tabId);
        }

        /* if this is not the first event, and there is exactly one unmapped tab,
         * then lets assume this new tab should match */
        if (this.firstEventReplayed && unusedTabs.length == 1) {
          tabMapping[frame.tab] = unusedTabs[0];
          this.setNextTimeout(0);
          return;
        }

        /* create a new tab, and update the mapping */
        var replay = this;
        var openNewTab = function() {
          replayLog.log('need to open new tab');
          chrome.tabs.create({url: frame.topURL, active: true},
            function(newTab) {
              replayLog.log('new tab opened:', newTab);
              var newTabId = newTab.id;
              replay.tabMapping[frame.tab] = newTabId;
              replay.ports.tabIdToTab[newTabId] = newTab;
              replay.setNextTimeout(params.replay.defaultWaitNewTab);
            }
          );
        };

        /* automatically open up a new tab for the first event */
        if (!this.firstEventReplayed && params.replay.openNewTab) {
          openNewTab();
        /* ask the user whether the page exists, or a new tab should be opened */
        } else {
          var prompt = 'Does the page exist? If so select the tab then type ' +
                       "'yes'. Else type 'no'.";
          var user = this.user;
          user.question(prompt, yesNoCheck, 'no', function(answer) {
            if (answer == 'no') {
              openNewTab();
            } else if (answer == 'yes') {
              var tabInfo = user.getActivatedTab();
              chrome.tabs.get(tabInfo.tabId, function(tab) {
                replayLog.log('mapping tab:', tab);
                var tabId = tab.id;
                replay.tabMapping[frame.tab] = tabId;
                replay.setNextTimeout(0);
              });
            }
          });
        }
      }
      return replayPort;
    },
    /* Given the frame information from the recorded trace, find a 
     * corresponding port */ 
    findPortInTab: function _findPortInTab(newTabId, frame) {
      var ports = this.ports;
      var portInfo = ports.getTabInfo(newTabId);
      replayLog.log('trying to find port in tab:', portInfo);

      if (!portInfo)
        return null;

      /* if its the top frame, then ensure the urls match */
      if (frame.topFrame) {
        replayLog.log('assume port is top level page');
        var topFrame = portInfo.top;
        if (topFrame) {
          if (matchUrls(frame.URL, topFrame.URL))
            return ports.getPort(topFrame.portId);
        }
      /* if its an iframe, find all frames with matching urls */
      } else {
        replayLog.log('try to find port in one of the iframes');
        var frames = portInfo.frames;
        var urlFrames = [];
        for (var i = 0, ii = frames.length; i < ii; i++) {
          if (frames[i].URL == frame.URL) {
            urlFrames.push(frames[i]);
          }
        }

        /* no matching frames */
        if (urlFrames.length == 0) {
          return null;
        } else if (urlFrames.length == 1) {
          return ports.getPort(urlFrames[0].portId);
        }

        replayLog.warn('multiple iframes with same url:', urlFrames);
      }
      return null;
    },
    /* Check if an event has already been replayed */
    checkReplayed: function _checkReplayed(eventObj) {
      var id = eventObj.meta.id;
      var recordedEvents = this.record.events;
      for (var i = recordedEvents.length - 1; i >= 0; --i) {
        var recordedEvent = recordedEvents[i];
        if (recordedEvent.value.meta.recordId == id)
          return true;
      }
      return false;
    },
    /* Check if executing an event has timed out */
    checkTimeout: function _checkTimeout() {
      var eventTimeout = params.replay.eventTimeout;
      if (eventTimeout != null && eventTimeout > 0) {
        var timeoutInfo = this.timeoutInfo;
        var curTime = new Date().getTime();

        /* we havent changed events */
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
    /* The main function which dispatches events to the content script */
    guts: function _guts() {
      try {
        if (this.checkTimeout()) {
          /* lets call the end of this script */
          var msg = 'event ' + this.index + ' has times out';
          replayLog.log(msg);
          this.finish(msg);
          return;
        }

        var replayState = this.replayState;

        if (replayState == ReplayState.ACK) {
          var ack = this.ack;
          if (!ack) {
            this.setNextTimeout(params.replay.defaultWait);
            replayLog.log('continue waiting for replay ack');
            return;
          }

          type = ack.type;
          if (type == Ack.SUCCESS) {
            replayLog.log('found replay ack');
            this.incrementIndex();

            if (!this.replayOne)
              this.setNextTimeout();
            else
              this.pause();

            this.replayState = ReplayState.REPLAYING;
          } else if (type == Ack.PARTIAL) {
            throw 'partially executed commands';
          }
          return;
        }

        var events = this.events;
        var index = this.index;

        /* check if the script finished */
        if (index >= events.length) {
          this.finish();
          return;
        }

        var e = events[index];
        var v = e.value;
        var type = e.type;

        if (type != 'dom' && type != 'capture') {
          replayLog.log('skipping event:', e);
          this.incrementIndex();
          this.setNextTimeout(0);
          return;
        }

        /* check if event has been replayed, if so skip it */
        if (params.replay.cascadeCheck && this.checkReplayed(v)) {
          replayLog.debug('skipping event: ' + e.id);
          this.incrementIndex();
          if (!this.replayOne)
            this.setNextTimeout();
          else 
            this.pause();

          this.replayState = ReplayState.REPLAYING;
          return;
        }

        var meta = v.meta;
        replayLog.log('background replay:', meta.id, v);

        /* if no matching port, try again later */
        var replayPort = this.getMatchingPort(e);
        if (!replayPort)
          return;

        /* if there is a trigger, then check if trigger was observed */
        var triggerEvent = this.getEvent(v.timing.triggerEvent);
        if (triggerEvent) {
          var recordEvents = this.record.events;

          var matchedEvent = null;
          for (var i = recordEvents.length - 1; i >= 0; --i) {
            var otherEvent = recordEvents[i];
            if (otherEvent.type == triggerEvent.type &&
                otherEvent.value.data.type == triggerEvent.value.data.type &&
                matchUrls(otherEvent.value.data.url,
                          triggerEvent.value.data.url, 0.9)) {
              matchedEvent = otherEvent;
              break;
            }
          }

          if (!matchedEvent) {
            this.setNextTimeout(params.replay.defaultWait);
            return;
          }
        }

        /* we have hopefully found a matching port, lets dispatch to that port */
        var type = v.data.type;

        try {
          if (replayState == ReplayState.REPLAYING) {
            this.ack = null;
            if (e.type == 'dom') {
              /* group atomic events */
              var eventGroup = [];
              var endEvent = meta.endEventId;
              if (params.replay.atomic && endEvent) {
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

              replayPort.postMessage({type: 'dom', value: eventGroup});
              this.replayState = ReplayState.ACK;

              this.firstEventReplayed = true;

              replayLog.log('sent message', eventGroup);
              replayLog.log('start waiting for replay ack');
              this.setNextTimeout(0);
            }
          } else {
            throw 'unknown replay state';
          }
        } catch (err) {
          replayLog.error('error:', err.message, err);
          /* a disconnected port generally means that the page has been
           * navigated away from */
          if (err.message == 'Attempting to use a disconnected port object') {
            var strategy = params.replay.brokenPortStrategy;
            if (strategy == BrokenPortStrategy.RETRY) {
              if (v.data.cascading) {
                /* skip the rest of the events */
                this.incrementIndex();
                this.setNextTimeout(0);
              } else {
                /* remove the mapping and try again */
                delete this.portMapping[e.value.frame.port];
                this.setNextTimeout(0);
              }
            } else if (strategy == BrokenPortStrategey.SKIP) {
              /* we probably navigated away from the page so lets skip all
               * events that use this same port */
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
    /* Remove any information adding during replay */
    resetEvent: function _resetEvent(e) {
      var v = e.value;
      if (v.reset)
        v.reset = {};
    },
    receiveAck: function _receiveAck(ack) {
      this.ack = ack;
      if (ack.setTimeout)
        this.setNextTimeout(0);
    }
  };

  return Replay;
})();

/* The interface for the user to interact with the replayer. Can be used to
 * directly query the user. */
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
    /* Query the user
     *
     * @param {string} prompt Text to show the user
     * @param {function} validatioon Check whether the answer is as exepcted
     * @param defaultAnswer Answer to use during automated periods
     * @param {function} callback Continuation to pass answer into
     */
    question: function _question(prompt, validation, defaultAnswer, callback) {
      var panel = this.panel;
      var user = this;

      if (params.replay.defaultUser) {
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
    /* Set which tab the user has selected */
    activatedTab: function _activatedTab(tabInfo) {
      this.activeTab = tabInfo;
    },
    getActivatedTab: function _getActivatedTab() {
      return this.activeTab;
    },
    /* Question posed from the content script */
    contentScriptQuestion: function _question(prompt, port) {
      this.question(prompt, function() {return true;}, '', function(answer) {
        port.postMessage({type: 'promptResponse', value: answer});
      });
    }
  };

  return User;
})();

/* Coordinates the model (Record, Replay, User) and view (Panel) */
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
    /* The user started recording */
    start: function() {
      ctlLog.log('start');
      this.record.startRecording();

      /* Update the UI */
      chrome.browserAction.setBadgeBackgroundColor({color: [255, 0, 0, 64]});
      chrome.browserAction.setBadgeText({text: 'ON'});
    },
    stop: function() {
      ctlLog.log('stop');
      this.record.stopRecording();

      /* Update the UI */
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
      this.scriptServer.saveScript(name, events, params);
    },
    getScript: function(name) {
      ctlLog.log('getting script');
      var controller = this;
      this.scriptServer.getScript(name, true,
          function(scriptId, events) {
            controller.setEvents(scriptId, events);
          });
    },
    setEvents: function(scriptId, events) {
      this.record.setEvents(events);
      this.record.setScriptId(scriptId);
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

/* Instantiate components */
var ports = new PortManager();
var scriptServer = new ScriptServer(params.server.url);

var user = new User(user);
var record = new Record(ports);
var replay = new Replay(ports, scriptServer, user);
var controller = new Controller(record, replay, scriptServer, ports);
var panel = new Panel(controller);
user.setPanel(panel);

/* Add event handlers */
var bgLog = getLog('background');

/* The first message content scripts send is to get a unique id */
function handleIdMessage(request, sender, sendResponse) {
  bgLog.log('background receiving:', request, 'from', sender);
  if (request.type == 'getId') {
    var portId = ports.getNewId(request.value, sender);
    if (portId)
      sendResponse({type: 'id', value: portId});
  }
}

var recordHandlers = {
  'dom': function(port, request) {
    record.addEvent(request, port.name);
  },
  'capture': function(port, request) {
    record.addEvent(request, port.name);
  },
  'updateEvent': function(port, request) {
    record.updateEvent(request, port.name);
  }
}

var replayHandlers = {
  'dom': function(port, request) {
    replay.record.addEvent(request, port.name);
  },
  'capture': function(port, request) {
    replay.record.addEvent(request, port.name);
  },
  'updateEvent': function(port, request) {
    replay.record.updateEvent(request, port.name);
  },
  'saveCapture': function(port, request) {
    replay.saveCapture(request.value);
  },
  'ack': function(port, request) {
    replay.receiveAck(request.value);
  },
  'prompt': function(port, request) {
    user.contentScriptQuestion(request.value, port);
  }
}

var handlers = {
  'alert': function(port, request) {
    panel.addMessage('[' + port.name + '] ' + request.value);
  },
  'getRecording': function(port, request) {
    var recStatus = record.getStatus();
    var repStatus = replay.record.getStatus();

    if (recStatus == RecordState.RECORDING)
      port.postMessage({type: 'recording', value: recStatus});
    else if (repStatus == RecordState.REPLAYING)
      port.postMessage({type: 'recording', value: repStatus});
    else
      port.postMessage({type: 'recording', value: RecordState.STOPPED});
  },
  'getParams': function(port, request) {
    port.postMessage({type: 'params', value: params});
  },
  'url': function(port, request) {
    ports.updateUrl(port, request.value);
  }
}

/* Handle messages coming from the content scripts */
function handleMessage(port, request) {
  var type = request.type;
  var state = request.state;

  bgLog.log('handle message:', request, type, state);

  if (state == RecordState.RECORDING && type in recordHandlers) {
    recordHandlers[type](port, request);
  } else if (state == RecordState.REPLAYING && type in replayHandlers) {
    replayHandlers[type](port, request);
  } else if (type in handlers) {
    handlers[type](port, request);
  } else {
    bgLog.error('cannot handle message:', request);
  }
}

/* Attach the event handlers to their respective events */
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

/* Listen to web requests */
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

var filter = {urls: ['http://*/*', 'https://*/*'],
  types: ['main_frame', 'sub_frame', 'script', 'object', 'xmlhttprequest']};

chrome.webRequest.onBeforeRequest.addListener(function(details) {
  bgLog.log('request start', details);
  addWebRequestEvent(details, 'start');
}, filter, ['blocking']);

chrome.webRequest.onCompleted.addListener(function(details) {
  bgLog.log('completed', details);
  addWebRequestEvent(details, 'completed');
}, filter);

ports.sendToAll({type: 'params', value: params});
controller.stop();
controller.getScript('test');

/*
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
*/