
var similarityThreshold = .9;
var acceptTags = {"HTML":true, "BODY":true, "HEAD":true};
var initialDivergences = false;
var verbose = false;
var scenarioVerbose = false;
var synthesisVerbose = true;

var oneArgFuncs = {};
var twoArgFuncs = {"concat":concat, "eq_func":eq_func};
var threeArgFuncs = {"if_func":if_func, "substr_func":substr_func};

function xpathFromAbstractNode(node){
  if (node && node.prop && node.prop.id && node.prop.id!=""){
    return "//"+node.prop.nodeName+"[@id='"+node.prop.id+"']";
  }
  if (node && node.prop){
    return "//"+node.prop.nodeName;
  }
};

function addComment(name, value) {
  port.postMessage({type: "comment", value: {name: name, value: value}});
}

function Node(type, val, leftNode, rightNode, rightRightNode) {
  this.type = type;
  this.val = val;
  this.leftNode = leftNode;
  this.rightNode = rightNode;
  this.rightRightNode = rightRightNode;
}

Node.prototype = {
  toString: function() {
    if (this.type=="constant"){
      return this.val;
    }
    else if (this.type=="messageProp"){
      return "eventMessage["+this.val+"]";
    }
    else if (this.type=="elementProp"){
      return "element["+this.val+"]";
    }
    else if (this.type=="concat"){
      return this.leftNode.toString()+"+"+this.rightNode.toString();
    }
    else if (this.type=="function"){
      if (this.rightRightNode){
        return this.val+"("+this.leftNode.toString()+","+this.rightNode.toString()+","+this.rightRightNode.toString()+")";
      }
      if (this.rightNode){
        return this.val+"("+this.leftNode.toString()+","+this.rightNode.toString()+")";
      }
      return this.val+"("+this.leftNode.toString()+")";
    }
    else if (this.type=="mirror"){
      return "eventMessage["+this.val+"_value]";
    }
    else if (this.type=="mirrorRecord"){
      return "element["+this.val+"]";
    }
  }
}

function TopNode(targetProp, node) {
  this.targetProp = targetProp;
  this.node = node;
}

TopNode.prototype = {
  toString: function() {
    if (this.node.type == "mirrorRecord"){
      return "eventMessage["+this.targetProp+"_value] = "+this.node.toString();
    }
    else {
      return "element["+this.targetProp+"] = "+this.node.toString();
    }
  }
}

function withoutArray(arr1,arr2){
  return _.without.apply(_, [arr1].concat(arr2));
};

