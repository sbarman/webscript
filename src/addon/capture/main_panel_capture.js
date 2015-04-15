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

Replay.prototype.addonTiming.push(function() {
  var index = this.index;
  var events = this.events;

  if (index < events.length && events[index].type == 'capture')
    return 0;
});

Replay.prototype.simulateCapture = function _simulateCapture(v) {
  var meta = v.meta;

  log.log('background replay capture:', meta.id, v);

  /* if no matching port, try again later */
  var replayPort = this.getMatchingPort(v);
  if (!replayPort)
    return;

  if (!this.triggerCheck(v)) {
    this.setNextTimeout(params.replay.defaultWait);
    return;
  }

  /* we hopefully found a matching port, lets dispatch to that port */
  try {
    /* delay this message so page can finish processing AJAX requests */
    setTimeout(function() {
      replayPort.postMessage({type: 'simulateCapture', value: v});
    }, 300);
    this.replayState = ReplayState.ACK;
    this.ack = null;

    this.firstEventReplayed = true;

    log.log('start waiting for replay ack');
    this.setNextTimeout(0);
  } catch (err) {
    log.error('error:', err.message, err);
    /* a disconnected port generally means that the page has been
     * navigated away from */
    if (err.message == 'Attempting to use a disconnected port object') {
      /* remove the mapping and try again */
      delete this.portMapping[v.frame.port];
      this.setNextTimeout(0);
    } else {
      err.printStackTrace();
    }
  }
};

Replay.prototype.addonCapture = [];

/* Store the data captured during the execution */
Replay.prototype.saveCapture = function _saveCapture(capture) {

  /* handle any event replaying the addons need */
  var addonCapture = this.addonCapture;
  for (var j = 0, jj = addonCapture.length; j < jj; ++j) {
    addonCapture[j].call(this, capture);
  }


  var text = capture.innerText.trim();
  this.captures.push(text);
  this.updateListeners({type: 'captureText', value: text});

  log.log('Captured text:', text, capture);

  /* set the success ack so the script continues */
  this.ack = {type: Ack.SUCCESS};

  /* in case the server down, we can save it to local storage */
  if (params.capture.saveCaptureLocal) {
    var captureId = this.scriptId + ':' + capture.eventId;
    var storage = {};
    storage[captureId] = JSON.stringify(capture);
    chrome.storage.local.set(storage);
  }

  this.screenshot('capture');
};

/* Callback when capture button is clicked */
Controller.prototype.capture = function() {
  this.record.captureNode();
};

/* Callback when capture button is clicked */
Controller.prototype.cancelCapture = function() {
  this.record.cancelCapture();
};

replayHandlers['saveCapture'] = function(port, request) {
  replay.saveCapture(request.value);
};
