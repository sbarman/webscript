// Mouse click
// Select text
// Input form
// Back / forward button
// Copy / Paste
// Page load

var recording = false;


// taken from http://stackoverflow.com/questions/2631820/im-storing-click-coordinates-in-my-db-and-then-reloading-them-later-and-showing/2631931#2631931
function getPathTo(element) {
  if (element.id !== '')
    return 'id("' + element.id + '")';
  if (element === document.body)
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

var processEvent = function _processEvent(eventData) {
//  var pageClone = $(document).clone(false, false);
  console.log("extension event:", eventData);
  if (recording) {
    var eventMessage = {}
    eventMessage["target"] = getPathTo(eventData.target);
    eventMessage["URL"] = document.URL;
    eventMessage["type"] = eventData.type;
    console.log("extension sending:", eventMessage);
    chrome.extension.sendMessage({type: "event", value: eventMessage});
  }
};
$(document).on('click dblclick drag drop focus load submit click',
               processEvent);

chrome.extension.onMessage.addListener(
  function(request, sender, sendResponse) {
    console.log("extension receiving:", request, "from", sender);
    if (request.type == "recording") {
      recording = request.value;
    } else if (request.type == "event") {
      console.log("extension event", request)
      var e = request.value;
      $(e.target).trigger(e.type);
    }
  }
); 