function visualizeDivergence(prevEvent,recordDomBefore,recordDomAfter,replayDomBefore,replayDomAfter){
  var element = prevEvent.element;
  var eventData = prevEvent.eventData;
  
  //console.log(recordDomBefore, recordDomAfter);

  var recordDeltas = checkDomDivergence(recordDomBefore,recordDomAfter);
  if (synthesisVerbose){
    console.log("RECORD DELTAS");
    console.log(recordDeltas);
  }
  for (var i=0;i<recordDeltas.length;i++){
    var replayDelta = recordDeltas[i];
    if (synthesisVerbose){
      console.log(replayDelta.type);
    }
  }
  
  var replayDeltas = checkDomDivergence(replayDomBefore,replayDomAfter);
  if (synthesisVerbose){
    console.log("REPLAY DELTAS");
    console.log(replayDeltas);
  }
  for (var i=0;i<replayDeltas.length;i++){
    var replayDelta = replayDeltas[i];
    if (synthesisVerbose){
      console.log(replayDelta.type);
    }
  }
  
  var node = xPathToNodes("html/body[1]/div[3]/div[1]/div[1]/div[2]/div[2]/div[1]/form[1]/input[1]")[0];
  console.log("NODE ", node);
  console.log("DEFAULT Value according to element ", node.defaultValue);
  
  //effects of events that were found in record browser but not replay browser
  var recordDeltasNotMatched = filterDivergences(recordDeltas, replayDeltas);
  //effects of events that were found in replay browser but not record browser
  var replayDeltasNotMatched = filterDivergences(replayDeltas, recordDeltas);
  
  if(synthesisVerbose){
    console.log("recordDeltasNotMatched ", recordDeltasNotMatched);
    console.log("replayDeltasNotMatched ", replayDeltasNotMatched);
  }
  
  //the thing below is the stuff that's doing divergence synthesis
  /*
  for (var i=0;i<recordDeltasNotMatched.length;i++){
    var delta = recordDeltasNotMatched[i];
    addComment("delta", JSON.stringify(recordDeltasNotMatched))
    if(delta.type == "We expect these nodes to be the same, but they're not."){
      generateMismatchedValueCompensationEvent(element,eventData,delta,true);
    }
  }
  * */
  //let's replace synthesis with just copying over the state of all mismatched items
  for (var index in recordDeltasNotMatched){
	  var delta = recordDeltasNotMatched[index];
    if (delta.type=="We expect these nodes to be the same, but they're not." && _.omit(delta.divergingProps, params.synthesis.omittedProps)){
      if(delta.record.prop.id == delta.replay.prop.id && delta.record.prop.id!=""){
        //console.log("***************")
        //console.log("we can make the xpath with id");
        //console.log(delta.record,delta.replay);
        var xpath = "//*[@id='"+delta.record.prop.id+"']";
        var nodes = xPathToNodes(xpath);
        //console.log("nodes ", nodes);
        //console.log(delta.record.prop.id, delta.replay.prop.id);
        var elem = nodes[0];
        console.log("elem ", elem);
        var props = _.without(divergingProps(delta.record,delta.replay), "text");
        var recordProps = delta.record.prop;
        //console.log(recordProps);
        for (var index in props){
          var prop = props[index];
          console.log("setting prop ", prop," from", elem[prop], " to ", recordProps[prop], ".");
          elem[prop] = recordProps[prop];
        }
      }
      else if (false){
        //console.log("we're going to have to come up with some other way of making the xpath");
        //console.log("delta", delta);
        //console.log(divergingProps(delta.record,delta.replay));
        //console.log(document.evaluate(xpath, document, null, XPathResult.ANY_TYPE, null));
        //console.log(delta.record,delta.replay);
        //console.log(delta.record.prop.xpath);
        //console.log(delta.replay.prop.xpath);
        //console.log(xPathToNodes(delta.record.prop.xpath));
        //console.log("replay xpath", delta.relevantChildrenXPaths[0]);
        //console.log(xPathToNodes(delta.relevantChildrenXPaths[0]));
        
        var props = _.keys(delta.record.prop);
        var divergeProps = divergingProps(delta.record,delta.replay);
        var sameProps = withoutArray(props, divergeProps);
        sameProps = withoutArray(sameProps, params.synthesis.omittedProps);
        var addedAttributes = ["nodeName", "xpath", "tagName"];
        sameProps = withoutArray(sameProps,addedAttributes);
        var xpath = delta.record.prop.nodeName+"[";
        var limitLength = sameProps.length;
        var addedFirst = false;
        for (var index = 0; index<limitLength;index++){
          var prop = sameProps[index];
          if (typeof (delta.replay.prop[prop]+1) != "string" || delta.replay.prop[prop]==''){
            continue;
          }
          if (addedFirst){
            xpath+=" and ";
          }
          else{
            addedFirst = true;
          }
          xpath+="@"+prop+"='"+delta.replay.prop[prop]+"'";
        }
        xpath+="]";
        console.log("xpath after loop", xpath);
        var nodes = xPathToNodes(xpath);
        console.log("nodes ", nodes);
      }
      else{
        xpath = delta.replay.prop.xpath;
        var nodes = xPathToNodes(xpath);
        console.log("**********");
        console.log("xpath ", xpath);
        console.log("xpath ", delta.record.prop.xpath);
        console.log("nodes ", nodes);
        var elem = nodes[0];
        console.log("elem ", elem);
        var props = _.without(divergingProps(delta.record,delta.replay), "text");
        console.log(props);
        var recordProps = delta.record.prop;
        for (var index in props){
          var prop = props[index];
          console.log("what the element says prop ", prop, " is: ", elem[prop]);
          console.log("setting prop ", prop," from", delta.replay.prop[prop], " to ", recordProps[prop], ".");
          elem[prop] = delta.replay.prop[prop];
        }
      }
      
    }
  }
  
  
  /*
  for (var i=0;i<replayDeltasNotMatched.length;i++){
    var delta = replayDeltasNotMatched[i];
    if(delta.type == "We expect these nodes to be the same, but they're not."){
      console.log("here we'd generate annotation events, delta shouldn't happen");
      generateMismatchedValueCompensationEvent(element,eventData,delta,false);
    }
  }
  */
  
  //generateMismatchedValueCompensationEvent will change the state of the DOM to be what it
  //should have been, if the proper compensation events were in place
  //but we don't want to associate these changes with the next event
  //so let's snapshot the DOM again
  if (recordDeltasNotMatched.length>0 || replayDeltasNotMatched.length>0){
    curSnapshotReplay = snapshot();
  }
}

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

