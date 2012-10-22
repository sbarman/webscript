/* -*- Mode: Java; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* vim: set shiftwidth=2 tabstop=2 autoindent cindent expandtab: */

'use strict';

(function() {

// Global variables
var recording = false;
var id = "setme";
var port;
var curSnapshot;
var similarityThreshold = .9;
var acceptTags = {"HTML":true, "BODY":true, "HEAD":true};
var initialDivergences = false;
var verbose = false;
var scenarioVerbose = true;

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

function xpathFromAbstractNode(node){
  if (node && node.prop && node.prop.id && node.prop.id!=""){
    return "//"+node.prop.nodeName+"[@id='"+node.prop.id+"']";
  }
  if (node && node.prop){
    return "//"+node.prop.nodeName;
  }
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
    var type = eventData.type;
    var dispatchType = getEventType(type);
    var properties = getEventProps(type);
    console.log("[" + id + "] process event:", type, dispatchType, eventData);

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
    console.log("[" + id + "] event message:", eventMessage);
    port.postMessage({type: "event", value: eventMessage});
  }
  return true;
};

// event handler for messages coming from the background page
function handleMessage(request) {
  console.log("[" + id + "] handle message:", request, request.type);
  if (request.type == "recording") {
    recording = request.value;
  } else if (request.type == "params") {
    updateParams(request.value);
  } else if (request.type == "event") {
    console.log("extension event", request, request.value.type)
    var e = request.value;
    if (e.type == "wait") {
      checkWait(e);
    } else {
      var nodes = xPathToNodes(e.target);
      //if we don't successfully find nodes, let's alert
      if(nodes.length==0){
        sendAlert("Couldn't find the DOM node we needed.");
      }
      for (var i = 0, ii = nodes.length; i < ii; ++i) {
        simulate(nodes[i], e);
      }
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
        console.log("[" + id + "] extension listening for " + e);
        document.addEventListener(e, processEvent, true);
      } else if (!listOfEvents[e] && oldListOfEvents[e]) {
        console.log("[" + id + "] extension stopped listening for " + e);
        document.removeEventListener(e, processEvent, true);
        document.removeEventListener(e, checkBubble, false);
      }
    }
  }
}

function simulate(element, eventData) {
  var eventName = eventData.type;

  if (eventName == "custom") {
    var script = eval(eventData.script);
    script(element, eventData);
    return;
  }
   
  // handle any quirks with the event type
  var extension = extendEvents[eventName];
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

  var eventType = getEventType(eventName);
  var defaultProperties = getEventProps(eventName);
  
  if (!eventType)
    throw new SyntaxError(eventData.type + ' event not supported');

  var options = jQuery.extend({}, defaultProperties, eventData);

  var setEventProp = function(e, prop, value) {
    Object.defineProperty(e, prop, {value: value});
    if (e.prop != value) {
      Object.defineProperty(e, prop, {get: function() {value}});
      Object.defineProperty(e, prop, {value: value});
    }
  }

  var oEvent = document.createEvent(eventType);
  if (eventType == 'Event') {
    oEvent.initEvent(eventName, options.bubbles, options.cancelable);
  } else if (eventType == 'MouseEvent') {
    oEvent.initMouseEvent(eventName, options.bubbles, options.cancelable,
        document.defaultView, options.detail, options.screenX,
        options.screenY, options.clientX, options.clientY,
        options.ctrlKey, options.altKey, options.shiftKey, options.metaKey,
        options.button, element);
  } else if (eventType == 'KeyboardEvent') {
    oEvent.initKeyboardEvent(eventName, options.bubbles, options.cancelable,
        document.defaultView, options.ctrlKey, options.altKey,
        options.shiftKey, options.metaKey, options.keyCode,
        options.charCode);

    setEventProp(oEvent, "charCode", options.charCode);
    setEventProp(oEvent, "keyCode", options.keyCode);
    /*
    for (var p in options) {
      if (p != "nodeName" && p != "dispatchType" && p != "URL" && 
          p != "timeStamp")
        setEventProp(oEvent, p, options[p]);
    }
    */
  } else if (eventType == 'TextEvent') {
    oEvent.initTextEvent(eventName, options.bubbles, options.cancelable,
        document.defaultView, options.data, options.inputMethod,
        options.locale);
  } else {
    console.log("Unknown type of event");
  }
  console.log("[" + id + "] dispatchEvent", eventName, options, oEvent);
  element.dispatchEvent(oEvent);
  
  //let's update a div letting us know what event we just got
  sendAlert("Received Event: "+eventData.type);
  
  //let's try seeing divergence
  visualizeDivergence(element, eventData);

}

