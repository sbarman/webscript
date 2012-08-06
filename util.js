// send a message to all other tabs, except for yourself
var sendToAll = function(message) {
  chrome.tabs.getCurrent(function(curTab) {
    chrome.tabs.query({}, function(tabs) {
      console.log("background sending:", message);
      var curId = curTab.id;
      for (var i = 0, ii = tabs.length; i < ii; ++i) {
        var id = tabs[i].id;
        if (id != curId) {
         chrome.tabs.sendMessage(tabs[i].id, message);
        }
      }
    });
  });
}; 

// taken from http://stackoverflow.com/questions/2631820/im-storing-click-coordinates-in-my-db-and-then-reloading-them-later-and-showing/2631931#2631931
function getPathTo(element) {
  if (element.id !== '')
    return 'id("' + element.id + '")';
  if (element.tagName.toLowerCase() === "html")
    return element.tagName;
    
  var ix = 0;
  var siblings = element.parentNode.childNodes;
  for (var i = 0, ii = siblings.length; i < ii; i++) {
    var sibling = siblings[i];
    if (sibling === element)
      return getPathTo(element.parentNode) + '/' + element.tagName +
             '[' + (ix + 1) + ']'; 
    if (sibling.nodeType === 1 && sibling.tagName === element.tagName)
      ix++;
  }
}

// convert an xpath expression to an array of DOM nodes
var xPathToNodes = function(xpath) {
  var q = document.evaluate(xpath, document, null, XPathResult.ANY_TYPE, null);
  var results = [];

  var next = q.iterateNext();
  while (next) {
    results.push(next);
    next = q.iterateNext();
  }
  return results;
};

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
    'mouseout': false
  }
}

var params = {
  events: capturedEvents,
  timeout: 1000
}

//var eventMatchers = {
//  'HTMLEvents': /^(?:load|unload|abort|error|select|change|submit|reset|focus|blur|resize|scroll)$/,
//  'MouseEvents': /^(?:click|dblclick|mouse(?:down|up|over|move|out))$/
//}


// taken from http://stackoverflow.com/questions/6157929/how-to-simulate-mouse-
// click-using-javascript. used to simulate events on a page
function simulate(element, eventName) {

  function extend(destination, source) {
    for (var property in source)
      destination[property] = source[property];
    return destination;
  }
  
  var defaultOptions = {
    pointerX: 0,
    pointerY: 0,
    button: 0,
    ctrlKey: false,
    altKey: false,
    shiftKey: false,
    metaKey: false,
    bubbles: true,
    cancelable: true
  }

  var options = extend(defaultOptions, arguments[2] || {});
  var oEvent, eventType = null;

  for (var name in params.events) {
    if (eventName in params.events[name]) {
      eventType = name;
      break;
    }
  }

  if (!eventType)
    throw new SyntaxError('Only HTMLEvents and MouseEvents interfaces are ' +
                          'supported');

  if (document.createEvent) {
    oEvent = document.createEvent(eventType);
    if (eventType == 'HTMLEvents') {
      oEvent.initEvent(eventName, options.bubbles, options.cancelable);
    } else {
      oEvent.initMouseEvent(eventName, options.bubbles, options.cancelable,
          document.defaultView, options.button, options.pointerX,
          options.pointerY, options.pointerX, options.pointerY, options.ctrlKey,
          options.altKey, options.shiftKey, options.metaKey, options.button,
          element);
    }
    element.dispatchEvent(oEvent);
  } else {
    options.clientX = options.pointerX;
    options.clientY = options.pointerY;
    var evt = document.createEventObject();
    oEvent = extend(evt, options);
    element.fireEvent('on' + eventName, oEvent);
  }
  return element;
}
