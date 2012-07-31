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

// taken from http://stackoverflow.com/questions/6157929/how-to-simulate-mouse-click-using-javascript
function simulate(element, eventName) {

  function extend(destination, source) {
    for (var property in source)
      destination[property] = source[property];
    return destination;
  }
  
  var eventMatchers = {
    'HTMLEvents': /^(?:load|unload|abort|error|select|change|submit|reset|focus|blur|resize|scroll)$/,
    'MouseEvents': /^(?:click|dblclick|mouse(?:down|up|over|move|out))$/
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

  for (var name in eventMatchers) {
    if (eventMatchers[name].test(eventName)) {
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

