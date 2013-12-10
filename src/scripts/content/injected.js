/* -*- Mode: Java; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* vim: set shiftwidth=2 tabstop=2 autoindent cindent expandtab: */

'use strict';

(function() {
  
  // event we are waiting for
  var scriptEvent = null;
  
  function setEventProp(e, prop, value) {
    Object.defineProperty(e, prop, {value: value});
    if (e.prop != value) {
      Object.defineProperty(e, prop, {get: function() {value}});
      Object.defineProperty(e, prop, {value: value});
    }
  }
  
  var whiteListProps = {
    relatedTarget: true,
    keyCode: true,
    charCode: true,
    offsetY: true,
    offsetX: true,
    layerX: true,
    layerY: true
  };
	
  // check if the event handler object is correct
  function checkEvent(event) {
    
    if (scriptEvent && event.type == scriptEvent.type) {
      console.log('[inject] found matching event: ', scriptEvent, event);
      
      for (var prop in scriptEvent) {
        try {
          var scriptData = scriptEvent[prop];
          var eventData = event[prop];
          
          if (scriptData != eventData) {
            console.log('[inject] fixing property: ', prop);
            if (prop in whiteListProps) {
              setEventProp(event, prop, scriptData);
            } else {
              console.log('[inject] prop not whitelisted');
            }
          }
        } catch (e) {
          recordLog.error('[' + id + '] error recording property:', prop, e);
        }
      }
      
      scriptEvent = null;
    }

    // TODO: special case with mouseover, need to return false
    return true;
  };
  
  // Attach the event handlers to their respective events
  function addListenersForRecording() {
    var events = params.events;
    for (var eventType in events) {
      var listOfEvents = events[eventType];
      for (var e in listOfEvents) {
        if (listOfEvents[e])
          document.addEventListener(e, checkEvent, true);
      }
    }
  };
  addListenersForRecording();

  // event handler for messages from the content script
  function contentScriptUpdate(request) {
	  scriptEvent = request.detail;
    
    var relatedTarget = scriptEvent.relatedTarget;
		if (relatedTarget)
      scriptEvent.relatedTarget = simpleXPathToNode(relatedTarget);
    
    console.log('[inject] handle message:', scriptEvent);
	  return;
  }
  
  document.addEventListener('webscript', contentScriptUpdate, true);
})();

/*
setTimeout(function() {
  // Swizzle to log when XMLHttpRequests are used
  // Commented out
  (function() {
     function sendLogEvent() {
       console.log.apply(console, arguments);
     }

     var originalGetAllResponseHeaders, originalGetResponseHeader,
         originalSetRequestHeader, originalSend, originalSendAsBinary, 
         originalOverrideMimeType, originalAbort, originalOpen;
     originalGetAllResponseHeaders = window.XMLHttpRequest.prototype.getAllResponseHeaders;
     window.XMLHttpRequest.prototype.getAllResponseHeaders = function() {
       sendLogEvent('XMLHttpRequest', 'Website called getAllResponseHeaders()');
       return originalGetAllResponseHeaders.apply(this, arguments);
     };
     originalGetResponseHeader = window.XMLHttpRequest.prototype.getResponseHeader;
     window.XMLHttpRequest.prototype.getResponseHeader = function(header) {
       sendLogEvent('XMLHttpRequest', 'Website called getResponseHeader()');
       return originalGetAllResponseHeaders.apply(this, arguments);
     };
     originalSetRequestHeader = window.XMLHttpRequest.prototype.setRequestHeader;
     window.XMLHttpRequest.prototype.setRequestHeader = function(header, value) {
       sendLogEvent('XMLHttpRequest', 'Website called setRequestHeader()');
       return originalSetRequestHeader.apply(this, arguments);
     };
     originalSend = window.XMLHttpRequest.prototype.send;
     window.XMLHttpRequest.prototype.send = function() {
       sendLogEvent('XMLHttpRequest', 'Website called send()');
       return originalSend.apply(this, arguments);
     };
     window.XMLHttpRequest.prototype.sendAsBinary = function(data) {
       sendLogEvent('XMLHttpRequest', 'Website called sendAsBinary');
       return originalSendAsBinary.apply(this, arguments);
      originalSendAsBinary = window.XMLHttpRequest.prototype.sendAsBinary;
    };
     originalOverrideMimeType = window.XMLHttpRequest.prototype.overrideMimeType;
     window.XMLHttpRequest.prototype.overrideMimeType = function(mimetype) {
       sendLogEvent('XMLHttpRequest', 'Website called overrideMimeType');
       return originalOverrideMimeType.apply(this, arguments);
     };
     originalAbort = window.XMLHttpRequest.prototype.abort;
     window.XMLHttpRequest.prototype.abort = function() {
       sendLogEvent('XMLHttpRequest', 'Website called abort()');
       return originalAbort.apply(this, arguments);
     };
     originalOpen = window.XMLHttpRequest.prototype.open;
     window.XMLHttpRequest.prototype.open = function(method, url, async, user, password) {
       sendLogEvent('XMLHttpRequest', 'Website called open()');
       if (async === false) {
         sendLogEvent('XMLHttpRequest', 'Website called a SYNCHRONOUS request');
       } else if (async === true) {
         sendLogEvent('XMLHttpRequest', 'Website called an ASYNCHRONOUS request');
       }
       if (method === 'GET') {
         sendLogEvent('XMLHttpRequest', "Website used 'GET'");
       } else if (method === 'POST') {
         sendLogEvent('XMLHttpRequest', "Website used 'POST'");
       }
       return originalOpen.apply(this, arguments);
     };
  });
}, 0);
*/
