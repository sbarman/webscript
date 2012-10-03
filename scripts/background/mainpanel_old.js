/* -*- Mode: Java; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* vim: set shiftwidth=2 tabstop=2 autoindent cindent expandtab: */

'use strict';

var PortManager = (function PortManager() {
  function PortManager() {
  }
  
  PortManager.prototype = {
  };

  return PortManager;
})();

var Panel = (function PanelClosure() {
  function Panel() {
    this.loadParams();
    this.attachHandlers();
  }

  Panel.prototype = {
    attachHandlers: function _attachHandlers() {
      $("#start").click(function(eventObject) {
        start();
      });
      
      $("#stop").click(function(eventObject) {
        stop();
      });

      $("#reset").click(function(eventObject) {
        reset();
      });
      
      $("#replay").click(function(eventObject) {
        replay();
      });

      $("#pause").click(function(eventObject) {
        pause();
      });

      $("#replayReset").click(function(eventObject) {
        replayReset();
      });
      
      $("#paramsDiv").hide(1000);
      
      $("#paramsHide").click(function(eventObject) {
        $("#paramsDiv").toggle(1000);
      });
      
      var panel = this;
      // when the form is submitted, the parameters should be dispatched to the
      // content scripts so that everything is kept insync
      $("#params").submit(function(eventObject) {
        panel.updateParams();
        sendToAll({type: "params", value: params});
        return false;
      });
    },
    loadParams: function _loadParams() {
      // create a form based on parameters
      var loadParamForm = function(node, paramObject, prefix) {
        for (var param in paramObject) {
          var paramValue = paramObject[param];
          var paramType = typeof paramValue;
          var name = prefix + "." + param;

          if (paramType == "number") {
            var input = $("<input type=text name=" + name + "></input>");
            input.prop('value', paramValue);

            var newDiv = $("<div>" + param + "</div>");
            newDiv.append(input)
            node.append(newDiv);
          } else if (paramType == "boolean") {
            var input = $("<input type=checkbox name=" + name + "></input>");
            input.prop('checked', paramValue);

            var newDiv = $("<div>" + param + "</div>");
            newDiv.append(input);
            node.append(newDiv);
          } else if (paramType == "object") {
            var newDiv = $("<div class='boxed'></div>");
            newDiv.append("<div>" + param + "</div>");
            loadParamForm(newDiv, paramValue, name);
            node.append(newDiv);
          }
        }
      }

      var form = $("#params");
      loadParamForm(form, params, "params");
      form.append("<input type='submit' value='Update' name='Update'/>");
    },
    updateParams: function _updateParams() {
      var obj = {};
      var inputs = $("#params").prop("elements");
      for (var i = 0, ii = inputs.length; i < ii; ++i) {
        var input = inputs[i];

        var val;
        if (input.type == "checkbox") {
          val = input.checked;
        } else if (input.type == "text") {
          val = parseInt(input.value);
        } else {
          continue;
        }
        var names = input.name.split('.');

        var cur = obj;
        for (var j = 0, jj = names.length - 1; j < jj; ++j) {
          var key = names[j];
          if (!(key in cur)) {
            cur[key] = {};
          }
          cur = cur[key];
        }
        cur[names[names.length - 1]] = val;
      }

      params = obj.params;
    },
    addEvent: function _addEvent(eventRecord) {
      var eventInfo = eventRecord.msg.value;
      var id = eventRecord.id;
      var num = eventRecord.num;
      var tab = eventRecord.tab;
      var topURL = eventRecord.topURL;
      var portName = eventRecord.portName;
      var topFrame = eventRecord.topFrame;
      var iframeIndex = eventRecord.iframeIndex;

      var newDiv = "<div class='event wordwrap' id='" + id + "'>";

      newDiv += "<b>[" + num + "]type:" + "</b>" + eventInfo.type + 
                "<br/>";
      newDiv += "<b>tab:" + "</b>" + tab + "<br/>";
      newDiv += "<b>topURL:" + "</b>" + topURL + "<br/>";
      newDiv += "<b>port:" + "</b>" + portName + "<br/>";
      newDiv += "<b>topFrame:" + "</b>" + topFrame + "<br/>";
      newDiv += "<b>iframeIndex:" + "</b>" + iframeIndex + "<br/>";

      for (var prop in eventInfo) {
        if (prop != "type") {
          newDiv += "<b>" + prop + ":" + "</b>" + eventInfo[prop] + "<br/>";
        }
      }
      newDiv += "</div>";
      $("#events").append(newDiv);
    },
    clearEvents: function _clearEvents() {
      $("#events").empty();
    },
    startRecording: function _startRecording() {
      $("#status").text("Recording");
    },
    stopRecording: function _stopRecording() {
      $("#status").text("Stopped");
    }
  };

  return Panel;
})();

