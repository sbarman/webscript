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
var prevEvent;
var seenEvent = false;

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

    curSnapshot = snapshot();
    eventMessage["snapshotBefore"] = curSnapshot;

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
  
  if (!seenEvent){
    seenEvent = true;
  }
  else {
    var recordDomBefore = prevEvent.eventData.snapshotBefore;
    var recordDomAfter = eventData.snapshotBefore;
    var replayDomBefore = curSnapshot;
    curSnapshot = snapshot();
    var replayDomAfter = curSnapshot;
        
    //let's try seeing divergence for the last event, now that we have a
    //new more recent snapshot of the record DOM
    visualizeDivergence(prevEvent,recordDomBefore,recordDomAfter,replayDomBefore,replayDomAfter);
  }
  //this does the actual event simulation
  element.dispatchEvent(oEvent);
  
  //let's update a div letting us know what event we just got
  sendAlert("Received Event: "+eventData.type);
  
  //now we need to store the current element and eventData into nextDivergence
  prevEvent = {"element":element,"eventData":eventData};
}

function checkWait(eventData) {
  console.log("checking:", eventData);
  var result = eval(eventData.condition);
  port.postMessage({type: "ack", value: result});
}

function visualizeDivergence(prevEvent,recordDomBefore,recordDomAfter,replayDomBefore,replayDomAfter){
  var element = prevEvent.element;
  var eventData = prevEvent.eventData;

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
  console.log("recordDeltasNotMatched ", recordDeltasNotMatched);
  console.log("replayDeltasNotMatched ", replayDeltasNotMatched);
  
  for (var i=0;i<recordDeltasNotMatched.length;i++){
    var delta = recordDeltasNotMatched[i];
    if(delta.type == "We expect these nodes to be the same, but they're not."){
      console.log("here we'd generate annotation events, delta should happen");
      generateMismatchedValueCompensationEvent(element,eventData,delta,true);
    }
  }
  
  for (var i=0;i<replayDeltasNotMatched.length;i++){
    var delta = replayDeltasNotMatched[i];
    if(delta.type == "We expect these nodes to be the same, but they're not."){
      console.log("here we'd generate annotation events, delta shouldn't happen");
      generateMismatchedValueCompensationEvent(element,eventData,delta,false);
    }
  }
}

//generate annotation events for the case where we just have different
//values for properties of matched nodes
function generateMismatchedValueCompensationEvent(element, eventData, delta, thisDeltaShouldHappen){
  if (thisDeltaShouldHappen){
    console.log("about to find props");
    var propsToChange = divergingProps(delta.record,delta.replay);
    propsToChange = _.without(propsToChange,"innerHTML", "outerHTML", "innerText", "outerText","textContent","className");
    
    var typeOfNode = eventData.nodeName;
    var typeOfEvent = eventData.type;
    var name = typeOfEvent+"_"+typeOfNode;
    
    console.log(name,": propsToChange ", propsToChange);
    console.log(eventData);
    
    //let's get the examples associated with this type of compensation event
    var examples = [];
    if (annotationEvents[name]){
      examples = annotationEvents[name].examples;
    }
    
    //let's add the current instance to our list of examples
    var messagePropMap = createMessagePropMap(eventData);
    console.log(messagePropMap);
    examples.push({"elementPropsBefore":delta.record.prop,"elementPropsAfter":delta.replay.prop,"messagePropMap":messagePropMap});
    
    console.log("EXAMPLES", examples);
    
    var replayFunctions = [];
    var recordFunctions = [];
    for (var i=0;i<propsToChange.length;i++){
      var prop = propsToChange[i];
      
      //correct the diverging value so we don't diverge, since
      //our annotation event won't be able to fire till next time
      //(becuase it might involve a record action)
      //element[prop] = delta.replay.prop[prop];
      
      //if we can use a constant, use that
      var constant = delta.replay.prop[prop];
      if (_.reduce(examples,function(acc,ex){return (acc && ex.elementPropsAfter[prop]==constant);},true)){
        console.log("NEW ANNOTATION: going to use constant, with ", constant);
        replayFunctions.push(makeConstantFunction(prop,constant));
        continue;
      }
      //if we can find a property of the message, use that
      var messageProp = messagePropMatchingValue(examples,prop);
      if (messageProp){
        console.log("NEW ANNOTATION: going to use messageProp, with ", messageProp);
        replayFunctions.push(makeMessagePropFunction(prop,messageProp));
        continue;
      }
      //if we can find a property of the original element, use that
      var elementProp = elementPropMatchingValue(examples,prop);
      if (elementProp){
        console.log("NEW ANNOTATION: going to use elementProp, with ", elementProp);
        replayFunctions.push(makeElementPropFunction(prop,elementProp));
        continue;
      }
      //if we can find a concatenatio of one of those guys, use that
      var concatList = concatMatchingValue(examples,prop);
      if (concatList){
        console.log("NEW ANNOTATION: going to use concat, with ", concatList);
        replayFunctions.push(makeConcatFunction(prop,concatList));
        continue;
      }
      //else, use the value of valueAtRecordAfter
      eventData[prop+"_value"]=delta.record.prop[prop];
      console.log("NEW ANNOTATION: going to use the value of the record prop");
      replayFunctions.push(makeMirrorFunction(prop));
      replayFunctions.push(makeMirrorFunction(prop));
      recordFunctions.push(makeMirrorRecordFunction(prop));
    }
    
    //now we know what statement we want to do at replay to correct each
    //diverging prop
    console.log("-----------");
    console.log("name");
    console.log(replayFunctions);
    console.log(recordFunctions);
    console.log("annotation events before ", annotationEvents);
    

    var compensationEvent = addCompensationEvent(name, typeOfNode, typeOfEvent, replayFunctions, recordFunctions,examples);
    if (compensationEvent){compensationEvent.replay(element,eventData);}
    console.log("annotation events after ", annotationEvents);
  }
};

