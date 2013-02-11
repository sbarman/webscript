/* -*- Mode: Java; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* vim: set shiftwidth=2 tabstop=2 autoindent cindent expandtab: */

'use strict';

var annotationEvents = {};

(function() {
  function clickOptionReplay(element, eventMessage) {
    element.selected = true;
  }

  function clickSelectRecord(eventData, eventMessage) {
    eventMessage.value = eventData.target.value;
  }

  function clickSelectReplay(element, eventMessage) {
    element.value = eventMessage.value;
  }

  function keypressReplay(element, eventMessage) {
    if ((typeof element.value) !== 'undefined') {
      element.value = element.value + String.fromCharCode(
                      eventMessage.charCode);
    }
  }

  annotationEvents = {
/*    "keypress": {
      guard: function(eventData, eventMessage) {
        return eventMessage.type == "keypress";
      },
      record: null,
      replay: null
    },
    "clickOption": {
      guard: function(eventData, eventMessage) {
        return eventMessage.nodeName == "option" &&
               eventMessage.type == "click";
      },
      record: null,
      replay: clickOptionReplay
    },
    "clickSelect": {
      guard: function(eventData, eventMessage) {
        return eventMessage.nodeName == "select" &&
               eventMessage.type == "click";
      },
      record: clickSelectRecord,
      replay: clickSelectReplay
    },
*/
  };
})();
