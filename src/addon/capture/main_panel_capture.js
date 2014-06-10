/* -*- Mode: Java; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* vim: set shiftwidth=2 tabstop=2 autoindent cindent expandtab: */

'use strict';

var log = getLog('background');

/* Record time changes */

/* Tell content scripts to get into capture mode */
Record.prototype.captureNode = function _captureNode() {
  if (this.recordState == RecordState.RECORDING) {
    this.ports.sendToAll({type: 'capture', value: null});
  }
};

/* Tell other ports that capturing is finished */
Record.prototype.cancelCapture = function _cancelCapture() {
  this.ports.sendToAll({type: 'cancelCapture', value: null});
}

/* Receieved a capture event from one of the ports */
recordHandlers.capture = function(port, request) {
  record.cancelCapture();
  record.addEvent(request, port.name);
}

/* Replay time changes */

/* Update the event type to simulate function mapping */
Replay.prototype.replayableEvents.capture = 'simulateCapture';

/* data captured during replay */ 
Replay.prototype.addonReset.push(function() {
  this.captures = [];
});

Replay.prototype.simulateCapture = function _simulateCapture(e) {
  var v = e.value;
  var meta = v.meta;

  log.log('background replay:', meta.id, v);

  /* if no matching port, try again later */
  var replayPort = this.getMatchingPort(e);
  if (!replayPort)
    return;

  /* we hopefully found a matching port, lets dispatch to that port */
  var type = v.data.type;

  try {
    replayPort.postMessage({type: 'simulateCapture', value: v});
    this.replayState = ReplayState.ACK;

    this.firstEventReplayed = true;

    log.log('start waiting for replay ack');
    this.setNextTimeout(0);
  } catch (err) {
    log.error('error:', err.message, err);
    /* a disconnected port generally means that the page has been
     * navigated away from */
    if (err.message == 'Attempting to use a disconnected port object') {
      /* remove the mapping and try again */
      delete this.portMapping[e.value.frame.port];
      this.setNextTimeout(0);
    } else {
      err.printStackTrace();
    }
  }
};

/* Store the data captured during the execution */
Replay.prototype.saveCapture = function _saveCapture(capture) {
  this.captures.push(capture);
  this.updateListeners({type: 'captureText', value: capture.innerText.trim()});

  /* set the success ack so the script continues */
  this.ack = {type: Ack.SUCCESS};

  /* in case the server down, we can save it to local storage */
  if (params.replay.saveCaptureLocal) {
    var capId = this.scriptId + ':' + capture.id;
    var storage = {};
    storage[capId] = JSON.stringify(capture);
    chrome.storage.local.set(storage);
  }
},

/* Callback when capture button is clicked */
Controller.prototype.capture = function() {
  this.record.captureNode();
},

replayHandlers['capture'] = function(port, request) {
  replay.record.addEvent(request, port.name);
};

replayHandlers['saveCapture'] = function(port, request) {
  replay.saveCapture(request.value);
};