var RecordReplay = (function RecordReplayClosure() {
  function RecordReplay(panel) {
    this.panel = panel;
    this.events = [];
    this.workQueue = [];
    this.recordState = RecordState.STOPPED;
    this.timeoutHandle = null;
    this.twinWindow = null;

    // replay variables
    this.replayReset();
  }

  var RecordState = {
    RECORDING: 0,
    STOPPED: 2
  };

  var ReplayState = {
    REPLAYING: 0,
    TABID: 1,
    STOPPED: 2
  }

  RecordReplay.prototype = {
    isRecording: function _isRecording() {
      return this.recordState == RecordState.RECORDING;
    },
    startRecording: function _startRecording() {
      this.recordState = RecordState.RECORDING;
      this.panel.startRecording();

      // Tell the content scripts to begin recording
      sendToAll({type: "recording", value: this.isRecording()});
    },
    stopRecording: function _stopRecording() {
      this.recordState = RecordState.STOPPED;
      this.panel.stopRecording();

      // Tell the content scripts to stop recording
      sendToAll({type: "recording", value: this.isRecording()});
    },
    addEvent: function _addEvent(eventRequest, portName) {
      if (this.recordState == RecordState.RECORDING) {
        var events = this.events;
        var num = events.length;
        var id = "event" + num 
        
        var tab = portNameToTabId[portName];
        var tabObj = portNameToTabObj[portName];
        
        //don't record this action if it's being generated by our simultaneous replay
        if (tabObj.windowId==this.twinWindow) return;
        console.log("OK to add event.", tabObj.windowId, this.twinWindow, "are different");
        
        var portInfo = tabIdToCurrentPortInfo[tab]
        var topURL = portInfo.top.URL;
        
        var topFrame = false;
        var iframeIndex = -1;

        if (portInfo.top.portName == portName) {
          topFrame == true;
        } else {
          var frames = portInfo.frames;
          for (var i = 0, ii = frames.length; i < ii; ++i) {
            var frame = frames[i];
            if (frame.portName == portName) {
              iframeIndex = i;
              break;
            }
    this.workQueue = [];
    this.recordState = RecordState.STOPPED;
    this.timeoutHandle = null;

    // replay variables
    this.replayReset();
          }
        }
        var topFrame = (portInfo.top.portName == portName);

        var eventRecord = {msg: eventRequest, port: portName, topURL: topURL,
            topFrame: topFrame, iframeIndex: iframeIndex, tab: tab, num: num,
            id: id};
            
        console.log("adding an event");
        events.push(eventRecord);

        this.panel.addEvent(eventRecord);
        this.simultaneousReplay(eventRecord);
      }
    },
    clearEvents: function _clearEvents() {
      this.events = []
      this.panel.clearEvents();
    },
    replay: function _replay() {
      var recordReplay = this;
      this.timeoutHandle = setTimeout(function() {
        recordReplay.replayGuts();
      }, 0);
    },
    simultaneousReplay: function _simultaneousReplay(e) {
      var recordReplay = this;
      this.timeoutHandle = setTimeout(function() {
        recordReplay.simultaneousReplayGuts(e);
      }, 0);
    },
    replayReset: function _replayReset() {
      this.index = 0;
      this.portMapping = {};
      this.tabMapping = {};
      this.replayState = ReplayState.REPLAYING;
      this.firstUrl = null;
      this.makingTab = false;
    },
    replayPause: function _replayPause() {
      clearTimeout(this.timeoutHandle);
    },
    replayFindPortInTab: function _replayFindPortInTab(tab, topFrame,
        snapshot, msg) {

      var newTabId = this.tabMapping[tab];
      var portInfo = tabIdToCurrentPortInfo[newTabId];
      if (!portInfo) {
        return;
      }
      var newPort = null;
      if (topFrame) {
        newPort = ports[portInfo.top.portName];
      } else {
        var frames = portInfo.frames;
        var urlFrames = [];
        for (var i = 0, ii = frames.length; i < ii; i++) {
          if (frames[i].URL == msg.value.URL) {
            urlFrames.push(frames[i]);
          }
        }
        
        var allFrameSnapshots = true;
        for (var i = 0, ii = urlFrames.length; i < ii; i++) {
          if (!portToSnapshot[urlFrames[i].portName]) {
            allFrameSnapshots = false;
            break;
          }
        }

        if (allFrameSnapshots) {
          var similar = function(node1, node2) {
            if (typeof node1 != "object" || typeof node2 != "object") {
              return 0;
            }
            var score = 0;
            var attr1 = node1.attr;
            var attr2 = node2.attr;
            for (var a in attr1) {
              if (a in attr2) {
                score++;
              }
            }
             
            var children1 = node1.children;
            var children2 = node2.children;
            var c1length = children1.length;
            var c2length = children2.length;
            if (c1length < c2length) {
              var length = c1length;
            } else {
              var length = c2length;
            }
            for (var i = 0; i < length; ++i) {
              score += similar(children1[i], children2[i]);
            }
            return score;
          }
          var topScore = -1;
          var index = -1;
          for (var i = 0, ii = urlFrames.length; i < ii; ++i) {
            var score = similar(snapshot,
                                portToSnapshot[urlFrames[i].portName]);
            if (score > topScore) {
              index = i;
              topScore = score;
            }
          }
          console.log(urlFrames);
          console.log(index);
          newPort = ports[urlFrames[index].portName];
          portToSnapshot = {}; 
        } else {
          for (var i = 0, ii = urlFrames.length; i < ii; i++) {
            var port = ports[urlFrames[i].portName];
            port.postMessage({type: "snapshot", value: null});
          }
        }
      }
      return newPort;
    },
    
    replayGuts: function _replayGuts() {
      var events = this.events;
      var index = this.index;
      var portMapping = this.portMapping;
      var tabMapping = this.tabMapping;

      if (index >= events.length) {
        this.replayReset();
        return;
      }

      var e = events[index]
      var msg = e.msg;
      var port = e.port;
      var tab = e.tab;
      var id = e.id;
      var url = e.topURL;
      var topFrame = e.topFrame;
      var iframeIndex = e.iframeIndex;
      var snapshot = msg.value.snapshot;

      $("#status").text("Replay " + e.num);
      $("#" + id).get(0).scrollIntoView();
      //$("#container").scrollTop($("#" + e.id).prop("offsetTop"));

      console.log("background replay:", id, msg, port, tab);

      // we have already seen this port, reuse existing mapping
      if (port in portMapping) {  
        try {
          portMapping[port].postMessage(msg);
        } catch(err) {
          console.log(err.message);
        }

        this.index++;
       
        var recordReplay = this;
        this.timeoutHandle = setTimeout(function() {
          recordReplay.replayGuts();
        }, params.timeout);

      // we have already seen this tab, find equivalent port for tab
      // for now we will just choose the last port added from this tab
      } else if (tab in tabMapping) {
        var newPort = this.replayFindPortInTab(tab, topFrame, snapshot, msg);

        if (newPort) {
          portMapping[port] = newPort;
          newPort.postMessage(msg);
        
          this.index++;

          var recordReplay = this;
          this.timeoutHandle = setTimeout(function() {
            recordReplay.replayGuts();
          }, params.timeout);
        } else {
          var recordReplay = this;
          this.timeoutHandle = setTimeout(function() {
            recordReplay.replayGuts();
          }, params.timeout);
        }
      // need to open new tab
      } else {
        var recordReplay = this;
        chrome.tabs.create({url: url, active: true}, 
          function(newTab) {
            var newTabId = newTab.id;
            recordReplay.tabMapping[tab] = newTabId;
            recordReplay.timeoutHandle = setTimeout(function() {
              recordReplay.replayGuts();
            }, 1000);
          }
        );
      }
    },
    
    simultaneousReplayGuts: function _simultaneousReplayGuts(e) {
      var portMapping = this.portMapping;
      var tabMapping = this.tabMapping;
      var tab = e.tab;
      
      var desiredIndex;
      (tab.index)?desiredIndex = tab.index:desiredIndex = 0;
      
      console.log("simultaneous replay should be in window", this.twinWindow, "and index", desiredIndex);
      
      var twinWindowId = this.twinWindow;
      var recordReplay = this;
      
      chrome.windows.getAll({populate : true}, function (windowList) {
		var desiredTab;
        for(var i=0;i<windowList.length;i++) {
			if (windowList[i].id == twinWindowId){
				var tabs = windowList[i].tabs;
				for(var j=0;j<tabs.length;j++){
					var tab = tabs[j];
					if (tab.index==desiredIndex){
						desiredTab = tab;
						break;
					}
				}
				break;
			}
		}
		recordReplay.simultaneousReplayGutsInTab(e,desiredTab);
      });
  },
  
  /*
  checkDivergence: function _checkDivergence(tabId1,tabId2){
	  var port1 = chrome.tabs.connect(tabId1, {});
	  var port2 = chrome.tabs.connect(tabId2, {});
	  //var port1 = tabIdToPortNames[tabId1];
	  //var port2 = tabIdToPortNames[tabId2];
	  console.log("here1");
	  //var portMapping = this.portMapping;
	  port1.onMessage.addListener(function(msg1) {
		  if (msg1.type== "snapshot"){
			  port2.onMessage.addListener(function(msg2) {
				  if (msg2.type=="snapshot"){
					var tree1 = msg1.value;
					var tree2 = msg2.value;
					console.log("here");
				  }
			  });
			  port2.postMessage({type: "snapshot"});
		  }
		});
	  port1.postMessage({type: "snapshot"});
		
	  
	  //this one doesn't work
	  chrome.tabs.sendMessage(tabid1, {type:"snapshot"}, function(response1) {
		  console.log("got DOM 1");
		  chrome.tabs.sendMessage(tabid2, {type:"snapshot"}, function(response2) {
			  console.log("got DOM 2");
		  });
	  });
	  
	  
  },
  */
      
  simultaneousReplayGutsInTab: function _simultaneousReplayGuts(e, desiredTab) {
      var portMapping = this.portMapping;
      var tabMapping = this.tabMapping;
      
      var msg = e.msg;
      var port = e.port;
      var tab = e.tab;
      var id = e.id;
      var url = e.topURL;
      var topFrame = e.topFrame;
      var iframeIndex = e.iframeIndex;
      var snapshot = msg.value.snapshot;

      console.log("simultaneous replay in tab:", id, msg, desiredTab);
      
      //to check if we already have a port for the tab in which we want to play the event, we have to get the port for the tab we want to use
	  var desiredPort = tabIdToPortNames[desiredTab.id];
	  
	  console.log("msg", msg);
      
      // we have already seen this port, reuse existing mapping
      if (desiredPort in portMapping) {
		console.log("PORT IN MAPPING");
        try {
          portMapping[desiredPort].postMessage(msg);
        } catch(err) {
          console.log(err.message);
        }

      // we have already seen this tab, find equivalent port for tab
      // for now we will just choose the last port added from this tab
      } else if (desiredTab in tabMapping) {
		console.log("TAB IN MAPPING");
		if(desiredTab){
			var newPort = this.replayFindPortInTab(desiredTab, topFrame, snapshot, msg);
		}
        if (newPort) {
		  console.log("NEW PORT");
		  console.log(newPort);
          portMapping[newPort.name] = newPort;
		  console.log("simultaneous replay in window", desiredTab.windowId, "and index", desiredTab.index);
          newPort.postMessage(msg);
        } else {
		  console.log("NO NEW PORT");
          var recordReplay = this;
          this.timeoutHandle = setTimeout(function() {
            recordReplay.simultaneousReplayGutsInTab(e,desiredTab);
          }, params.timeout);
        }  

      } else {
		if (!this.makingTab){
			//prevent other events from making a new tab while one is
			//already being made, in case they want to make the same
			//tab
			this.makingTab = true;
			console.log("TAB NOT IN MAPPING");
			var desiredIndex;
			(tab.index)?desiredIndex = tab.index:desiredIndex = 0; 
			var recordReplay = this;
			chrome.tabs.create({windowId: this.twinWindow, active: true, index: desiredIndex, url:url}, 
			  function(newTab) {	
				console.log("created new tab with url", url, "to replay event", e, "in tab", newTab);  
				var newTabId = newTab.id;
				recordReplay.tabMapping[newTab] = newTabId;
				this.makingTab = false;
				recordReplay.timeoutHandle = setTimeout(function() {
				  recordReplay.simultaneousReplayGutsInTab(e,newTab);
				}, 1000);
			  }
			);
		}
		else{
          var recordReplay = this;
		  this.timeoutHandle = setTimeout(function() {
			recordReplay.simultaneousReplayGutsInTab(e,desiredTab);
		  }, params.timeout);
		}
      }
    }
  };
  
  return RecordReplay;
})();

