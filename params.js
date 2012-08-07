// List of all events and whether or not we should capture them
var capturedEvents = {
  'HTMLEvents': {
    'load': false,
    'unload': false,
    'abort': true,
    'error': true,
    'select': true,
    'change': true,
    'submit': true,
    'reset': true,
    'focus': false,
    'blur': false,
    'resize': false,
    'scroll': false
  },
  'MouseEvents': {
    'click': true,
    'dblclick': true,
    'mousedown': true,
    'mouseup': true,
    'mouseover': false,
    'mousemove': false,
    'mouseout': false,
    'dragenter': false,
    'dragleave': false
  }
}

var params = {
  events: capturedEvents,
  timeout: 1000
}
