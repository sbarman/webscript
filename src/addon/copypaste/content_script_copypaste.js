/* -*- Mode: Java; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* vim: set shiftwidth=2 tabstop=2 autoindent cindent expandtab: */

'use strict';

var replayClipboard = "";

addonStartup.push(function() {
  if (recording == RecordState.REPLAYING)
    port.postMessage({type: 'getClipboard', value: null, state: recording});
});

addonPostRecord.push(function(eventData, eventMessage) {
  if (eventMessage.data.type == 'copy') {
    var selection = window.getSelection();
    var selectionObj = {};
    selectionObj.text = selection.toString();
    var ranges = [];
    for (var i = 0, ii = selection.rangeCount; i < ii; ++i) {
      var range = selection.getRangeAt(i);

      var start = range.startContainer;
      if (start.nodeType != 1)
        start = start.parentElement;

      var end = range.endContainer;
      if (end.nodeType != 1)
        end = end.parentElement;

      var rangeInfo = {start: saveTargetInfo(start),
                       end: saveTargetInfo(end)};
      ranges.push(rangeInfo);
    }
    selectionObj.ranges = ranges;
    eventMessage.data.selection = selectionObj;
  }
});

addonPreReplay.push(function(element, eventData, eventMessage) {
  if (eventMessage.data.type == 'copy') {
    var selectionObj = eventMessage.data.selection;
    var rangeInfo = selectionObj.ranges[0];
    var range = document.createRange();
    range.setStartBefore(getTarget(rangeInfo.start));
    range.setEndAfter(getTarget(rangeInfo.end));

    var selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);

    log.log(selection + '');
    var text = selection + '';
    replayClipboard = text;
    port.postMessage({type: 'setClipboard', value: text, state: recording});
  }
});

addonPreReplay.push(function(element, eventData, eventMessage, events) {
  if (eventMessage.data.type == 'paste') {
    log.log('paste replay');
    for (var i = 0, ii = events.length; i < ii; ++i) {
      var e = events[i].value;
      var deltas = e.meta.deltas;
      if (deltas) {
        for (var j = 0, jj = deltas.length; j < jj; ++j) {
          var d = deltas[j];
          if (d.divergingProp == 'value') {
            d.changed.prop.value = replayClipboard;
            return;
          }
        }
      }
    }
  }
});