// Global variables
var numPorts = 0;
var ports = {}; 
var portNameToTabId = {};
var portNameToTabObj = {};
var tabIdToPortNames = {};
var tabIdToCurrentPortInfo = {};
var portToSnapshot = {}

// Utility functions

var sendToAll = function(message) {
  for (var portName in ports) {
    ports[portName].postMessage(message);
  }
};

// The user started recording
var start = function _start() {
  console.log("start");
  
  chrome.windows.create({}, 
          function(newWin) {
			  recordReplay.twinWindow = newWin.id;
              recordReplay.startRecording();

			  // Update the UI
			  chrome.browserAction.setBadgeBackgroundColor({color:[255, 0, 0, 64]});
			  chrome.browserAction.setBadgeText({text: "ON"});
          }
        );

};

// The user stopped recording
var stop = function _stop() {
  console.log("stop");
  recordReplay.stopRecording();

  // Update the UI
  chrome.browserAction.setBadgeBackgroundColor({color: [0, 0, 0, 0]});
  chrome.browserAction.setBadgeText({text: "OFF"});
};

var reset = function _reset() {
  console.log("reset");
  recordReplay.clearEvents();
};

var replay = function _replay() {
  console.log("replay");
  stop();
  recordReplay.replay();
};

var pause = function _replay() {
  recordReplay.replayPause();
};