function checkWait(eventData) {
  var conditionFunc = eval(eventData.condition);
  var result = conditionFunc(document);
  port.postMessage({type: "ack", value: result});
}

function visualizeDivergence(element, eventData){
  
  var recordDomBefore = eventData.snapshotBefore;
  var recordDomAfter = eventData.snapshotAfter;
  var replayDomBefore = curSnapshot;
  curSnapshot = snapshot();
  var replayDomAfter = curSnapshot;

  var recordDeltas = checkDomDivergence(recordDomBefore,recordDomAfter);
  console.log("RECORD DELTAS");
  console.log(recordDeltas);
  for (var i=0;i<recordDeltas.length;i++){
    var replayDelta = recordDeltas[i];
    console.log(replayDelta.type);
  }
  
  var replayDeltas = checkDomDivergence(replayDomBefore,replayDomAfter);
  console.log("REPLAY DELTAS");
  console.log(replayDeltas);
  for (var i=0;i<replayDeltas.length;i++){
    var replayDelta = replayDeltas[i];
    console.log(replayDelta.type);
  }
  
  //effects of events that were found in record browser but not replay browser
  var recordDeltasNotMatched = filterOutInitialDivergences(recordDeltas, replayDeltas);
  //effects of events that were found in replay browser but not record browser
  var replayDeltasNotMatched = filterOutInitialDivergences(replayDeltas, recordDeltas);
  
  for (var i=0;i<recordDeltasNotMatched.length;i++){
    var delta = recordDeltasNotMatched[i];
    if(delta.type == "We expect these nodes to be the same, but they're not."){
      //buggy
      //generateMismatchedValueCompensationEvent(element,delta,true);
      console.log("here we'd generate annotation events");
    }
  }
  
  for (var i=0;i<replayDeltasNotMatched.length;i++){
    var delta = replayDeltasNotMatched[i];
    if(delta.type == "We expect these nodes to be the same, but they're not."){
      //buggy
      //generateMismatchedValueCompensationEvent(element,eventData,delta,false);
      console.log("here we'd generate annotation events");
    }
  }
}

//generate annotation events for the case where we just have different
//values for properties of matched nodes
function generateMismatchedValueCompensationEvent(element, eventData, delta, thisDeltaShouldHappen){
  if (thisDeltaShouldHappen){
    var propsToChange = divergingProps(delta.record,delta.replay);
    var replayStatements = [];
    for (var i=0;i<propsToChange.length;i++){
      var prop = propsToChange[i];
      var valueAtRecordBefore = delta.record.prop[prop];
      var valueAtRecordAfter = delta.replay.prop[prop];
      
      //if we can find a property of the message, use that
      var messageProp = messagePropMatchingValue(eventData,valueAtRecordAfter);
      if (messageProp){
        replayStatements.push({'target':prop,'messageProp':messageProp});
        continue;
      }
      //if we can find a property of the original element, use that
      var elementProp = elementPropMatchingValue(delta.record,valueAtRecordAfter);
      if (elementProp){
        replayStatements.push({'target':prop,'elementProp':elementProp});
        continue;
      }
      //if we can find a concatenatio of one of those guys, use that
      var concatList = concatMatchingValue(eventData,delta.record,valueAtRecordAfter);
      if (concatList){
        replayStatements.push({'target':prop,'concatList':messageProp});
        continue;
      }
      //else, use the value of valueAtRecordAfter
      replayStatements.push({'target':prop,'constant':valueAtRecordAfter});
    }
    
    //now we know what statement we want to do at replay to correct each
    //diverging prop
    addCompensationEvent(eventData.type, eventData.nodeName, replayStatements);
  }
};

