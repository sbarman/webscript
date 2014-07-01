/* -*- Mode: Java; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* vim: set shiftwidth=2 tabstop=2 autoindent cindent expandtab: */

'use strict';

var SimpleRecord = (function SimpleRecordClosure() {
  function SimpleRecord() {
    // do nothing
  }

  SimpleRecord.prototype = {
    startRecording: function _startRecording() {
      controller.reset();
      controller.start();
    },
    stopRecording: function _stopRecording() {
      controller.stop();
      return record.getEvents();
    },
    replay: function _replay(trace) {
      controller.replayScript(null, trace, null);
    }
  };

  return new SimpleRecord();
})();