var replayReset = function _replayReset() {
  recordReplay.replayReset();
}

// The first message content scripts send is to get a unique id
var handleIdMessage = function(request, sender, sendResponse) {
  console.log("background receiving:", request, "from", sender);
  if (request.type == "getId") {
    numPorts++;
    var portName = "" + numPorts
    sendResponse({type: "id", value: portName});

    // Update various mappings
    var tabId = sender.tab.id;

    portNameToTabId[portName] = tabId;
    portNameToTabObj[portName] = sender.tab;
   
    if (typeof tabIdToPortNames[tabId] == "undefined") {
      tabIdToPortNames[tabId] = [];
    }
    tabIdToPortNames[tabId].push(portName);
    
    var value = request.value;
    value.portName = portName;
    if (value.top) {
      tabIdToCurrentPortInfo[tabId] = {top: value, frames: []};
    } else {
      var portInfo = tabIdToCurrentPortInfo[tabId];
      portInfo.frames.push(value);
    }
  }
};

// Route messages from the ports
var handleMessage = function(port, request) {
  if (request.type == "event") {
    console.log("background adding event");
    addEvent(request, port.name);
  } else if (request.type == "getRecording") {
    port.postMessage({type: "recording", value: recordReplay.isRecording()});
  } else if (request.type == "getParams") {
    port.postMessage({type: "params", value: params});
  } else if (request.type == "snapshot") {
    portToSnapshot[port.name] = request.value;  
  }
};