function addCompensationEvent(typeOfEvent,typeOfNode,replayStatements){
  var name = typeOfEvent+"_"+typeOfNode;
  var guard = function(eventData, eventMessage) {
                return eventMessage.nodeName == typeOfNode &&
                        eventMessage.type == typeOfEvent;
              };
  var replay = function keypressReplay(element, eventMessage) {
                  //iterate through the statements we want to execute
                  for(var i = 0;i<replayStatements.length;i++){
                    var replayStatment = replayStatments[i];
                    var rhs;
                    //the statement gets the value from the eventMessage
                    if (replayStatment.messageProp){
                      rhs = eventMessage[replayStatement.messageProp];
                    }
                    //the statement gets the value from the element
                    else if(replayStatement.elementProp){
                      rhs = element[replayStatement.elementProp];
                    }
                    //the statement uses a concatenation
                    else if(replayStatement.concatList){
                      var first = replayStatement.concatList[0];
                      var second = replayStatement.concastList[1];
                      var firstVal, secondVal;
                      if (first.message){
                        firstVal = eventMessage[first.prop];
                      }
                      else{
                        firstVal = element[first.prop];
                      }
                      if (second.message){
                        secondVal = eventMessage[second.prop];
                      }
                      else{
                        secondVal = element[second.prop];
                      }
                      rhs = firstVal+secondVal;
                    }
                    //the statement uses a constant
                    else{
                      rhs = replayStatement.constant;
                    }
                    //let's set our target property equal to the rhs
                    element[replayStatement.target] = rhs;
                  }
                };
  annotationEvents[name] = {"guard":guard,"record":null,"replay":replay};
};

//function for sending an alert that the user will see
function sendAlert(msg){
  var replayStatusDiv = document.createElement("div");
  replayStatusDiv.setAttribute('class','replayStatus');
  replayStatusDiv.setAttribute('style',
    'z-index:99999999999999999999999999; \
    background-color:yellow; \
    position:fixed; \
    left:0px; \
    top:0px; \
    width:200px; \
    font-size:10px');
  replayStatusDiv.innerHTML = msg;
  document.body.appendChild(replayStatusDiv);	
  console.log("[" + id + "] appended child", replayStatusDiv.innerHTML);
  
  //let's try seeing divergence
  var recordDom = eventData.snapshotAfter;
  var replayDom = snapshotDom(document);
  console.log("[" + id + "] record DOM", recordDom);
  console.log("[" + id + "] replay DOM", replayDom);
  checkDomDivergence(recordDom,replayDom);
}

function checkDomDivergence(recordDom, replayDom){
  var body1 = findBody(recordDom);
  var body2 = findBody(replayDom);
  var divergences = recursiveVisit(body1, body2);
  return divergences;
};

function filterOutInitialDivergences(divergences, initialDivergences){
  var finalDivergences = [];
  for (var i in divergences){
    var divergence = divergences[i];
    var divMatched = false;
    //console.log("divergence ", divergence);
    for (var j in initialDivergences){
      var initDivergence = initialDivergences[j];
      //console.log("initDivergence", initDivergence);
      if (divergenceSameAcrossBrowsers(divergence, initDivergence)){
        divMatched = true;
        continue;
      }
    }
    if (!divMatched){
      finalDivergences.push(divergence);
    }
  }
  return finalDivergences;
};

//returns true if we match the divergence div1 and the divergence div2
function divergenceSameAcrossBrowsers(div1,div2){
  var divergingProps = [];
  var div1Before = div1.record;
  var div1After = div1.replay;
  var div2Before = div2.recrod;
  var div2After = div2.replay;
  
  //which properties are different after the event (in browser 1)?
  var div1DivergingProps = divergingProps(div1Before,div1After).sort();
  //which properties are different after the event (in browser 2)?
  var div2DivergingProps = divergingProps(div2Before,div2After).sort();
  
  //if different numbers of properties are different, these
  //divergences definitely don't match
  if(div1DivergingProps.length != div2DivergingProps.length){
    return false;
  }
  
  //iterate through the sorted lists of props
  //freak out if we get mismatched props (props with different names)
  //or if the value of that changed prop is not the same in both
  //browsers
  for (var i = 0; i < div1DivergingProps.length; i++){
    if(div1DivergingProps[i] != div2DivergingProps[i] ||
        div1After[div1DivergingProps[i]] != div2After[div2DiverginProps[i]]){
      return false;
    }
  }
  
  return true;
};

