/* -*- Mode: Java; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* vim: set shiftwidth=2 tabstop=2 autoindent cindent expandtab: */

'use strict';

/*
Add listener on AJAX requests
chrome.webRequest.onBeforeRequest.addListener(
  function(info) {
    console.log("Cat intercepted: ", info);
  }, {urls: ["<all_urls>"]}
);
*/

(function() {

  var defaultWidth = 300;
  var defaultHeight = 400;

  var panelWindow = undefined;

  function openMainPanel() {
    // check if panel is already open
    if (typeof panelWindow == 'undefined' || panelWindow.closed) {
/*
      var features = "titlebar=no,menubar=no,location=no," +
                     "resizable=no,scrollbars=no,status=no," +
                     "height=400,width=300";
      panelWindow = window.open("mainpanel.html", "mainpanel",
                                features);
*/

      chrome.windows.getLastFocused(placePanel);
    } else {
      chrome.windows.update(panelWindow.id, {focused: true});
    }
  }

  function placePanel(focusedWindow) {
    var windowTop = focusedWindow.top;
    var windowLeft = focusedWindow.left - defaultWidth;

    chrome.windows.create({url: chrome.extension.getURL(
        'pages/mainpanel.html'), width: defaultWidth, height: defaultHeight,
        top: windowTop, left: windowLeft, focused: true, type: 'panel'},
        function(winInfo) {
          panelWindow = winInfo;
        });
  }

  chrome.browserAction.onClicked.addListener(function(tab) {
    openMainPanel();
  });

  chrome.windows.onRemoved.addListener(function(winId) {
    if (typeof panelWindow == 'object' && panelWindow.id == winId) {
      panelWindow = undefined;
    }
  });

/*
  chrome.windows.onFocusChanged.addListener(function(winId) {
    if (typeof panelWindow == 'object' && panelWindow.id != winId) {
      ...
    }
  }
*/

  openMainPanel();
})();