// Remove all the events
var resetEvents = function() {
  recordReplay.clearEvents();
};

// Add an event
var addEvent = function(eventRequest, portName) {
  recordReplay.addEvent(eventRequest, portName);
}

// Attach the event handlers to their respective events
chrome.extension.onMessage.addListener(handleIdMessage);

chrome.extension.onConnect.addListener(function(port) {
  console.log("background connecting:", port);
  var portName = port.name;

  ports[portName] = port;

  port.onMessage.addListener(function(msg) {
    handleMessage(port, msg);
  });

  port.onDisconnect.addListener(function(evt) {
    if (portName in ports) {
      delete ports[portName];
    } else {
      throw "Can't find port";
    }

    var tabId = portNameToTabId[portName];
    var portInfo = tabIdToCurrentPortInfo[tabId];
    if (portInfo.top.portName == portName) {
      delete tabIdToCurrentPortInfo[tabId];
    } else {
      var frames = portInfo.frames;
      for (var i = 0, ii = frames.length; i < ii; ++i) {
        if (frames[i].portName == portName) {
          frames.splice(i, 1);
          break;
        }
      }
    }
  });
});

// window is closed so tell the content scripts to stop recording and reset the
// extension icon
$(window).unload( function() {
  stop();
  chrome.browserAction.setBadgeText({text: ""});
  chrome.extension.onMessage.removeListener(handleMessage);
});

var panel = new Panel(); 
var recordReplay = new RecordReplay(panel);


sendToAll({type: "params", value: params});
stop();