//generate annotation events for the case where we just have different
//values for properties of matched nodes
function generateMismatchedValueCompensationEvent(element, eventData, delta, thisDeltaShouldHappen){
  //console.log(element, eventData, delta);
  //first ensure that this element is actually the element on which we have diverged
  
  //we know that our element will have the same xpath as the eventData specified
  //but this may not be the same xpath to the corresponding element that was used
  //during record time.  So we have to make sure that the xpath of the correct divergence
  //was matched with the xpath of the element
  if (eventData.nodeName!=delta.record.prop.nodeName.toLowerCase()){
    return;
  }
  if (delta.record.prop.type && delta.replay.prop.type && delta.record.prop.type=="hidden" && delta.replay.prop.type=="hidden"){
    return;
  }
  if (delta.record.prop.hidden && delta.replay.prop.hidden && delta.record.prop.hidden=="true" && delta.replay.prop.hidden=="true"){
    return;
  }
  
  if (thisDeltaShouldHappen){
    
    var typeOfNode = eventData.nodeName;
    var typeOfEvent = eventData.type;
    var name = typeOfEvent+"_"+typeOfNode;

    
    //let's get the examples associated with this type of compensation event
    var examples = [];
    if (annotationEvents[name]){
      examples = annotationEvents[name].examples;
    }
    
    //for the event message, associated properties with their values
    var messagePropMap = createMessagePropMap(eventData);
    //make nodes for all the message properties
    var messagePropNodes = createMessagePropNodes(eventData);
    //make nodes for all the element properties
    var elementPropNodes = createElementPropNodes(delta.record.prop);
    //let's add the current instance to our list of examples
    var newExample = {"messagePropMap":messagePropMap,
      "elementPropsBefore":delta.record.prop,
      "elementPropsAfter":delta.replay.prop,
      "messagePropNodes":messagePropNodes,
      "elementPropNodes":elementPropNodes};
    examples.push(newExample);
    
    if (synthesisVerbose){
      console.log("EXAMPLES", examples);
    }
  
    var propsToChange = [];
    for (var i=0;i<examples.length;i++){
      var example = examples[i];
      var props = divergingProps({"prop":example.elementPropsBefore},{"prop":example.elementPropsAfter});
      for (var j=0;j<props.length;j++){
        var prop = props[j];
        if (!_.contains(propsToChange,prop)){
          propsToChange.push(prop);
        }
      }
    }
    propsToChange = _.without(propsToChange, params.synthesis.omittedProps);
    
    if (synthesisVerbose){
      console.log(name,": propsToChange ", propsToChange);
    }
  
    var replayNodes = [];
    var recordNodes = [];
    for (var i=0;i<propsToChange.length;i++){
      var prop = propsToChange[i];
      
      //correct the diverging value so we don't diverge, since
      //our annotation event won't be able to fire till next time
      //(becuase it might involve a record action)
      element[prop] = delta.replay.prop[prop];
      if (synthesisVerbose){
        console.log("setting prop ", prop, " to ", delta.replay.prop[prop]);
      }
      
      var newNode = findSatisfyingExpressionOptimized(examples, prop, 2);
      
      if (newNode){
        replayNodes.push(new TopNode(prop,newNode));
      }
      else{
        //else, use the value of valueAtRecordAfter
        eventData[prop+"_value"]=delta.record.prop[prop];
        if (synthesisVerbose){
          console.log("NEW ANNOTATION: going to use the value of the record prop", prop);
        }
        newNode = new Node("mirror",prop)
        replayNodes.push(new TopNode(prop,newNode));
        var newRecordNode = new Node("mirrorRecord",prop);
        recordNodes.push(new TopNode(prop,newRecordNode));
      }
      
      console.log("NEW ANNOTATION STATEMENT", name, prop, newNode.toString());
      for (var j in examples){
        var example = examples[j];
        console.log("prop", prop, "before", example.elementPropsBefore[prop], "after", example.elementPropsAfter[prop]);
      }
    }
    
    //now we know what statement we want to do at replay to correct each
    //diverging prop
    var compensationEvent = addCompensationEvent(name, typeOfNode, typeOfEvent, replayNodes, recordNodes, newExample);
    //if (compensationEvent){compensationEvent.replay(element,eventData);}
    if (synthesisVerbose){
      console.log("annotation events after addition ", annotationEvents);
    }
  }
};


