/* -*- Mode: Java; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* vim: set shiftwidth=2 tabstop=2 autoindent cindent expandtab: */

'use strict';

var extendEvents = {};

(function() {
  function changeRecord(eventData, eventMessage) {
    var element = eventData.srcElement;
    var nodeName = element.nodeName.toLowerCase();
    if (nodeName == "select") {
      eventMessage.value = element.value;
      //throw "not sure what needs to be done";
    } else if (nodeName == "textarea") {
      eventMessage.value = element.value;
    } else if (nodeName == "input") {
      var elementType = element.type.toLowerCase();
      if (elementType == "checkbox" || elementType == "radio") {
        eventMessage.checked = element.checked;
      } else if (elementType == "password" || elementType == "search" ||
                 elementType == "text" || elementType == "file" ||
                 elementType == "range") {
        eventMessage.value = element.value
      }
    }
  }
  
  function changeReplay(element, eventMessage) {
    var nodeName = element.nodeName.toLowerCase();
    if (nodeName == "select") {
      element.value = eventMessage.value;
      //throw "not sure what needs to be done";
    } else if (nodeName == "textarea") {
      element.value = eventMessage.value;
    } else if (nodeName == "input") {
      var elementType = element.type.toLowerCase();
      if (elementType == "checkbox" || elementType == "radio") {
        element.checked = eventMessage.checked;
      } else if (elementType == "password" || elementType == "search" ||
                 elementType == "text" || elementType == "file" ||
                 elementType == "range") {
        element.value = eventMessage.value;
      }
    }
  }
  
  extendEvents = {
    "change": {
      record: changeRecord,
      replay: changeReplay
    }
  };
})();
