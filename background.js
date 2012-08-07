var panelWindow = undefined;

function openMainPanel() {
  // check if panel is already open
  if (typeof panelWindow == "undefined" || panelWindow.closed) {
//    var features = "titlebar=no,menubar=no,location=no," +
//                   "resizable=no,scrollbars=no,status=no," +
//                   "height=400,width=300";
//    panelWindow = window.open("mainpanel.html", "mainpanel",
//                              features);

    chrome.windows.create({url: "mainpanel.html", width: 300, height: 400,
                          focused: true, type: "panel"}, function(winInfo) {
      panelWindow = winInfo;
    });
  } else {
    chrome.windows.update(panelWindow.id, {focused: true});
  }
}

chrome.browserAction.onClicked.addListener(function(tab) {
  openMainPanel();
});

chrome.windows.onRemoved.addListener(function(winId) {
  if (typeof panelWindow == "object" && panelWindow.id == winId) {
    panelWindow = undefined;
  }
});
