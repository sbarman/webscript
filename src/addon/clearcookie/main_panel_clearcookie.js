/* -*- Mode: Java; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* vim: set shiftwidth=2 tabstop=2 autoindent cindent expandtab: */

'use strict';

var replayLog = getLog('replay');

Record.prototype.addClearCookie = function _addClearCookie(eventId) {
  var events = this.events;

  var prevEvent = this.getEvent(eventId);
  var index = events.indexOf(prevEvent);
  var url = prevEvent.frame.URL;

  // grab domain from url
  var tmp = document.createElement('a');
  tmp.href = url
  var domain = tmp.hostname.replace(/^www\./, '');

  var clearEvent = {type: 'clearcookie'};
  clearEvent.data = {domain: domain};
  clearEvent.timing = {waitTime: 0};
  this.addEvent(clearEvent, null, index);
};

Controller.prototype.clearCookie = function _clearCookie(selectedEvents) {
  record.addClearCookie(selectedEvents[0]);
};

Replay.prototype.replayableEvents.clearcookie = 'simulateClearCookie';

Replay.prototype.simulateClearCookie = function _simulateClearCookie(e) {
  var replay = this;
  clearCookies(e.data.domain, function() {
    replay.incrementIndex();
    replay.setNextTimeout();
  });
};

function clearCookies(domain, callback) {
  chrome.cookies.getAll({"domain": domain}, function(cookies) { 
    for (var i = 0, ii = cookies.length; i < ii; ++i) {
      var c = cookies[i];
      var url = "http" + (c.secure ? "s" : "") + "://" + c.domain + c.path;
      chrome.cookies.remove({url: url, name: c.name});
    }
    if (callback)
      setTimeout(callback, 1000);
  });

}
