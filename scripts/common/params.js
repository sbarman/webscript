// List of all events and whether or not we should capture them
var capturedEvents = {
  'Events': {
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
  'MouseEvents': {
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
  'KeyEvents': {
    'keydown': false,
    'keyup': false,
    'keypress': true,
  },
  'TextEvents': {
    'textInput': false,  // similar to input event, doesn trigger with cp / pst
  }
}

var defaultOptions = {
  'Events': {
    'type': true,
    'bubbles': true,
    'cancelable': true
  },
  'MouseEvents': {
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
  },
  'KeyEvents': {
    'type': true,
    'bubbles': true,
    'cancelable': true,
    'view': null,
    'ctrlKey': false,
    'altKey': false,
    'shiftKey': false,
    'metaKey': false,
    'keyCode': 0,
    'charCode': 0
  },
  'TextEvents': {
    'type': true,
    'bubbles': true,
    'cancelable': true,
    'data': '',
    'inputMethod': 0,
    'locale': ''
  }
}

// default node is document
var node = {
  'HashChange': window
}

var params = {
  events: capturedEvents,
  timeout: 2000,
  defaultProps: defaultOptions
}