function createMessagePropMap(eventMessage){
  var messagePropMap = {};
  for (var prop in eventMessage){
    messagePropMap[prop]=eventMessage[prop];
  }
  if (eventMessage["keyCode"]){
    messagePropMap["_charCode_keyCode"]=String.fromCharCode(eventMessage["keyCode"]);
  }
  if (eventMessage["charCode"]){
    messagePropMap["_charCode_charCode"]=String.fromCharCode(eventMessage["charCode"]);
  }
  return messagePropMap;
}

function messagePropMatchingValue(examples,targetProp){
  var messagePropMap = examples[0].messagePropMap;
  for (var prop in messagePropMap){
    //if for all examples this message prop is the same as the
    //target value for that example, return this message prop
    if (_.reduce(examples,function(acc,ex){return 
      (acc && ex.messagePropMap[prop] == ex.elementPropsAfter[targetProp]);},true)) {
        return prop;
    }
  }
  return null;
};

function elementPropMatchingValue(examples,targetProp){
  var elementProps = examples[0].elementPropsBefore;
  for (var prop in elementProps){
    if (_.reduce(examples,function(acc,ex){return 
      (acc && ex.elementPropsBefore[prop] == ex.elementPropsAfter[targetProp]);},true)) {
      return prop;
    }
  }
  return null;
};

function concatMatchingValue(examples,targetProp){
  var messagePropMap = examples[0].messagePropMap;
  var elementProps = examples[0].elementPropsBefore;
  for (var prop1 in messagePropMap){
    for (var prop2 in messagePropMap){
      if (_.reduce(examples,function(acc,ex){return (acc && ex.messagePropMap[prop1]+ex.messagePropMap[prop2] == ex.elementPropsAfter[targetProp]);},true)) {
        return [{"element":false,"messageProp":prop1},{"element":false,"messageProp":prop2}];
      }
    }
    for (var prop2 in elementProps){
      if (_.reduce(examples,function(acc,ex){return (acc && ex.messagePropMap[prop1]+ex.elementPropsBefore[prop2] == ex.elementPropsAfter[targetProp]);},true)) {
        return [{"element":false,"messageProp":prop1},{"element":true,"elementProp":prop2}];
      }
    }
  }
  for (var prop1 in elementProps){
    for (var prop2 in messagePropMap){
      /*
      if(prop1=="value"){
        for (var i = 0; i<examples.length;i++){
          console.log("-------------");
          console.log(prop1,prop2,examples[i].elementPropsBefore[prop1]+examples[i].messagePropMap[prop2],(examples[i].elementPropsBefore[prop1]+examples[i].messagePropMap[prop2]== examples[i].elementPropsAfter[targetProp]));
          //console.log("val before", examples[i].elementPropsBefore[targetProp], "val after", examples[i].elementPropsAfter[targetProp]);
          //console.log(prop1, examples[i].elementPropsBefore[prop1], prop2, examples[i].messagePropMap[prop2], examples[i].elementPropsBefore[prop1]+examples[i].messagePropMap[prop2]);
        }
        console.log("reduce", (_.reduce(examples,function(acc,ex){
          var ret = (acc && (ex.elementPropsBefore[prop1]+ex.messagePropMap[prop2] == ex.elementPropsAfter[targetProp]));
          console.log(ret);
          return ret;},true)));
      }
      * */
      if (_.reduce(examples,function(acc,ex){return (acc && ex.elementPropsBefore[prop1]+ex.messagePropMap[prop2] == ex.elementPropsAfter[targetProp]);},true)) {
          console.log("WILL RETURN THIS RESULT");
        return [{"element":true,"elementProp":prop1},{"element":false,"messageProp":prop2}];
      }
    }
    for (var prop2 in elementProps){
      if (_.reduce(examples,function(acc,ex){return (acc && ex.elementPropsBefore[prop1]+ex.elementPropsBefore[prop2] == ex.elementPropsAfter[targetProp]);},true)) {
        return [{"element":true,"elementProp":prop1},{"element":true,"elementProp":prop2}];
      }
    }
  }
  return null;
};

