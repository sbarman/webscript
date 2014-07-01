'use strict';

var SimpleRecord = (function SimpleRecordClosure() {
  function SimpleRecord() {
    // do nothing
  }

  SimpleRecord.prototype = {
    addNodeAddressing: function _addNodeAddressing(callback) {
      addonPostRecord.push(callback);
    },
    addNodeRetrieval: function _addNodeRetrieval(callback) {
      addonTarget.push(callback);
    }
  };

  return new SimpleRecord();
})();
