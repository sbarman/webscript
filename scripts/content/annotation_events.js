var clickOptionReplay = function(element, eventMessage) {
  element.selected = true;
};

var clickSelectRecord = function(eventData, eventMessage) {
  eventMessage.value = eventData.target.value;
};

var clickSelectReplay = function(element, eventMessage) {
  element.value = eventMessage.value;
};

var annotationEvents = {
  "keypress": {
    guard: function(eventData, eventMessage) {
      return false;
    },
    record: null,
    replay: null
  },
  "clickOption": {
    guard: function(eventData, eventMessage) {
      return eventMessage.nodeName == "option" && eventMessage.type == "click";
    },
    record: null,
    replay: clickOptionReplay
  },
  "clickSelect": {
    guard: function(eventData, eventMessage) {
      return eventMessage.nodeName == "select" && eventMessage.type == "click";
    },
    record: clickSelectRecord,
    replay: clickSelectReplay
  },
};
