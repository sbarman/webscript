setTimeout(function() {
  // Swizzle to log when XMLHttpRequests are used
  (function () {
     function sendLogEvent() {
       console.log.apply(console, arguments);
     }

     var originalGetAllResponseHeaders, originalGetResponseHeader, originalSetRequestHeader, originalSend, originalSendAsBinary, originalOverrideMimeType, originalAbort, originalOpen;
                originalGetAllResponseHeaders = window.XMLHttpRequest.prototype.getAllResponseHeaders;
                window.XMLHttpRequest.prototype.getAllResponseHeaders =         function () {
                        sendLogEvent("XMLHttpRequest", "Website called getAllResponseHeaders()");
                        return originalGetAllResponseHeaders.apply(this, arguments);
                };
                originalGetResponseHeader = window.XMLHttpRequest.prototype.getResponseHeader;
                window.XMLHttpRequest.prototype.getResponseHeader = function (header) {
                        sendLogEvent("XMLHttpRequest", "Website called getResponseHeader()");
                        return originalGetAllResponseHeaders.apply(this, arguments);
                };
                originalSetRequestHeader = window.XMLHttpRequest.prototype.setRequestHeader;
                window.XMLHttpRequest.prototype.setRequestHeader = function (header, value) {
                        sendLogEvent("XMLHttpRequest", "Website called setRequestHeader()");
                        return originalSetRequestHeader.apply(this, arguments);
                };
                originalSend = window.XMLHttpRequest.prototype.send;
                window.XMLHttpRequest.prototype.send = function () {
                        sendLogEvent("XMLHttpRequest", "Website called send()");
                        return originalSend.apply(this, arguments);
                };
                originalSendAsBinary = window.XMLHttpRequest.prototype.sendAsBinary;
                window.XMLHttpRequest.prototype.sendAsBinary = function (data) {
                        sendLogEvent("XMLHttpRequest", "Website called sendAsBinary");
                        return originalSendAsBinary.apply(this, arguments);
                };
                originalOverrideMimeType = window.XMLHttpRequest.prototype.overrideMimeType;
                window.XMLHttpRequest.prototype.overrideMimeType = function (mimetype) {
                        sendLogEvent("XMLHttpRequest", "Website called overrideMimeType");
                        return originalOverrideMimeType.apply(this, arguments);
                };
                originalAbort = window.XMLHttpRequest.prototype.abort;
                window.XMLHttpRequest.prototype.abort = function () {
                        sendLogEvent("XMLHttpRequest", "Website called abort()");
                        return originalAbort.apply(this, arguments);
                };
                originalOpen = window.XMLHttpRequest.prototype.open;
                window.XMLHttpRequest.prototype.open = function (method, url, async, user, password) {
                        sendLogEvent("XMLHttpRequest", "Website called open()");
                        if (async === false) {
                                sendLogEvent("XMLHttpRequest", "Website called a SYNCHRONOUS request");
                        } else if (async === true) {
                                sendLogEvent("XMLHttpRequest", "Website called an ASYNCHRONOUS request");
                        }
                        if (method === "GET") {
                                sendLogEvent("XMLHttpRequest", "Website used 'GET'");
                        } else if (method === "POST") {
                                sendLogEvent("XMLHttpRequest", "Website used 'POST'");
                        }
                        return originalOpen.apply(this, arguments);
                };
 }());
                /* Example: Send data to your Chrome extension*/
                /*    document.dispatchEvent(new CustomEvent('RW759_connectExtension', {
                      detail: GLOBALS // Some variable from Gmail.
                      }));
                      */
        }, 0);
