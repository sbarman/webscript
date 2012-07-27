var recording = false;
var events = null;

$("#start").click(function(eventObject) {
  console.log("start");

  resetEvents();
  recording = true;
  $("#status").text("Recording");
  sendToAll({type: "recording", value: recording});
});

$("#stop").click(function(eventObject) {
  console.log("stop");

  recording = false;
  $("#status").text("Done recording");
  sendToAll({type: "recording", value: recording});
});

$("#replay").click(function(eventObject) {
  console.log("replay");

  recording = false;
  sendToAll({type: "recording", value: recording});

  if (events) {
    for (var i = 0, ii = events.length; i < ii; ++i) {
      var e = events[i];
      chrome.tabs.query({url: e.value.URL}, function(tabs) {
        console.log("background playback", tabs);
        if (!tabs) {
          console.log("Cannot execute:", e);
        } else {
          var tab = tabs[0];
          chrome.tabs.sendMessage(tab.id, e);
        }
      });
    }
  }
});

var replay = function(events) {
  
}

var resetEvents = function() {
  events = []
  $("#events").empty();
  $("#status").text(""); 
}

var addEvent = function(eventRequest) {
  events.push(eventRequest);
  var eventInfo = eventRequest.value;
  var newDiv = "<div class='event wordwrap'>";
  for (prop in eventInfo) {
    newDiv += "<b>" + prop + ":" + "</b>" + eventInfo[prop] + "<br/>";
  }
  newDiv += "</div>";
  $("#events").append(newDiv);
}

chrome.extension.onMessage.addListener(
  function(request, sender, sendResponse) {
    console.log("background receiving:", request, "from", sender);
    if (request.type == "event") {
      console.log("background adding event");
      addEvent(request);
    } else if (request.type == "isRecording") {
      chrome.tabs.sendMessage(sender.tab.id,
                              {type: "recording", value: recording});
    }
  }
);