function makeConstantFunction(targetProp, constant){
  var elementPropFunction = function(element, eventMessage){
    if ((typeof element[targetProp]) !== "undefined"){
      element[targetProp] = constant;
    }
  }
  return elementPropFunction;
};

function makeMessagePropFunction(targetProp, messageProp){
  var messagePropFunction;
  if (messageProp=="_charCode_keyCode"){
    messagePropFunction = function(element, eventMessage){
      if ((typeof element[targetProp]) !== "undefined"){
        element[targetProp] = String.fromCharCode(eventMessage["keyCode"]);
      }
    }
  }
  else if (messageProp=="_charCode_charCode"){
    messagePropFunction = function(element, eventMessage){
      if ((typeof element[targetProp]) !== "undefined"){
        element[targetProp] = String.fromCharCode(eventMessage["charCode"]);
      }
    }
  }
  else{
    messagePropFunction = function(element, eventMessage){
      if ((typeof element[targetProp]) !== "undefined"){
        element[targetProp] = eventMessage[messageProp];
      }
    }
  }
  return messagePropFunction;
};

function makeMessagePropRHS(messageProp){
  var messagePropFunction;
  if (messageProp=="_charCode_keyCode"){
    messagePropFunction = function(eventMessage){
      return String.fromCharCode(eventMessage["keyCode"]);
    }
  }
  else if (messageProp=="_charCode_charCode"){
    messagePropFunction = function(eventMessage){
      return String.fromCharCode(eventMessage["charCode"]);
    }
  }
  else{
    messagePropFunction = function(eventMessage){
      return eventMessage[messageProp];
    }
  }
  return messagePropFunction;
};

function makeElementPropFunction(targetProp, elementProp){
  var elementPropFunction = function(element, eventMessage){
    if ((typeof element[targetProp]) !== "undefined"){
      element[targetProp] = element[elementProp];
    }
  }
  return elementPropFunction;
};

function makeConcatFunction(targetProp, concatList){
  var concatFunction;
  if (concatList[0].element == true){
    if (concatList[1].element == true){
      concatFunction = function(element, eventMessage){
        if ((typeof element[targetProp]) !== "undefined"){
          element[targetProp] = element[concatList[0].elementProp] + element[concatList[1].elementProp];
        }
      }
    }
    else{
      var messagePropFunc = makeMessagePropRHS(concatList[1].messageProp);
      concatFunction = function(element, eventMessage){
        if ((typeof element[targetProp]) !== "undefined"){
          console.log("Concat application.", element[concatList[0].elementProp] + messagePropFunc(eventMessage));
          element[targetProp] = element[concatList[0].elementProp] + messagePropFunc(eventMessage);
        }
      }
    }
  }
  else{
    if (concatList[1].element == true){
      var messagePropFunc = makeMessagePropRHS(concatList[0].messageProp);
      concatFunction = function(element, eventMessage){
        if ((typeof element[targetProp]) !== "undefined"){
          element[targetProp] = messagePropFunc(eventMessage) + element[concatList[1].elementProp];
        }
      }
    }
    else{
      concatFunction = function(element, eventMessage){
      var messagePropFunc0 = makeMessagePropRHS(concatList[0].messageProp);
      var messagePropFunc1 = makeMessagePropRHS(concatList[1].messageProp);
        if ((typeof element[targetProp]) !== "undefined"){
          element[targetProp] = messagePropFunc0(eventMessage) + messagePropFunc1(eventMessage);
        }
      }
    }
  }
  return concatFunction;
}

