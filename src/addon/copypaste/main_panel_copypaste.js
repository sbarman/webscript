/* -*- Mode: Java; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* vim: set shiftwidth=2 tabstop=2 autoindent cindent expandtab: */

'use strict';

var log = getLog('background');

Replay.prototype.addonReset.push(function() {
  this.clipboard = "";
  this.ports.sendToAll({type: 'clipboard', value: ''});
});

Replay.prototype.setClipboard = function _setClipboard(text) {
  this.clipboard = text;
  this.ports.sendToAll({type: 'clipboard', value: text});
};

replayHandlers['setClipboard'] = function(port, request) {
  replay.setClipboard(request.value);
}

replayHandlers['getClipboard'] = function(port, request) {
  port.postMessage({type: 'clipboard', value: replay.clipboard});
}
