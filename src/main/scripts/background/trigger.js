function checkTriggers(observedEvents, recordedEvents, currentEvent) {
  /* trigger has timed out, so no need to check trigger */
  if (this.checkTriggerTimeout())
    return true;

  /* if there is a trigger, then check if trigger was observed */
  var triggerEvent = this.getEvent(v.timing.triggerEvent);
  if (triggerEvent) {
    var recordEvents = this.record.events;

    var matchedEvent = null;
    for (var i = recordEvents.length - 1; i >= 0; --i) {
      var otherEvent = recordEvents[i];
      if (otherEvent.type == triggerEvent.type &&
          otherEvent.data.type == triggerEvent.data.type &&
          matchUrls(otherEvent.data.url,
                    triggerEvent.data.url, 0.9)) {
        matchedEvent = otherEvent;
        break;
      }
    }

    if (!matchedEvent) {
      return false;
    }
  }

  /* if there is a trigger, then check if trigger was observed */
  var triggerCondition = v.timing.triggerCondition;
  if (triggerCondition) {
    var recordEvents = this.record.events;

    for (var j = 0, jj = triggerCondition.length; j < jj; ++j) {

      var getPrefix = function(url) {
        var a = $('<a>', {href:url})[0];
        return a.hostname + a.pathname;
      }

      var trigger = triggerCondition[j];
      var triggerEvent = this.getEvent(trigger.eventId);
      var triggerPrefix = getPrefix(triggerEvent.data.url);

      var matched = false;
      var startSeen = false;
      if (!trigger.start)
        startSeen = true;

      for (var i = recordEvents.length - 1; i >= 0; --i) {
        var e = recordEvents[i];
        if (e.meta.recordId && e.meta.recordId == trigger.start) {
          startSeen = true;
        }

        if (startSeen && e.type == "completed") {
          var prefix = getPrefix(e.data.url);
          if (prefix == triggerPrefix) {
            matched = true;
            break;
          }
        }
      }

      if (!matched) {
        return false;
      }
    }
  }
  return true;
}

/* convert an event URL (plus optional post data) to a data structure */
function getUrlData(evnt) {
  var uri = new URI(evnt.data.url);
  var data = {};
  data.hostname = uri.hostname();
  data.path = uri.pathname();
  data.prefix = data.hostname + data.path;
  var method = evnt.data.method;
  data.method = method;

  // find parameters if they exist
  if (method == "GET") {
    data.search = uri.search(true);
  } else if (method == "POST") {
    if (evnt.data.requestBody && evnt.data.requestBody.formData) {
      data.search = evnt.data.requestBody.formData;
    }
  }

  if (!data.search) {
    data.search = {};
  }
  /* noramlize search params so all values are strings */
  var search = data.search;
  for (var k in search) {
    var v = search[k];
    if (typeof v != 'string')
      search[k] = JSON.stringify(v);
  }
    

  return data;
}

function matchTrigger(triggerEvent, condition) {
  var urlData = getUrlData(triggerEvent);
  if (urlData.prefix != condition.prefix)
    return false;

  var params = condition.params;
  if (params) {
    var urlSearch = urlData.search;
    for (var k in params) {
      if (params[k] != urlSearch[k])
        return false;
    }
  }
  return true;
}

// set the triggers for an event
function addTriggers(evnt, triggers) {
  if (triggers && triggers.length > 0)
    evnt.timing.triggerCondition = triggers;
}

function clearTriggers(evnt) {
  if ('triggerCondition' in evnt.timing)
    delete evnt.timing.triggerCondition;
}

// get the triggers for an event
function getTriggers(evnt) {
  var triggers = evnt.timing.triggerCondition;
  if (triggers)
    return triggers;
  return [];
}

function getPrefix(evnt) {
  var url = evnt.data.url;
  var a = $('<a>', {href:url})[0];
  return a.hostname + a.pathname;
}
