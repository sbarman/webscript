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

  function keypressRecord(eventData, eventMessage) {
    if ("value" in eventData.target)
      eventMessage.value = eventData.target.value;
  }
  
  function keypressReplay(element, eventMessage) {
    if ("value" in eventMessage)
      element.value = eventMessage.value;
  }
  
  annotationEvents = {
    "keypress": {
      guard: function(eventData, eventMessage) {
        return eventMessage.type == "keypress";
      },
      record: keypressRecord,
      replay: keypressReplay
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
  };
})();