//returns a list of the properties for which two objects have different
//values
function divergingProps(obj1,obj2){
  var obj1props = obj1.prop;
  var obj2props = obj2.prop;
  var divergingProps = []
  for (var prop in obj1props){
    if (obj1props[prop] != obj2props[prop]){
      divergingProps.push(prop);
    }
  }
  return divergingProps;
};

function divergenceEquals(div1,div2){
  
  /*
  if (!(div1.type == div2.type)){
    console.log("type didn't match", div1.type, div2.type);
    return false;
  }
  */
  
  for(var i=0;i<div1.relevantChildren;i++){
    if (!(i<div2.relevantChildren.length && div1.relevantChildren[i] == div2.relevantChildren[i])){
      return false;
    }
  }
  
  return true;
  
  /*
  console.log(nodeEquals(div1.replay,div2.replay), div1.replay, div2.replay);
  console.log(nodeEquals(div1.record,div2.record), div1.record, div2.record);
  console.log(div1.type==div2.type, div1.type, div2.type);
  var ret = nodeEquals(div1.replay,div2.replay) && 
            nodeEquals(div1.record,div2.record) &&
            div1.type == div2.type;
  return ret;
  */
}

//descend to BODY node in the document
function findBody(dom){
  if (dom){
    if (dom.prop && dom.prop.tagName && 
      dom.prop.tagName.toUpperCase() == "BODY"){
      return dom;
    }
    if (dom.children){
      var children = dom.children;
      var numChildren = children.length;
      for (var i=0;i<numChildren;i++){
        var ret = findBody(children[i]);
        if (ret){
          return ret;
        }
      }
    }
  }
};

