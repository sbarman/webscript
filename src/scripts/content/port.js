/* -*- Mode: Java; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* vim: set shiftwidth=2 tabstop=2 autoindent cindent expandtab: */

'use strict';

var Port = (function PortClosure() {
  function Port(id) {
    this.port = chrome.extension.connect({name: id});
  }

  Port.prototype = {
    postMessage: function _postMessage(msg) {
      this.port.postMessage(msg);
    },
    addListener: function _addListener(listener) {
      this.port.onMessage.addListener(listener);
    }
  };

  return Port;
})();

