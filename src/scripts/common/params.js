/* -*- Mode: Java; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* vim: set shiftwidth=2 tabstop=2 autoindent cindent expandtab: */

'use strict';

var params = null;
var defaultParams = null;

var Compensation = {
  NONE: 0,
  SYNTH: 1,
  FORCED: 2
};

var BrokenPortStrategy = {
  RETRY: 0,
  SKIP: 1
};

var TimingStrategy = {
  MIMIC: 0,
  SPEED: 1,
  SLOWER: 2,
  SLOWEST: 3,
  FIXED_1: 4,
  RANDOM_0_3: 5,
  PERTURB_0_3: 6,
  PERTURB: 7
};

var TimeoutStrategy = {
  ERROR: 0,
  SKIP: 1
};

(function() {
  // List of all events and whether or not we should capture them
  var events = {
    'Event': {
      //'abort': true,
      'change': true,  // change event occurs before focus is lost (blur)
      'copy': true,
      'cut': true,
      'error': false,
      'input': true,  // input event occurs on every keystroke (or cut / paste)
      'load': false,
      'paste': true,
      'reset': true,
      'resize': false,
      'scroll': false,
      'select': true,
      'submit': true,
      'unload': false
    },
    'FocusEvent': {
      'focus': true,
      'blur': true
    },
    'MouseEvent': {
      'click': true,
      'dblclick': true,
      'mousedown': true,
      'mousemove': false,
      'mouseout': false,
      'mouseover': false,
      'mouseup': true,
      'mousewheel': false
  //    'dragenter': false,
  //    'dragleave': false,
    },
    'KeyboardEvent': {
      'keydown': true,
      'keyup': true,
      'keypress': true
    },
    'TextEvent': {
      'textInput': true  // similar to input event, doesn trigger with cp/pst
    }
  };

  var defaultProps = {
    'Event': {
      'type': true,
      'bubbles': true,
      'cancelable': true,
      'timeStamp': 0
    },
    'FocusEvent': {
      'type': true,
      'bubbles': true,
      'cancelable': true,
      'detail': 0,
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
      'timeStamp': 0,
      'keyIdentifier': '',  // nonstandard to Chrome
      'keyLocation': 0  // nonstandard to Chrome
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

  defaultParams = {
    user: 'sbarman',
    simultaneous: false, // this is probably broken now
    localSnapshot: true,
    events: events,
    defaultProps: defaultProps,
    logging: {
      level: 1,
      enabled: ['ports', 'event', 'record', 'replay', 'script', 'background',
                'content', 'synthesis', 'benchmark', 'target', 'controller']
    },
    synthesis: {
      enabled: true,
      omittedProps: ['innerHTML', 'outerHTML', 'innerText', 'outerText',
          'textContent', 'className', 'childElementCount', 'scrollHeight',
          'scrollWidth', 'clientHeight', 'clientWidth', 'clientTop',
          'clientLeft', 'offsetHeight', 'offsetWidth', 'offsetTop',
          'offsetLeft', 'text', 'valueAsNumber', 'id', 'class', 'xpath'],
      depth: 2,
      optimization: 2
    },
    recording: {
      allEventProps: true,
      delayEvents: false,
      delay: 0,
      cancelUnrecordedEvents: false,
      listenToAllEvents: false
    },
    replaying: {
      saveReplay: true,
      delayEvents: false,
      cancelUnknownEvents: false,
      skipCascadingEvents: true,
      dummyCascadingEvents: false,
      eventTimeout: null,
      targetTimeout: 15,
      compensation: Compensation.FORCED,
      timingStrategy: TimingStrategy.MIMIC,
      defaultWait: 100,
      defaultWaitNewTab: 4000,
      highlightTarget: true,
      brokenPortStrategy: BrokenPortStrategy.RETRY,
      atomic: true,
      cascadeCheck: true,
      urlSimilarity: 0.8,
      defaultUser: false
    },
    //server: 'http://sbarman.webfactional.com/api/',
    server: 'http://127.0.0.1:8000/api/',
    benchmarking: {
      timeout: 600,
      targetInfo: true
    }
  };

  if (window.jQuery)
    params = jQuery.extend(true, {}, defaultParams);
  else
    params = defaultParams;

})();