function concat(var1,var2){
  return var1+var2;
}

function eq_func(var1,var2){
  return var1==var2;
}

function if_func(var1,var2,var3){
  if(var1){
    return var2;
  }
  else{
    return var3;
  }
}

function substr_func(var1,var2,var3){
  try{
    return var1.substr(var2,var3);
  }
  catch(err){
    //do nothing
  }
}

function createMessagePropMap(eventMessage){
  var messagePropMap = {};
  for (var prop in eventMessage){
    messagePropMap[prop]=eventMessage[prop];
  }
  return messagePropMap;
}

function createMessagePropNodes(eventMessage){
  var messagePropNodes = [];
  for (var prop in eventMessage){
    messagePropNodes.push(new Node("messageProp",prop));
  }
  return messagePropNodes;
}

function createElementPropNodes(element){
  var elementPropNodes = [];
  for (var prop in element){
    elementPropNodes.push(new Node("elementProp",prop));
  }
  return elementPropNodes;
}

function evaluateNodeOnExample(node,example){
  try{
    if (node.type=="constant"){
      return node.val;
    }
    else if (node.type=="messageProp"){
      return example.messagePropMap[node.val];
    }
    else if (node.type=="elementProp"){
      return example.elementPropsBefore[node.val];
    }
    else if (node.type=="concat"){
      return evaluateNodeOnExample(node.leftNode,example)+evaluateNodeOnExample(node.rightNode,example);
    }
    else if (node.type=="function"){
      if (node.val in oneArgFuncs){
        return oneArgFuncs[node.val](evaluateNodeOnExample(node.leftNode,example));
      }
      if (node.val in twoArgFuncs){
        return twoArgFuncs[node.val](evaluateNodeOnExample(node.leftNode,example),evaluateNodeOnExample(node.rightNode,example));
      }
      if (node.val in threeArgFuncs){
        return threeArgFuncs[node.val](evaluateNodeOnExample(node.leftNode,example),evaluateNodeOnExample(node.rightNode,example),evaluateNodeOnExample(node.rightRightNode,example));
      }
    }
  }
  catch(err){
    //do nothing
  }
}

function constantMatchingValue(examples,targetProp){
  var constant = examples[0].elementPropsAfter[targetProp];
  if (_.reduce(examples,function(acc,ex){return (acc && ex.elementPropsAfter[targetProp]==constant);},true)){
    return new Node("constant", constant);
  }
  return null;
};

function messagePropMatchingValue(examples,targetProp){
  var messagePropNodes = examples[0].messagePropNodes;
  for (var node in messagePropNodes){
    //if for all examples this message prop is the same as the
    //target value for that example, return this message prop
    if (_.reduce(examples,function(acc,ex){return 
      (acc && evaluateNodeOnExample(node,ex) == ex.elementPropsAfter[targetProp]);},true)) {
        return node;
    }
  }
  return null;
};

function elementPropMatchingValue(examples,targetProp){
  var elementPropNodes = examples[0].elementPropNodes;
  for (var node in elementPropNodes){
    if (_.reduce(examples,function(acc,ex){return 
      (acc && evaluateNodeOnExample(node,ex) == ex.elementPropsAfter[targetProp]);},true)) {
      return node;
    }
  }
  return null;
};

