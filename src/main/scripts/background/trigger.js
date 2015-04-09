// function checkTriggers(observedEvents, recordedEvents, currentEvent) {
//
//   /* if there is a trigger, then check if trigger was observed */
//   var triggerEvent = this.getEvent(v.timing.triggerEvent);
//   if (triggerEvent) {
//     var recordEvents = this.record.events;
// 
//     var matchedEvent = null;
//     for (var i = recordEvents.length - 1; i >= 0; --i) {
//       var otherEvent = recordEvents[i];
//       if (otherEvent.type == triggerEvent.type &&
//           otherEvent.data.type == triggerEvent.data.type &&
//           matchUrls(otherEvent.data.url,
//                     triggerEvent.data.url, 0.9)) {
//         matchedEvent = otherEvent;
//         break;
//       }
//     }
// 
//     if (!matchedEvent) {
//       return false;
//     }
//   }
//  return true;
//}

/* convert an event URL (plus optional post data) to a data structure */
function getUrlData(evnt) {
  var data = {};
  /* search params were throwing errors */
  try {
    var uri = new URI(evnt.data.url);
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
  } catch (err) {
    data.hostname = "foo.com";
    data.path = "/";
    data.prefix = data.hostname + data.path;
    data.method = "GET";
    data.search = {};
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

function matchTrigger(replayEvent, condition) {
  if (replayEvent.type != 'completed')
    return false;

  var urlData = getUrlData(replayEvent);
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
