var events = null;
var recording = false;

$("#start").click(function(eventObject) {
  console.log("start");

  reset(); 
  recording = true;
  sendToAll({type: "recording", value: recording});
});

$("#stop").click(function(eventObject) {
  console.log("stop");

  recording = false;
  sendToAll({type: "recording", value: recording});
});

$("#replay").click(function(eventObject) {
  console.log("replay");

  recording = false;
  sendToAll({type: "recording", value: recording});

  if (events) {
    for (var i = 0, ii = events.length; i < ii; ++i) {
      var e = events[i].value;
      chrome.tabs.query({url: e.URL}, function(tabs) {
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

var reset = function() {
  events = []
}

var sendToAll = function(message) {
  chrome.tabs.query({}, function(tabs) {
    console.log("background sending:", message);
    for (var i = 0, ii = tabs.length; i < ii; ++i) {
      chrome.tabs.sendMessage(tabs[i].id, message);
    }
  });   
};

chrome.extension.onMessage.addListener(
  function(request, sender, sendResponse) {
    console.log("background receiving:", request, "from", sender);
    if (recording) {
      if (request.type == "event") {
        console.log("background event:", request, "from",  sender);
        events.push(request);
      }
    }
  }
);