function concatMatchingValue(examples,targetProp){
  var messagePropNodes = examples[0].messagePropNodes;
  var elementPropNodes = examples[0].elementPropNodes;
  var nodes = []
  nodes.push(new Node("constant", 1));
  nodes.push(new Node("constant", -1));
  var nodes = nodes.concat(messagePropNodes,elementPropNodes);
  for (var i in nodes){
    for (var j in nodes){
      var node1 = nodes[i];
      var node2 = nodes[j];
      if (_.reduce(examples,function(acc,ex){return (acc && evaluateNodeOnExample(node1,ex)+evaluateNodeOnExample(node2,ex) == ex.elementPropsAfter[targetProp]);},true)) {
        return new Node("concat","",node1,node2);
      }
    }
  }
};


function findSatisfyingExpression(examples, prop, depth){
  //if we can use a constant, use that
  var constantNode = constantMatchingValue(examples, prop);
  if (constantNode){
    return constantNode;
  }
  
  //let's set up the first pool of nodes
  var startNodes = []
  var messagePropNodes = examples[0].messagePropNodes;
  var elementPropNodes = examples[0].elementPropNodes;
  startNodes.push(new Node("constant", 1));
  startNodes.push(new Node("constant", -1));
  startNodes = startNodes.concat(messagePropNodes,elementPropNodes);
  
  var deepNode = deepMatchingValue(examples,prop,startNodes,startNodes,depth);
  return deepNode;
};

function findSatisfyingExpressionOptimized(examples, prop, depth){
  //if we can use a constant, use that
  var constantNode = constantMatchingValue(examples, prop);
  if (constantNode){
    return constantNode;
  }
  
  //let's set up the first pool of nodes
  var startNodes = []
  var messagePropNodes = examples[0].messagePropNodes;
  var elementPropNodes = examples[0].elementPropNodes;
  startNodes.push(new Node("constant", 1));
  startNodes.push(new Node("constant", -1));
  startNodes = startNodes.concat(messagePropNodes,elementPropNodes);
  
  var correctTuple = [];
  for (var i in examples){
    var example = examples[i];
    correctTuple.push(example.elementPropsAfter[prop]);
  }
  
  var values = {};
  for (var i in startNodes){
    var node = startNodes[i];
    var tuple = [];
    for (var i in examples){
      var example = examples[i];
      tuple.push(evaluateNodeOnExample(node,example));
    }
    var tupleString = tuple.toString();
    if (!(tupleString in values)){
      if (_.isEqual(tuple,correctTuple)){
        return node;
      }
      values[tupleString] = [tuple,node];
    }
  }
  
  console.log(values);
  
  var deepNode = deepMatchingValueOptimized(examples,prop,values,depth);
  return deepNode;
};

function getObjectSize(myObject) {
  var count=0;
  for (var key in myObject)
    count++;
  return count;
}