function makeMirrorFunction(targetProp){
  var mirrorFunction = function(element, eventMessage){
    if ((typeof element[targetProp]) !== "undefined"){
      element[targetProp] = eventMessage[targetProp+"_value"];
    }
  }
  return mirrorFunction;
};

function makeMirrorRecordFunction(targetProp){
  var mirrorRecordFunction = function(element, eventMessage){
    if ((typeof element[targetProp]) !== "undefined"){
      eventMessage[targetProp+"_value"] = element[targetProp];
    }
  }
  return mirrorRecordFunction;
};

function addCompensationEvent(name,typeOfNode,typeOfEvent,replayFunctions,recordFunctions,examples){
  if(recordFunctions.length==0 && replayFunctions.length==0){
    return;
  }
  
  var guard = function(eventData, eventMessage) {
                return eventMessage.nodeName == typeOfNode &&
                        eventMessage.type == typeOfEvent;
              };
              
  var replay = function(element, eventMessage) {
                  //iterate through the statements we want to execute
                  for(var i=0;i<replayFunctions.length;i++){
                    replayFunctions[i](element, eventMessage);
                  }
                };
                
  var record;
  //if we don't have anything to do at record, go ahead and avoid
  //making a function for it
  if (recordFunctions.length == 0){
    record = null
  }
  else{
    var record = function(element, eventMessage){
                    for (var i=0; i<recordFunctions.length;i++){
                      recordFunctions[i](element,eventMessage);
                    }
                  }
  }

  annotationEvents[name] = {"guard":guard,"record":record,"replay":replay,"examples":examples};
  return annotationEvents[name];
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
  var div1Before = div1.record;
  var div1After = div1.replay;
  var div2Before = div2.record;
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
        div1After[div1DivergingProps[i]] != div2After[div2DivergingProps[i]]){
      return false;
    }
  }
  
  return true;
};

//returns a list of the properties for which two objects have different
//values
function divergingProps(obj1,obj2){
  if (!(obj1 && obj2 && obj1.prop && obj2.prop)){
    console.log("DIVERGING PROP WEIRDNESS ", obj1, obj2);
    return []; 
  }
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
    
    if (!nodeEquals(obj1,obj2)){
      if (verbose || scenarioVerbose){
        console.log("Scenario 11 divergence, we tried to match a couple of nodes that aren't nodeEqual.");
        console.log(obj1,obj2);
        if (obj1.prop && obj2.prop){
          var props1 =_.omit(obj1.prop, "innerHTML", "outerHTML", "innerText", "outerText","textContent","className");
          var props2 =_.omit(obj2.prop, "innerHTML", "outerHTML", "innerText", "outerText","textContent","className");
          console.log(divergingProps({"prop":props1},{prop:props2}));
        }
      }
      return[
        {"type":"We expect these nodes to be the same, but they're not.",
        "record":obj1,
        "replay":obj2,
        "relevantChildren":[],
        "relevantChildrenXPaths":[xpathFromAbstractNode(obj2)]}];
    }
    
    //if a different number of children, definitely want to assumerecursiveVisit
    //these objects have messy children that need matching
    if (numChildren1!=numChildren2){
      if (verbose){
        console.log("numchildren is different");
      }
      divergences = divergences.concat(recursiveVisitMismatchedChildren(obj1,obj2));
      return divergences;
    }
    
    if (verbose){
      console.log("about to try going through the children");
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
    
    if (verbose){
      console.log("we found that the matched children were nodeEqual.  we're going to recurse normally");
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
    /*
    if (node1.prop.innerText && node2.prop.innerText){
      //if the inner text is the same, let's assume they're equal
      if(node1.prop.innerText==node2.prop.innerText){
        return true;
      }
      //if the id is the same, let's assume they're equal
      
      //if (node1.prop.id && node2.prop.id
       // && node1.prop.id!="" && node1.prop.id==node2.prop.id){
       // return true;
      //}
      
    }
    else if(node1.prop.nodeName.toLowerCase() != "input"){
      //hypothesize that there is no effect on user if no innerText
      return true;
    }
    */
    var node1RelevantProps = _.omit(node1.prop, "innerHTML", "outerHTML", "innerText", "outerText","textContent","className","childElementCount");
    var node2RelevantProps = _.omit(node2.prop, "innerHTML", "outerHTML", "innerText", "outerText","textContent","className","childElementCount");
    return _.isEqual(node1RelevantProps, node2RelevantProps);
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
