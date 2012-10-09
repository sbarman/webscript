/* -*- Mode: Java; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* vim: set shiftwidth=2 tabstop=2 autoindent cindent expandtab: */

'use strict';

(function() {

// Global variables
var recording = false;
var id = "setme";
var port;
var curSnapshot;
var similarityThreshold = .6;

// Utility functions

function snapshot() {
  return snapshotDom(document);
}
curSnapshot = snapshot();

// taken from http://stackoverflow.com/questions/2631820/im-storing-click-coor
// dinates-in-my-db-and-then-reloading-them-later-and-showing/2631931#2631931
function getPathTo(element) {
//  if (element.id !== '')
//    return 'id("' + element.id + '")';
  if (element.tagName.toLowerCase() === "html")
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

// convert an xpath expression to an array of DOM nodes
function xPathToNodes(xpath) {
  var q = document.evaluate(xpath, document, null, XPathResult.ANY_TYPE, null);
  var results = [];

  var next = q.iterateNext();
  while (next) {
    results.push(next);
    next = q.iterateNext();
  }
  return results;
};

// Functions to handle events
// Mouse click, Select text, Input form, Back / forward button, Copy / Paste
// Page load

function getEventType(type) {
  for (var eventType in params.events) {
    var eventTypes = params.events[eventType];
    for (var e in eventTypes) {
      if (e == type) {
        return eventType;
      }
    }
  }
  return null;
};

function getEventProps(type) {
  var eventType = getEventType(type);
  return params.defaultProps[eventType];
}

// create an event record given the data from the event handler
function processEvent(eventData) {
  if (recording) {
    console.log(eventData);
    var type = eventData.type;
    var dispatchType = getEventType(type);
    var properties = getEventProps(type);
    console.log("[" + id + "]extension event:", eventData);

    var target = eventData.target;
    var nodeName = target.nodeName.toLowerCase();

    var eventMessage = {};
    eventMessage["target"] = getPathTo(target);
    eventMessage["URL"] = document.URL;
    eventMessage["dispatchType"] = dispatchType;
    eventMessage["nodeName"] = nodeName;

    eventMessage["snapshotBefore"] = curSnapshot;
    curSnapshot = snapshot();
    eventMessage["snapshotAfter"] = curSnapshot;

    for (var prop in properties) {
      if (prop in eventData) {
        eventMessage[prop] = eventData[prop];
      }
    }

    var extension = extendEvents[type];
    if (extension) {
      extension.record(eventData, eventMessage);
    }
    
    for (var i in annotationEvents) {
      var annotation = annotationEvents[i];
      if (annotation.record && annotation.guard(eventData, eventMessage)) {
        annotation.record(eventData, eventMessage);
      }
    }

    console.log("extension sending:", eventMessage);
    port.postMessage({type: "event", value: eventMessage});
  }
  return true;
};

// event handler for messages coming from the background page
function handleMessage(request) {
  console.log("[" + id + "]extension receiving:", request);
  if (request.type == "recording") {
    recording = request.value;
  } else if (request.type == "params") {
    updateParams(request.value);
  } else if (request.type == "event") {
    console.log("extension event", request)
    var e = request.value;
    var nodes = xPathToNodes(e.target);
    for (var i = 0, ii = nodes.length; i < ii; ++i) {
      simulate(nodes[i], e);
    }
  } else if (request.type == "snapshot") {
    port.postMessage({type: "snapshot", value: snapshotDom(document)});
  }
}

// given the new parameters, update the parameters for this content script
function updateParams(newParams) {
  var oldParams = params;
  params = newParams;
  
  var oldEvents = oldParams.events; 
  var events = params.events;

  for (var eventType in events) {
    var listOfEvents = events[eventType];
    var oldListOfEvents = oldEvents[eventType];
    for (var e in listOfEvents) {
      if (listOfEvents[e] && !oldListOfEvents[e]) {
        console.log("[" + id + "]extension listening for " + e);
        document.addEventListener(e, processEvent, true);
      } else if (!listOfEvents[e] && oldListOfEvents[e]) {
        console.log("[" + id + "]extension stopped listening for " + e);
        document.removeEventListener(e, processEvent, true);
      }
    }
  }
}

function simulate(element, eventData) {

  // handle any quirks with the event type
  var extension = extendEvents[eventData.type];
  if (extension) {
    extension.replay(element, eventData);
  }

  // handle any more quirks with a specific version of the event type
  for (var i in annotationEvents) {
    var annotation = annotationEvents[i];
    if (annotation.replay && annotation.guard(element, eventData)) {
      annotation.replay(element, eventData);
    }
  }

  var eventName = eventData.type;
  var eventType = getEventType(eventName);
  var defaultProperties = getEventProps(eventName);
  
  if (!eventType)
    throw new SyntaxError(eventData.type + ' event not supported');

  var options = jQuery.extend({}, defaultProperties, eventData);

  var oEvent = document.createEvent(eventType);
  if (eventType == 'Events') {
    oEvent.initEvent(eventName, options.bubbles, options.cancelable);
  } else if (eventType == 'MouseEvents') {
    oEvent.initMouseEvent(eventName, options.bubbles, options.cancelable,
        document.defaultView, options.detail, options.screenX,
        options.screenY, options.clientX, options.clientY,
        options.ctrlKey, options.altKey, options.shiftKey, options.metaKey,
        options.button, element);
  } else if (eventType == 'KeyEvents') {
    oEvent.initKeyEvent(eventName, options.bubbles, options.cancelable,
        document.defaultView, options.ctrlKey, options.altKey,
        options.shiftKey, options.metaKey, options.keyCode,
        options.charCode);
  } else if (eventType == 'TextEvents') {
    oEvent.initTextEvent(eventName, options.bubbles, options.cancelable,
        document.defaultView, options.data, options.inputMethod,
        options.locale);
  } else {
    console.log("Unknown type of event");
  }
  element.dispatchEvent(oEvent);
  
  //let's update a div letting us know what event we just got
  var replayStatusDiv = document.createElement("div");
  replayStatusDiv.setAttribute('class','replayStatus');
  replayStatusDiv.setAttribute('style','z-index:99999999999999999999999999;background-color:yellow;position:fixed;left:0px;top:0px;width:200px;font-size:10px');
  replayStatusDiv.innerHTML = "Received Event: "+eventData.type;
  document.body.appendChild(replayStatusDiv);	
  console.log("appended child", replayStatusDiv.innerHTML);
  
  //let's try seeing divergence
  var recordDom = eventData.snapshotAfter;
  var replayDom = snapshotDom(document);
  console.log(recordDom);
  console.log(replayDom);
  //commented the statement below because it's currently slow
  //checkDomDivergence(recordDom,replayDom);
}

function checkDomDivergence(recordDom, replayDom){
  var divergences = recursiveVisit(recordDom, replayDom);
  console.log("DIVERGENCES");
  console.log(divergences);
};

function recursiveVisit(obj1,obj2){
  if (obj1.children && obj2.children){
    var divergences = [];
    var children1 = obj1.children;
    var children2 = obj2.children;
    var numChildren1 = children1.length;
    var numChildren2 = children2.length;
    
    //if a different number of children, definitely want to assume
    //these objects have messy children that need matching
    if (numChildren1!=numChildren2){
      divergences.concat(recursiveVisitMismatchedChildren(obj1,obj2));
    }
    
    //proceed on the assumption that we can just index into these
    //children without difficulty, only change our mind if we find
    //any of the children don't match
    for (var i=0; i<numChildren1; i++){
      if (!(children1[i]==children2[i])){
        divergences.concat(recursiveVisitMismatchedChildren(obj1,obj2));
      }
    }
    
    //if all children matched, we'll hit this point and just return
    //an empty list.  else things will have been added to divergences
    return divergences;
  }
  else{
    //we hit this if only one of obj1 and obj2 has children
    //this is bad stuff.  we matched all the parents, but things went
    //bad here, so this should definitely be a divergence
    //seems like probably a dom node was added to or removed from
    //obj1 or obj2
    if(obj1.children)
      return[{"type":"A node or nodes is missing that was present in the original page.","record":obj1,"replay":obj2, "relevantChildren":obj1.children}];
    if(obj2.children)
      return[{"type":"A node or nodes is present that was not present in the original page.","record":obj1,"replay":obj2, "relevantChildren":obj2.children}];
    //we also hit this if neither node has children.
    //then we've hit leaves, and the leaves must diverge, or we
    //wouldn't have called this method on them
    else
      //neither has children
      return[{"type":"We expect these nodes to be the same, but they're not.","record":obj1,"replay":obj2}];
  }
};

//try to match up children before traversing the rest of the subtree
//we know that both obj1 and obj2 have children
//all we have to do is find a mapping between children
//then call our recursive visit method on the pairs if they're unequal
function recursiveVisitMismatchedChildren(obj1,obj2){
  var divergences = [];
  var children1 = obj1.children;
  var children2 = obj2.children;
  var numChildren1 = children1.length;
  var numChildren2 = children2.length;
  var children1NumMatches = [];
  var children1MatchedWith = [];
  var children2MatchedWith = [];
  
  for(var i=0;i<numChildren1;i++){
    children1NumMatches.push(0);
  }
  for(var i=0;i<numChildren1;i++){
    children1MatchedWith.push(-1);
  }
  for(var i=0;i<numChildren2;i++){
    children2MatchedWith.push(-1);
  }
  
  //let's iterate through obj2's children and try to find a
  //corresponding child in obj1's children
  //we'll make a mapping
  
  for(var i=0;i<numChildren2;i++){
    var child2 = children2[i];
    var maxSimilarityScore=0;
    var maxSimilarityScoreIndex=0;
    for (var j=0;j<numChildren1;j++){
      var child1 = children1[j];
      if(child2==child1){
        //we can rest assured about child1 and child2
        //add to the mapping
        children2MatchedWith[i]=j;
        children1MatchedWith[j]=i;
        children1NumMatches++;
        break;
      }
      //if we haven't matched it yet, we have to keep computing
      //similarity scores
      var similarityScore = similarity(child2,child1);
      if(similarityScore>maxSimilarityScore){
        maxSimilarityScore = similarityScore;
        maxSimilarityScoreIndex = j;
      }
    }
    //if our maxSimilarityScore is sufficiently high, go ahead and
    //add the pairing to our mapping
    console.log("our max similarity score is ", maxSimilarityScore);
    if (maxSimilarityScore>similarityThreshold){
      children2MatchedWith[i]=maxSimilarityScoreIndex;
      children1MatchedWith[maxSimilarityScoreIndex]=i;
      children1NumMatches[maxSimilarityScoreIndex]++;
    }
    //otherwise, let's assume we haven't found a match for child2
    //and it was added to obj2's page
    else{
      divergences.push({"type":"A node is present that was  not present in the original page.","record":obj1,"replay":obj2, "relevantChildren":[child2]});
    }
  }
  
  //now we need to see which of obj1's children didn't have any obj2
  //children mapped to them
  //if such a child is similar to other obj1 children that did get
  //mapped to, it looks like a different number of children type problem
  //and we should report that
  //otherwise it looks as though there was a child removed, and we
  //should report that
  
  //note that in this scheme, we don't actually traverse things that
  //seem to be in classes of siblings...things that seem to be similar
  //we adopt this because at that point we expect it to be a template
  //for differing content
  
  for (var i=0;i<numChildren1;i++){
	  if(children1NumMatches[i]>0){
		  //potential sibling class
		  var numSiblingsInObj1Page = 1; //starts at 1 because item i
		  for (var j=0;j<numChildren1;j++){
			  if(children1NumMatches[i]==0 && (children1[i]==children1[j] || similarity(children1[1],children1[j])>similarityThreshold)){
				  //we have a match!
				  numSiblingsInObj1Page++;
				  //let's not catch this later when we report nodes
				  //missing from obj2's page but present in obj1's
				  children1NumMatches[j]=-1;
			  }
		  }
		  //let's distinguish between 1-1 mappings and sibling classes here
		  if (numSiblingsInObj1Page>1 || children1NumMatches[i]>1){
        //this is a case of having multiple similar siblings
        divergences.push({"type":"The original page had "+numSiblingsInObj1Page+"instances of a particular kind of node, but this page has "+children1NumMatches[i]+" different instances.","record":obj1,"replay":obj2, "relevantChildren":[children1[i]]});
		  }
		  else{
        //1-1 mapping, so let's keep descending to find out what's going on
			  divergences.concat(recursiveVisit(children1[i],children2[children1MatchedWith[i]]));
		  }
	  }
  }
  
  //now we've taken care of any page 1 nodes that were just missed
  //because page 2 preferred its siblings
  //so anything that still hasn't been matched is something that
  //was actually removed
  
  for(var i=0;i<numChildren1;i++){
	  if(children1NumMatches[i]==0){
      divergences.push({"type":"A node is missing that was present in the original page.","record":obj1,"replay":obj2, "relevantChildren":[children1[i]]});
	  }
  }
  
  return divergences;
};

function similarity(obj1,obj2){
	//how about just traversing the trees and seeing if they have the same structure, just not the same content?
	//maybe just put down tags.  that'd be nice I think
  var ret = tagMatchesAndTotalTags(obj1,obj2);
  console.log("similarity of ", obj1, " and ", obj2, " is ", ret.tagMatches/ret.totalTags);
  return ret.tagMatches/ret.totalTags;
};

function tagMatchesAndTotalTags(obj1,obj2){
  var totalTags=1;
  var tagMatches=0;
  if(!(obj1 && obj2))
    return {"totalTags": totalTags, "tagMatches": tagMatches};
  if (obj1.prop && obj2.prop && obj1.prop.tagName && obj2.prop.tagName && obj1.prop.tagName==obj2.prop.tagName)
    tagMatches++;
  if (!(obj1.children && obj2.children))
    return {"totalTags": totalTags, "tagMatches": tagMatches};
  
  var children1 = obj1.children;
  var children2 = obj2.children;
  var numChildren1 = obj1.children.length;
  var numChildren2 = obj2.children.length;
  var extra;
  var smallLength;
  if (numChildren1>numChildren2){
    extra = numChildren1-numChildren2;
    smallLength=numChildren2;
  }
  else {
    extra = numChildren2-numChildren1;
    smallLength=numChildren1;
  }
  totalTags+=extra;
  for (var i=0;i<smallLength;i++){
    var ret = tagMatchesAndTotalTags(children1[i],children2[i]);
    totalTags+=ret.totalTags;
    tagMatches+=ret.tagMatches;
  }
  return {"totalTags": totalTags, "tagMatches": tagMatches};
};

// Attach the event handlers to their respective events
function addListenersForRecording() {
  var events = params.events;
  for (var eventType in events) {
    var listOfEvents = events[eventType];
    for (var e in listOfEvents) {
      listOfEvents[e] = true;
      document.addEventListener(e, processEvent, true);
    }
  }
};

// We need to add all the events now before and other event listners are 
// added to the page. We will remove the unwanted handlers once params is
// updated
addListenersForRecording();

// need to check if we are in an iframe
var value = {}
value.top = (self == top);
value.URL = document.URL;

// Add all the other handlers
chrome.extension.sendMessage({type: "getId", value: value}, function(resp) {
  id = resp.value;
  port = chrome.extension.connect({name: id});
  port.onMessage.addListener(handleMessage);

  // see if recording is going on
  port.postMessage({type: "getRecording", value: null});
  port.postMessage({type: "getParams", value: null});
});

})()