function deepMatchingValueOptimized(examples, targetProp, values, depth){
  console.log(examples, targetProp, values, depth);
  var valuesForLater = _.clone(values);
  var examplesLength = examples.length;
  
  var correctTuple = [];
  for (var i in examples){
    var example = examples[i];
    correctTuple.push(example.elementPropsAfter[targetProp]);
  }
  
  var t1 = new Date();
  console.log("lengths at start ",getObjectSize(values));
  
  if (depth<=1){
    return null;
  }
  
  for (var tuple1 in values){
    var tuple1vals = values[tuple1][0];
    var node1 = values[tuple1][1];
    for (var funcName in oneArgFuncs){
      var func = oneArgFuncs[funcName];
      var tuple = [];
      for (var i = 0; i<examplesLength;i++){
        tuple.push(func(tuple1vals[i]));
      }
      var tupleString = tuple.toString();
      if (!(tupleString in values)){
        var newNode = new Node("function", funcName, node1);
        if (_.isEqual(tuple,correctTuple)){
          return newNode;
        }
        valuesForLater[tupleString] = [tuple,newNode];
      }
    }
  }
  
  for (var tuple1 in values){
    var tuple1vals = values[tuple1][0];
    var node1 = values[tuple1][1];
    for (var tuple2 in values){
      var tuple2vals = values[tuple2][0];
      var node2 = values[tuple2][1];
      for (var funcName in twoArgFuncs){
        var func = twoArgFuncs[funcName];
        var tuple = [];
        for (var i = 0; i<examplesLength;i++){
          var val = func(tuple1vals[i],tuple2vals[i]);
          tuple.push(val);
        }
        var tupleString = tuple.toString();
        if (!(tupleString in values)){
          if(node1.val=="value" && node2.val=="char"){
            console.log("new tuple", tuple);
            console.log("correct tuple", correctTuple);
            console.log(node1,node2,funcName);
          }
          var newNode = new Node("function", funcName, node1,node2);
          if (_.isEqual(tuple,correctTuple)){
            return newNode;
          }
          valuesForLater[tupleString] = [tuple,newNode];
        }
      }
    }
  }
  
  for (var tuple1 in values){
    var tuple1vals = values[tuple1][0];
    var node1 = values[tuple1][1];
    for (var tuple2 in values){
      var tuple2vals = values[tuple2][0];
      var node2 = values[tuple2][1];
      for (var tuple3 in values){
        var tuple3vals = values[tuple3][0];
        var node3 = values[tuple3][1];
        for (var funcName in threeArgFuncs){
          var func = threeArgFuncs[funcName];
          var tuple = [];
          for (var i = 0; i<examplesLength;i++){
            var val = func(tuple1vals[i],tuple2vals[i],tuple3vals[i]);
            tuple.push(val);
          }
          var tupleString = tuple.toString();
          if (!(tupleString in values)){
            var newNode = new Node("function", funcName, node1,node2,node3);
            if (_.isEqual(tuple,correctTuple)){
              return newNode;
            }
            valuesForLater[tupleString] = [tuple,newNode];
          }
        }
      }
    }
  }
  
  console.log("values after", valuesForLater);
  
  console.log("lengths at end ",getObjectSize(valuesForLater));
  var t2 = new Date();
  var time = t2-t1;
  console.log("time: ", time);
  
  return deepMatchingValueOptimized(examples, targetProp, valuesForLater, depth-1);
};

function deepMatchingValue(examples, targetProp, nodesToTest, componentNodes, depth){
  var oneArgNodes = [];
  var twoArgNodes = [];
  var threeArgNodes = [];
  
  for (var i in nodesToTest){
    var node = nodesToTest[i];
    if (_.reduce(examples,function(acc,ex){return (acc && evaluateNodeOnExample(node,ex) == ex.elementPropsAfter[targetProp]);},true)) {
      return node;
    }
  }
  
  if (depth<=1){
    return null;
  }
  
  for (var i in componentNodes){
    var node1 = componentNodes[i];
      for (var funcName in oneArgFuncs){
        var newNode = new Node("function",funcName,node1);
        oneArgNodes.push(newNode);
      }
      for (var j in componentNodes){
        var node2 = componentNodes[j];
        for (var funcName in twoArgFuncs){
          var newNode = new Node("function",funcName,node1,node2);
          twoArgNodes.push(newNode);
        }
        for (var k in componentNodes){
          var node3 = componentNodes[k];
          for (var funcName in threeArgFuncs){
            var newNode = new Node("function",funcName,node1,node2,node3);
            threeArgNodes.push(newNode);
          }
        }
      }
  }
  
  var nodesToTestNext = oneArgNodes.concat(twoArgNodes,threeArgNodes);
  var componentNodesNext = componentNodes.concat(nodesToTestNext);
  
  return deepMatchingValue(examples, targetProp, nodesToTestNext, componentNodesNext, depth-1);
};

function functionsFromNodes(nodes){
  var functions = [];
  for (var i in nodes){
    var topNode = nodes[i];
    var targetProp = topNode.targetProp;
    var node = topNode.node;
    var RHSFunction = functionFromNode(node);
    var wholeFunction;
    if (node.type == "mirrorRecord") {
      wholeFunction = function(eventMessage,element){
        if ((typeof element[targetProp]) !== "undefined"){
          eventMessage[targetprop+"_value"] = RHSFunction(eventMessage,element);
        }
      }
    }
    else{
      wholeFunction = function(eventMessage,element){
        if ((typeof element[targetProp]) !== "undefined"){
          console.log("changing element["+targetProp+"] to "+RHSFunction(eventMessage,element));
          element[targetProp] = RHSFunction(eventMessage,element);
        }
      }
    }
    functions.push(wholeFunction);
  }
  return functions;
}

