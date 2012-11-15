/* -*- Mode: Java; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* vim: set shiftwidth=2 tabstop=2 autoindent cindent expandtab: */

'use strict';

var params = null;

(function() {
  // List of all events and whether or not we should capture them
  var events = {
    'Event': {
      //'abort': true,
      'blur': true,
      'change': true,  // change event occurs before focus is lost (blur)
      'copy': true,
      'cut': true,
      'error': true,
      'focus': true,
      'input': true,  // input event occurs on every keystroke (or cut / paste)
      'load': false,
      'paste': true,
      'reset': true,
      'resize': false,
      'scroll': false,
      'select': true,
      'submit': true,
      'unload': false,
    },
    'MouseEvent': {
      'click': true,
      'dblclick': true,
      'mousedown': true,
      'mousemove': false,
      'mouseout': false,
      'mouseover': false,
      'mouseup': true,
      'mousewheel': false,
  //    'dragenter': false,
  //    'dragleave': false,
    },
    'KeyboardEvent': {
      'keydown': true,
      'keyup': true,
      'keypress': true,
    },
    'TextEvent': {
      'textInput': false,  // similar to input event, doesn trigger with cp/pst
    }
  };
  
  var defaultProps = {
    'Event': {
      'type': true,
      'bubbles': true,
      'cancelable': true,
      'timeStamp': 0
    },
    'MouseEvent': {
      'type': true,
      'bubbles': true,
      'cancelable': true,
      'detail': 0,
      'screenX': 0,
      'screenY': 0,
      'clientX': 0,
      'clientY': 0,
      'ctrlKey': false,
      'altKey': false,
      'shiftKey': false,
      'metaKey': false,
      'button': 0,
      'timeStamp': 0
    },
    'KeyboardEvent': {
      'type': true,
      'bubbles': true,
      'cancelable': true,
      'ctrlKey': false,
      'altKey': false,
      'shiftKey': false,
      'metaKey': false,
      'keyCode': 0,
      'charCode': 0,
      'timeStamp': 0
    },
    'TextEvent': {
      'type': true,
      'bubbles': true,
      'cancelable': true,
      'data': '',
      'inputMethod': 0,
      'locale': '',
      'timeStamp': 0
    }
  };

  var synthesis = {
    omittedProps: ["innerHTML", "outerHTML", "innerText", "outerText",
        "textContent", "className", "childElementCount", "scrollHeight",
        "scrollWidth", "clientHeight", "clientWidth", "clientTop", "clientLeft",
        "offsetHeight", "offsetWidth", "offsetTop", "offsetLeft"]
  };

  var logging = {
    level: 1,
    enabled: ["event"]
  }
  
  params = {
    simultaneous: true,
    timing: 0,
    events: events,
    logging: logging,
    synthesis: synthesis,
    //server: "http://webscriptdb.herokuapp.com/api/",
    server: "http://sbarman.webfactional.com/api/",
    defaultProps: defaultProps
  };

})();