function recursiveVisit(obj1,obj2){
  
  if (verbose){
    console.log("recursiveVisit", obj1, obj2);
    console.log(similarityString(obj1));
    console.log(similarityString(obj2));
  }
  
  if (obj1 && obj2 && obj1.children && obj2.children){
    if (verbose){
      console.log("children");
    }
    var divergences = [];
    var children1 = obj1.children;
    var children2 = obj2.children;
    var numChildren1 = children1.length;
    var numChildren2 = children2.length;
    
    //if a different number of children, definitely want to assume
    //these objects have messy children that need matching
    if (numChildren1!=numChildren2){
      divergences = divergences.concat(recursiveVisitMismatchedChildren(obj1,obj2));
      return divergences;
    }
    
    //proceed on the assumption that we can just index into these
    //children without difficulty, only change our mind if we find
    //any of the children's properties don't match
    for (var i=0; i<numChildren1; i++){
      if (!(nodeEquals(children1[i],children2[i]))){
        var newDivergences = recursiveVisitMismatchedChildren(obj1,obj2);
        divergences = divergences.concat(newDivergences);
        return divergences;
      }
    }
    
    //if we're here, we didn't have to do mismatched children at this step
    //recurse normally
    for (var i=0; i<numChildren1; i++){
      var newDivergences = recursiveVisit(children1[i],children2[i]);
      divergences = divergences.concat(newDivergences);
    }
    
    return divergences;
  }
  else{
    if (verbose) {
      console.log("don't have children of both objects");
    }
    //we hit this if only one of obj1 and obj2 has children
    //or if only one of obj1 and obj2
    //this is bad stuff.  we matched all the parents, but things went
    //bad here, so this should definitely be a divergence
    //seems like probably a dom node was added to or removed from
    //obj1 or obj2
    if(!obj1){
      if(!(obj2 && obj2.prop && obj2.prop.innerText)){
        return[];
      }
      if (verbose || scenarioVerbose){
        console.log("Scenario 6 divergence, For some reason, we called recursiveVisit without an obj1");
        console.log(obj1,obj2);
      }
      return[
        {"type":"A node is present that was not present in the original page.",
        "record":obj1,
        "replay":obj2,
        "relevantChildren":[],
        "relevantChildrenXPaths":[xpathFromAbstractNode(obj2)]}];
    }
    else if(!obj2){
      if(!(obj1 && obj1.prop && obj1.prop.innerText)){
        return[];
      }
      if (verbose || scenarioVerbose){
        console.log("Scenario 7 divergence, for some reason we called recursiveVisit without an obj2");
        console.log(obj1,obj2);
      }
      return[
        {"type":"A node is missing that was present in the original page.",
        "record":obj1,
        "replay":obj2,
        "relevantChildren":[],
        "relevantChildrenXPaths":[xpathFromAbstractNode(obj2)]}];
    }
    else if(obj1.children){
      
      var text = ""
      for (var i = 0;i<obj1.children.length;i++){
        var child = obj1.children[i];
        if (child.prop && child.prop.innerText){
          text+=child.prop.innerText;
        }
      }
      if (text==""){
        return[];
      }
      
      if (verbose || scenarioVerbose){
        console.log("Scenario 8 divergence, obj2 lacks children");
        console.log(obj1,obj2);
      }
      return[
        {"type":"A node or nodes is missing that was present in the original page.",
        "record":obj1,
        "replay":obj2,
        "relevantChildren":obj1.children,
        "relevantChildrenXPaths":[xpathFromAbstractNode(obj2)]}];
    }
    else if(obj2.children){
      
      var text = ""
      for (var i = 0;i<obj2.children.length;i++){
        var child = obj2.children[i];
        if (child.prop && child.prop.innerText){
          text+=child.prop.innerText;
        }
      }
      if (text==""){
        return[];
      }
      
      if (verbose || scenarioVerbose){
        console.log("Scenario 9 divergence, obj1 lacks children");
        console.log(obj1,obj2);
      }
      return[
        {"type":"A node or nodes is present that was not present in the original page.",
        "record":obj1,
        "replay":obj2,
        "relevantChildren":obj2.children,
        "relevantChildrenXPaths":[xpathFromAbstractNode(obj2)]}];
    }
    //we also hit this if neither node has children.
    //then we've hit leaves, and the leaves must diverge, or we
    //wouldn't have called this method on them
    else{
      //neither has children
      if (nodeEquals(obj1,obj2)){
        //Yay!  We descended all the way, and the nodes are the same
        return [];
      }
      if (verbose || scenarioVerbose){
        console.log("Scenario 10 divergence, descended all the way, and the nodes aren't the same");
        console.log(obj1,obj2);
      }
      //sad, we descended all the way and the nodes aren't the same
      return[
        {"type":"We expect these nodes to be the same, but they're not.",
        "record":obj1,
        "replay":obj2,
        "relevantChildren":obj2,
        "relevantChildrenXPaths":[xpathFromAbstractNode(obj2)]}];
    }
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
  
  if (verbose){
    console.log("recursive visit mismatched children", obj1, obj2);
    console.log(similarityString(obj1));
    console.log(similarityString(obj2));
  }
  
  for(var i=0;i<numChildren1;i++){
    children1NumMatches.push(0);
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
    //first let's see if the corresponding child actually does work
    if(i < numChildren1 &&
      (
      sameId(child2,children2[i]) ||
      sameTagAndTagSufficient(child2,children1[i]) ||
      nodeEquals(child2,children1[i]) || 
      similarity(child2,children1[i])>similarityThreshold)
      ){
      children2MatchedWith[i]=i;
      children1MatchedWith[i]=i;
      children1NumMatches[i]++;
    }
    //otherwise let's do our matching based just on similarity
    else{
      
      if (verbose){
        console.log("didn't match i", child2, children1[i]);
        console.log(similarityString(child2));
        console.log(similarityString(children1[i]));
        console.log("nodeEquals", nodeEquals(child2,children1[i]));
        if (child2 && children1[i] && child2.prop && children1[i].prop && child2.prop.tagName && children1[i].prop.tagName){
          console.log("tagName ", child2.prop.tagName==children1[i].prop.tagName, (child2.prop.tagName in acceptTags));
        }
        console.log("similarity", similarity(child2,children1[i]), similarity(child2,children1[i])>similarityThreshold);
      }
	  
      var maxSimilarityScore=0;
      var maxSimilarityScoreIndex=0;
      for (var j=0;j<numChildren1;j++){
        var child1 = children1[j];
        if(nodeEquals(child2,child1) || sameTagAndTagSufficient(child2,child1) || sameId(child2,child1)){
          //we can rest assured about child1 and child2
          //add to the mapping
          //console.log("Matched with nodeEquals and sameTagAndTagSufficient");
          children2MatchedWith[i]=j;
          children1MatchedWith[j]=i;
          children1NumMatches[j]++;
          break;
        }
        //if we haven't matched it yet, we have to keep computing
        //similarity scores
        var similarityScore = similarity(child2,child1);
        //console.log("Didn't match.  Had to find similarity. ", similarityScore); 
        if(similarityScore>maxSimilarityScore){
          maxSimilarityScore = similarityScore;
          maxSimilarityScoreIndex = j;
        }
      }
      //if our maxSimilarityScore is sufficiently high, go ahead and
      //add the pairing to our mapping
      //console.log("our max similarity score is ", maxSimilarityScore);
      if (maxSimilarityScore>similarityThreshold){
        children2MatchedWith[i]=maxSimilarityScoreIndex;
        children1MatchedWith[maxSimilarityScoreIndex]=i;
        children1NumMatches[maxSimilarityScoreIndex]++;
      }
      //otherwise, let's assume we haven't found a match for child2
      //and it was added to obj2's page
      else if (children2MatchedWith[i]==-1){
        if (!(child2 && child2.prop && child2.prop.innerText)){
          return [];
        }
        if (verbose || scenarioVerbose){
          console.log("Scenario 1 divergence, couldn't find a match for child2", child2, "in the original page");
          console.log(obj1,obj2);
        }
        divergences.push(
          {"type":"A node is present that was  not present in the original page.",
          "record":obj1,
          "replay":obj2,
          "relevantChildren":[child2],
          "relevantChildrenXPaths":[xpathFromAbstractNode(child2)]});
      }
    }
  }
  
  if (verbose){
    console.log("iterated through all children, assigned anything with sufficiently high similarity score");
    console.log("children1NumMatches", children1NumMatches);
    console.log("children1MatchedWith", children1MatchedWith);
    console.log("children2MatchedWith", children2MatchedWith);
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
    //this case should never catch any of the children we want to ignore
    //console.log("trying to find mappings", children1NumMatches);
	  if(children1NumMatches[i]>0){
      //console.log("check for siblings");
		  //potential sibling class
		  var numSiblingsInObj1Page = 1; //starts at 1 because item i
		  for (var j=0;j<numChildren1;j++){
			  if(children1NumMatches[j]==0 && 
          (nodeEquals(children1[i],children1[j]) || 
          similarity(children1[i],children1[j])>similarityThreshold)){
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
        if (verbose || scenarioVerbose){
          console.log("Scenario 2 divergence, different numbers of children like", children1[i], "at position i ", i);
          console.log(obj1,obj2);
          console.log(similarityStringClasses(obj1));
          console.log(similarityStringClasses(obj2));
        }
        divergences.push(
          {"type":"The original page had "+numSiblingsInObj1Page+
          " instances of a particular kind of node, but this page has "
          +children1NumMatches[i]+" different instances.",
          "record":obj1,
          "replay":obj2,
          "relevantChildren":[children1[i]],
          "relevantChildrenXPaths":[xpathFromAbstractNode(obj2)]});
		  }
		  else{
        //1-1 mapping, so let's keep descending to find out what's going on
        if (verbose){
          console.log("going to recurse with i", i);
        }
			  divergences = divergences.concat(recursiveVisit(children1[i],children2[children1MatchedWith[i]]));
		  }
	  }
  }
  
  //now we've taken care of any page 1 nodes that were just missed
  //because page 2 preferred its siblings
  //so anything that still hasn't been matched is something that
  //was actually removed
  
  for(var i=0;i<numChildren1;i++){
	  if(children1NumMatches[i]==0){
      if (verbose || scenarioVerbose){
        console.log("Scenario 3 divergence, couldn't find a match for child1", children1[i], "in the new page");
        console.log(obj1,obj2);
      }
      if(!(children1[i].prop && children1[i].prop.innerText)){
        return [];
      }
      divergences.push(
        {"type":"A node is missing that was present in the original page.",
        "record":obj1,
        "replay":obj2,
        "relevantChildren":[children1[i]],
        "relevantChildrenXPaths":[xpathFromAbstractNode(obj2)]});
	  }
  }
  return divergences;
};

function similarityString(obj1){
  if (obj1 && obj1.children){
    
    var obj1String=obj1.prop.tagName;
    var children1 = obj1.children;
    var numChildren1=obj1.children.length;
    
    for (var i=0;i<numChildren1;i++){
      if (children1[i].prop) obj1String+=children1[i].prop.tagName;
    }
    return obj1String;
  }
  else{
    return "";
  } 
}

function similarityStringClasses(obj1){
  if (obj1 && obj1.children){
    
    var obj1String=obj1.prop.tagName+obj1.prop.className;
    var children1 = obj1.children;
    var numChildren1=obj1.children.length;
    
    for (var i=0;i<numChildren1;i++){
      if (children1[i].prop) obj1String+=(children1[i].prop.tagName+children1[i].prop.className);
    }
    return obj1String;
  }
  else{
    return "";
  } 
}

function similarity(obj1,obj2){
	//how about just traversing the trees and seeing if they have the same
  //structure, just not the same content?
	//maybe just put down tags.  that'd be nice I think
  //we'll check to depth 4
  var ret = tagMatchesAndTotalTags(obj1,obj2,1);
  //console.log("similarity of ", similarityString(obj1), " and ", similarityString(obj2), "is", ret.tagMatches/ret.totalTags);
  var score = ret.tagMatches/ret.totalTags;
  return score;
};

function sameTagAndTagSufficient(obj1,obj2){
  var ret = obj1 && obj2 &&
    obj1.prop && obj2.prop &&
    obj1.prop.tagName && obj2.prop.tagName &&
    obj1.prop.tagName == obj2.prop.tagName &&
    obj1.prop.tagName in acceptTags;
    return ret;
}

function tagMatchesAndTotalTags(obj1,obj2, depth){
  var totalTags=0;
  var tagMatches=0;
  
  
  //if don't have two objects, we have a mismatch and we'll return
  if(!(obj1 && obj2)){
    return {"totalTags": totalTags, "tagMatches": tagMatches};
  }
  //if the current tagNames match, increment the number of matches
  if (obj1.prop && obj2.prop && 
    obj1.prop.tagName && obj2.prop.tagName){
    totalTags++;
    if (obj1.prop.tagName == obj2.prop.tagName){
      //console.log("the tag name ", obj1.prop.tagName, " matches, increment tagMatches");
      tagMatches++;
    }
  }
  //if the current classes match, increment the number of matches
  if (obj1.prop && obj2.prop && 
    obj1.prop.className && obj2.prop.className && 
    obj1.prop.className == obj2.prop.className){
    totalTags++;
    tagMatches++;
    //console.log("the class name ", obj1.prop.className, " matches, increment totalTags and tagMatches");
  }
  //if there are no children or if we're at depth limit, don't continue
  if (!(obj1.children && obj2.children) || depth <= 0){
    //console.log("back up to the next level now");
    return {"totalTags": totalTags, "tagMatches": tagMatches};
  }
  
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
  //console.log("extra children, so we're adding ", extra, " to totalTags");
  
  for (var i=0;i<smallLength;i++){
    var ret = tagMatchesAndTotalTags(children1[i],children2[i], depth-1);
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

function nodeEquals(node1,node2){
  if (node1 && node2 && node1.prop && node2.prop){
    if (node1.prop.innerText && node2.prop.innerText){
      //if the inner text is the same, let's assume they're equal
      if(node1.prop.innerText==node2.prop.innerText){
        return true;
      }
      //if the id is the same, let's assume they're equal
      /*
      if (node1.prop.id && node2.prop.id
        && node1.prop.id!="" && node1.prop.id==node2.prop.id){
        return true;
      }
      */
    }
    else{
      //hypothesize that there is no effect on user if no innerText
      return true;
    }
    return _.isEqual(node1.prop, node2.prop);
  }
  return node1==node2;
};

function sameId(node1,node2){
  if (node1 && node2 && node1.prop && node2.prop &&
      node1.prop.id && node2.prop.id && node1.prop.id==node2.prop.id){
        return true;
  }
  return false;
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