function functionFromNode(node){
  if (node.type == "constant"){
    return makeConstantFunction(node);
  }
  else if (node.type == "messageProp"){
    return makeMessagePropFunction(node);
  }
  else if (node.type == "elementProp"){
    return makeElementPropFunction(node);
  }
  else if (node.type == "concat"){
    return makeConcatFunction(node);
  }
  else if (node.type == "function"){
    return makeFunctionFunction(node);
  }
  else if (node.type == "mirror"){
    return makeMirrorFunction(node);
  }
  else if (node.type == "mirrorRecord"){
    return makeMirrorRecordFunction(node);
  }
}

function makeConstantFunction(node){
  var elementPropFunction = function(eventMessage,element){
    return node.val;
  }
  return elementPropFunction;
};

function makeMessagePropFunction(node){
  var messageProp = node.val;
  var messagePropFunction;
  if (messageProp=="_charCode_keyCode"){
    messagePropFunction = function(eventMessage,element){
      return String.fromCharCode(eventMessage["keyCode"]);
    }
  }
  else if (messageProp=="_charCode_charCode"){
    messagePropFunction = function(eventMessage,element){
      return String.fromCharCode(eventMessage["charCode"]);
    }
  }
  else{
    messagePropFunction = function(eventMessage,element){
      return eventMessage[messageProp];
    }
  }
  return messagePropFunction;
};

function makeElementPropFunction(node){
  var elementProp = node.val;
  var elementPropFunction = function(eventMessage,element){
    return element[elementProp];
  }
  return elementPropFunction;
};

function makeConcatFunction(node){
  var leftNodeFunc = functionFromNode(node.leftNode);
  var rightNodeFunc = functionFromNode(node.rightNode);
  
  var concatFunction = function(eventMessage,element){
    return leftNodeFunc(eventMessage,element)+rightNodeFunc(eventMessage,element);
  }
  return concatFunction;
};

function makeFunctionFunction(node){
  var functionFunction;
  if (node.val in oneArgFuncs){
    var funcToApply = oneArgFuncs[node.val];
    var leftNodeFunc = functionFromNode(node.leftNode);
    functionFunction = function(eventMessage,element){
      return funcToApply(leftNodeFunc(eventMessage,element));
    }
  }
  if (node.val in twoArgFuncs){
    var funcToApply = twoArgFuncs[node.val];
    var leftNodeFunc = functionFromNode(node.leftNode);
    var rightNodeFunc = functionFromNode(node.rightNode);
    functionFunction = function(eventMessage,element){
      return funcToApply(leftNodeFunc(eventMessage,element),rightNodeFunc(eventMessage,element));
    }
  }
  if (node.val in threeArgFuncs){
    var funcToApply = threeArgFuncs[node.val];
    var leftNodeFunc = functionFromNode(node.leftNode);
    var rightNodeFunc = functionFromNode(node.rightNode);
    var rightRightNodeFunc = functionFromNode(node.rightRightNode);
    functionFunction = function(eventMessage,element){
      return funcToApply(leftNodeFunc(eventMessage,element),rightNodeFunc(eventMessage,element),rightRightNodeFunc(eventMessage,element));
    }
  }
  return functionFunction;
};

function makeMirrorFunction(node){
  var targetProp = node.val;
  var mirrorFunction = function(eventMessage,element){
    return eventMessage[targetProp+"_value"];
  }
  return mirrorFunction;
};

function makeMirrorRecordFunction(node){
  var targetProp = node.val;
  var mirrorRecordFunction = function(element, eventMessage){
    return element[targetProp];
  }
  return mirrorRecordFunction;
};

function addCompensationEvent(name,typeOfNode,typeOfEvent,replayNodes,recordNodes,example){
  if(recordNodes.length==0 && replayNodes.length==0){
    return;
  }
  
  var guard = function(eventData, eventMessage) {
                return eventMessage.nodeName == typeOfNode &&
                        eventMessage.type == typeOfEvent;
              };
              
  var replayFunctions = functionsFromNodes(replayNodes);
  var recordFunctions = functionsFromNodes(recordNodes);
              
  var replay = function(element,eventMessage) {
                  //iterate through the statements we want to execute
                  for(var i=0;i<replayFunctions.length;i++){
                    replayFunctions[i](eventMessage,element);
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

  //let's get the examples associated with this type of compensation event
  var examples = [];
  if (annotationEvents[name]){
    examples = annotationEvents[name].examples;
  }
  examples.push(example);
  annotationEvents[name] = {"guard":guard,"record":record,"replay":replay,"examples":examples,"replayNodes":replayNodes, "recordNodes":recordNodes};
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
  console.log("appended child", replayStatusDiv.innerHTML);
}

function checkDomDivergence(recordDom, replayDom){
  var body1 = findBody(recordDom);
  var body2 = findBody(replayDom);
  var divergences = recursiveVisit(body1, body2);
  return divergences;
};

//we're going to return the list of divergences, taking out any divergences
//that also appear in divergencesToRemove
//if we call this on recordDeltas, replayDeltas, we'll return the list of
//recordDeltas that did not also appear during replay time
function filterDivergences(divergences, divergencesToRemove){
  var finalDivergences = [];
  for (var i in divergences){
    var divergence = divergences[i];
    var divMatched = false;
    //console.log("divergence ", divergence);
    for (var j in divergencesToRemove){
      var divergenceToRemove = divergencesToRemove[j];
      //now let's check if every property changed by divergence
      //is also changed in the same way by divergenceToRemove
      //in which case we can go ahead and say that divergence is matched
      if (divergence2IncludesDivergence1(divergence,divergenceToRemove)){
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

//returns true if div2 changes all the props that div1 changes
function divergence2IncludesDivergence1(div1,div2){
  var div1Before = div1.record;
  var div1After = div1.replay;
  var div2Before = div2.record;
  var div2After = div2.replay;
  
  //which properties are different after the event (in browser 1)?
  var divergingProps1 = divergingProps(div1Before,div1After);
  //which properties are different after the event (in browser 2)?
  var divergingProps2 = divergingProps(div2Before,div2After);
  
  //we have to make sure that any properties that were different
  //in div1 are also different in div2
  //Also, they should end with the same value.
  for (var i = 0; i < divergingProps1.length; i++){
    //console.log("diverging prop", divergingProps1[i]);
    var ind = divergingProps2.indexOf(divergingProps1[i]);
    if (ind==-1){
      //console.log("ind is -1, returning false");
      return false;
    }
    if (div1After.prop[divergingProps1[i]]!==div2After.prop[divergingProps2[ind]]){
      //console.log("val not equal, returning false");
      //console.log(div1After,div2After,div1After.prop[divergingProps1[i]],div2After.prop[divergingProps2[ind]]);
      return false;
    }
  }
  
  //console.log("returning true");
  return true;
};

//returns a list of the properties for which two objects have different
//values
function divergingProps(obj1,obj2){
  if (!(obj1 && obj2 && obj1.prop && obj2.prop)){
    console.log("DIVERGING PROP WEIRDNESS ", obj1, obj2);
    return []; 
  }
  var obj1props = _.omit(obj1.prop, params.synthesis.omittedProps);
  var obj2props = _.omit(obj2.prop, params.synthesis.omittedProps);

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
    
    //we've tried to match a node that turns out not to be nodeEqual
    //we want to mark that this is a divergence, but we might also be
    //calling it divergent even though there are more relevant divergences
    //among its children, so let's just add this divergence and continue
    //descending
    if (!nodeEquals(obj1,obj2)){
      if (verbose || scenarioVerbose){
        console.log("Scenario 11 divergence, we tried to match a couple of nodes that aren't nodeEqual.");
        console.log(obj1,obj2);
        if (obj1.prop && obj2.prop){
          var props1 =_.omit(obj1.prop, params.synthesis.omittedProps);
          var props2 =_.omit(obj2.prop, params.synthesis.omittedProps);
          console.log(divergingProps({"prop":props1},{prop:props2}));
        }
      }
      divergences.push(
        {"type":"We expect these nodes to be the same, but they're not.",
        "record":obj1,
        "replay":obj2,
        "relevantChildren":[],
        "relevantChildrenXPaths":[xpathFromAbstractNode(obj2)],
        "divergingProps":divergingProps({"prop":props1},{prop:props2})});
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
    var node1RelevantProps = _.omit(node1.prop, params.synthesis.omittedProps);
    var node2RelevantProps = _.omit(node2.prop, params.synthesis.omittedProps);
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

