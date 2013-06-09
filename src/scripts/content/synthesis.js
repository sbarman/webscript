/* -*- Mode: Java; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* vim: set shiftwidth=2 tabstop=2 autoindent cindent expandtab: */

var log = getLog('synthesis');

var similarityThreshold = .9;
var acceptTags = {
  'HTML': true,
  'BODY': true,
  'HEAD': true
};
var initialDivergences = false;
var verbose = false;
var scenarioVerbose = false;
var synthesisVerbose = false;

var oneArgFuncs = {};
var twoArgFuncs = {
  'concat': concat,
  'eq_func': eq_func
};
var threeArgFuncs = {
  'if_func': if_func,
  'substr_func': substr_func
};

function Node(type, val, leftNode, rightNode, rightRightNode) {
  this.type = type;
  this.val = val;
  this.leftNode = leftNode;
  this.rightNode = rightNode;
  this.rightRightNode = rightRightNode;
}

Node.prototype = {
  toString: function() {
    switch (this.type) {
      case 'constant':
        return this.val;
        break;
      case 'messageProp':
        return 'eventMessage[' + this.val + ']';
        break;
      case 'elementProp':
        return 'element[' + this.val + ']';
        break;
      case 'concat':
        return this.leftNode.toString() + '+' + this.rightNode.toString();
        break;
      case 'function':
        if (this.rightRightNode) {
          return this.val + '(' + this.leftNode.toString() + ',' +
                 this.rightNode.toString() + ',' +
                 this.rightRightNode.toString() + ')';
        } else if (this.rightNode) {
          return this.val + '(' + this.leftNode.toString() + ',' +
                 this.rightNode.toString() + ')';
        } else {
          return this.val + '(' + this.leftNode.toString() + ')';
        }
        break;
      case 'mirror':
        return 'eventMessage[' + this.val + '_value]';
        break;
      case 'mirrorRecord':
        return 'element[' + this.val + ']';
        break;
    }
  }
};

function TopNode(targetProp, node) {
  this.targetProp = targetProp;
  this.node = node;
}

TopNode.prototype = {
  toString: function() {
    if (this.node.type == 'mirrorRecord') {
      return 'eventMessage[' + this.targetProp + '_value] = ' +
             this.node.toString();
    } else {
      return 'element[' + this.targetProp + '] = ' + this.node.toString();
    }
  }
};

function xPathToNodes(xpath) {
  var q = document.evaluate(xpath, document, null, XPathResult.ANY_TYPE, null);
  var results = [];

  var next = q.iterateNext();
  while (next) {
    results.push(next);
    next = q.iterateNext();
  }
  return results;
}

// generate annotation events for the case where we just have different
// values for properties of matched nodes
function generateCompensation(eventMessage, delta) {
  log.log("Generating compensation event:", eventMessage, delta);
  // first ensure that the eventMessage target is the same as the delta's
  // target. if not, lets just ignore this delta for now
  if (eventMessage.target != delta.orig.prop.xpath) {
    log.error('delta and eventMessage targets are different');
    return;
  }

  // ignore nodes where the element is hidden
  if (delta.orig.prop.type && delta.changed.prop.type &&
      delta.orig.prop.type == 'hidden' && delta.changed.prop.type == 'hidden')
    return;

  if (delta.orig.prop.hidden == 'true' && delta.changed.prop.hidden == 'true')
    return;

  var typeOfNode = eventMessage.nodeName;
  var typeOfEvent = eventMessage.type;
  var name = typeOfEvent + '_' + typeOfNode;
  var element = xPathToNode(eventMessage.target);

  //let's get the examples associated with this type of compensation event
  if (!annotationEvents[name]) {
    var newAnnotation = {
      'guard': null,
      'record': null,
      'replay': null,
      'examples': [],
      'replayNodes': {},
      'recordNodes': {}
      };
    annotationEvents[name] = newAnnotation;
  }
  var examples = annotationEvents[name].examples;

  // for the event message, associated properties with their values
  var messagePropMap = createMessagePropMap(eventMessage);
  // make nodes for all the message properties
  var messagePropNodes = createMessagePropNodes(eventMessage);
  // make nodes for all the element properties
  var elementPropNodes = createElementPropNodes(delta.orig.prop);
  // let's add the current instance to our list of examples
  var newExample = {
    'messagePropMap': messagePropMap,
    'elementPropsBefore': delta.orig.prop,
    'elementPropsAfter': delta.changed.prop,
    'messagePropNodes': messagePropNodes,
    'elementPropNodes': elementPropNodes
  };
  examples.push(newExample);

  log.log('annotation examples:', name, examples, examples.length);

  var propsToChange = [delta.divergingProp];
  propsToChange = _.without(propsToChange, params.synthesis.omittedProps);

  log.log('props to change:', propsToChange);

  var replayNodes = {};
  var recordNodes = {};
  for (var i = 0, ii = propsToChange.length; i < ii; i++) {
    var prop = propsToChange[i];
    var before = element[prop];
    var after = delta.changed.prop[prop];

    // correct the diverging value so we don't diverge, since our annotation
    // event won't be able to fire till next time (becuase it might involve a
    // record action)
    log.log('Setting prop ', prop, ' from ', before, ' to ', after);
    sendAlert(name + ' ' + prop + ': ' + before + ' -> ' + after);

    element[prop] = after;

    var depth = params.synthesis.depth;
    var optimization = params.synthesis.optimization;
    var newNode = findExpression(examples, prop, depth, optimization);
    
    if (!newNode) {
      newNode = new Node('mirror', prop);
//      replayNodes[prop] = new TopNode(prop, newNode);
//    } else {
      //else, use the value from the recording
//      replayNodes[prop] = new TopNode(prop, newNode);
//      recordNodes[prop] = new TopNode(prop, new Node('mirrorRecord', prop));
    }
    replayNodes[prop] = new TopNode(prop, newNode);

    log.log('new annotation event:', name, prop, newNode.toString());
    sendAlert(name + ' ' + prop + '\n' + newNode.toString());

    // log all the examples so far
    for (var j in examples) {
      var example = examples[j];
      log.log('annotation event for prop ', prop, ':',
              example.elementPropsBefore[prop], ' -> ',
              example.elementPropsAfter[prop]);
    }
  }

  //now we know what statement we want to do at replay to correct each
  //diverging prop
  var compensationEvent = addCompensationEvent(name, typeOfNode,
      typeOfEvent, replayNodes, recordNodes, newExample);
  //the line below actually runs the compensation event
  //if (compensationEvent){compensationEvent.replay(element,eventMessage);}
  log.log('annotation events after addition ', annotationEvents);
}


function concat(var1, var2) {
  return var1 + var2;
}

function eq_func(var1, var2) {
  return var1 == var2;
}

function if_func(var1, var2, var3) {
  if (var1) {
    return var2;
  } else {
    return var3;
  }
}

function substr_func(var1, var2, var3) {
  try {
    return var1.substr(var2, var3);
  } catch (err) {
    //do nothing
  }
}

function createMessagePropMap(eventMessage) {
  var messagePropMap = {};
  for (var prop in eventMessage) {
    messagePropMap[prop] = eventMessage[prop];
  }
  return messagePropMap;
}

function createMessagePropNodes(eventMessage) {
  var messagePropNodes = [];
  for (var prop in eventMessage) {
    messagePropNodes.push(new Node('messageProp', prop));
  }
  return messagePropNodes;
}

function createElementPropNodes(element) {
  var elementPropNodes = [];
  for (var prop in element) {
    elementPropNodes.push(new Node('elementProp', prop));
  }
  return elementPropNodes;
}

function evaluateNodeOnExample(node, example) {
  try {
    if (node.type == 'constant') {
      return node.val;
    } else if (node.type == 'messageProp') {
      return example.messagePropMap[node.val];
    } else if (node.type == 'elementProp') {
      return example.elementPropsBefore[node.val];
    } else if (node.type == 'concat') {
      return evaluateNodeOnExample(node.leftNode, example) +
             evaluateNodeOnExample(node.rightNode, example);
    } else if (node.type == 'function') {
      if (node.val in oneArgFuncs) {
        return oneArgFuncs[node.val](evaluateNodeOnExample(node.leftNode,
            example));
      }
      if (node.val in twoArgFuncs) {
        return twoArgFuncs[node.val](evaluateNodeOnExample(node.leftNode,
            example), evaluateNodeOnExample(node.rightNode, example));
      }
      if (node.val in threeArgFuncs) {
        return threeArgFuncs[node.val](evaluateNodeOnExample(node.leftNode,
            example), evaluateNodeOnExample(node.rightNode, example),
            evaluateNodeOnExample(node.rightRightNode, example));
      }
    }
  } catch (err) {
    //do nothing
  }
}

function constantMatchingValue(examples, targetProp) {
  var constant = examples[0].elementPropsAfter[targetProp];
  if (_.reduce(examples, function(acc, ex) {
    return (acc && ex.elementPropsAfter[targetProp] == constant);
  }, true)) {
    return new Node('constant', constant);
  }
  return null;
}

function messagePropMatchingValue(examples, targetProp) {
  var messagePropNodes = examples[0].messagePropNodes;
  for (var node in messagePropNodes) {
    //if for all examples this message prop is the same as the
    //target value for that example, return this message prop
    if (_.reduce(examples, function(acc, ex) {
      return;
      (acc && evaluateNodeOnExample(node, ex) ==
       ex.elementPropsAfter[targetProp]);
    }, true)) {
      return node;
    }
  }
  return null;
}

function elementPropMatchingValue(examples, targetProp) {
  var elementPropNodes = examples[0].elementPropNodes;
  for (var node in elementPropNodes) {
    if (_.reduce(examples, function(acc, ex) {
      return;
      (acc && evaluateNodeOnExample(node, ex) ==
       ex.elementPropsAfter[targetProp]);
    }, true)) {
      return node;
    }
  }
  return null;
}

function concatMatchingValue(examples, targetProp) {
  var messagePropNodes = examples[0].messagePropNodes;
  var elementPropNodes = examples[0].elementPropNodes;
  var nodes = [];
  nodes.push(new Node('constant', 1));
  nodes.push(new Node('constant', -1));
  var nodes = nodes.concat(messagePropNodes, elementPropNodes);
  for (var i in nodes) {
    for (var j in nodes) {
      var node1 = nodes[i];
      var node2 = nodes[j];
      if (_.reduce(examples, function(acc, ex) {
        return (acc && evaluateNodeOnExample(node1, ex) +
                evaluateNodeOnExample(node2, ex) ==
                ex.elementPropsAfter[targetProp]);
      }, true)) {
        return new Node('concat', '', node1, node2);
      }
    }
  }
}

function findExpression(examples, prop, depth, optimizationLevel) {
  var functions = [findSatisfyingExpression,
                   findSatisfyingExpressionOptimized,
                   findSatisfyingExpressionOptimized2];
  return functions[optimizationLevel](examples, prop, depth);
}

function findSatisfyingExpression(examples, prop, depth) {
  //if we can use a constant, use that
  var constantNode = constantMatchingValue(examples, prop);
  if (constantNode) {
    return constantNode;
  }

  //let's set up the first pool of nodes
  var startNodes = [];
  var messagePropNodes = examples[0].messagePropNodes;
  var elementPropNodes = examples[0].elementPropNodes;
  startNodes.push(new Node('constant', 1));
  startNodes.push(new Node('constant', -1));
  startNodes = startNodes.concat(messagePropNodes, elementPropNodes);

  var deepNode = deepMatchingValue(examples, prop, startNodes, startNodes,
                                   depth);
  return deepNode;
}

function findSatisfyingExpressionOptimized(examples, prop, depth) {
  //if we can use a constant, use that
  var constantNode = constantMatchingValue(examples, prop);
  if (constantNode) {
    return constantNode;
  }

  //let's set up the first pool of nodes
  var startNodes = [];
  var messagePropNodes = examples[0].messagePropNodes;
  var elementPropNodes = examples[0].elementPropNodes;
  startNodes.push(new Node('constant', 1));
  startNodes.push(new Node('constant', -1));
  startNodes = startNodes.concat(messagePropNodes, elementPropNodes);

  var correctTuple = [];
  for (var i in examples) {
    var example = examples[i];
    correctTuple.push(example.elementPropsAfter[prop]);
  }

  var values = {};
  for (var i in startNodes) {
    var node = startNodes[i];
    var tuple = [];
    for (var i in examples) {
      var example = examples[i];
      tuple.push(evaluateNodeOnExample(node, example));
    }
    var tupleString = tuple.toString();
    if (!(tupleString in values)) {
      if (_.isEqual(tuple, correctTuple)) {
        return node;
      }
      values[tupleString] = [tuple, node];
    }
  }

  var deepNode = deepMatchingValueOptimized(examples, prop, values, depth);
  return deepNode;
}

function findSatisfyingExpressionOptimized2(examples, prop, depth) {
  //if we can use a constant, use that
  var constantNode = constantMatchingValue(examples, prop);
  if (constantNode) {
    return constantNode;
  }

  //let's set up the first pool of nodes
  var startNodes = [];
  var messagePropNodes = examples[0].messagePropNodes;
  var elementPropNodes = examples[0].elementPropNodes;
  startNodes.push(new Node('constant', 1));
  startNodes.push(new Node('constant', -1));
  startNodes = startNodes.concat(messagePropNodes, elementPropNodes);

  var correctTuple = [];
  for (var i in examples) {
    var example = examples[i];
    correctTuple.push(example.elementPropsAfter[prop]);
  }

  var values = {};
  for (var i in startNodes) {
    var node = startNodes[i];
    var tuple = [];
    for (var i in examples) {
      var example = examples[i];
      tuple.push(evaluateNodeOnExample(node, example));
    }
    var tupleString = tuple.toString();
    if (!(tupleString in values)) {
      if (tuple == correctTuple) {
        return node;
      }
      values[tupleString] = [tuple, node];
    }
  }

  var deepNode = deepMatchingValueOptimized2(examples, prop, values, depth);
  return deepNode;
}

function getObjectSize(myObject) {
  var count = 0;
  for (var key in myObject)
  count++;
  return count;
}

function deepMatchingValue(examples, targetProp, nodesToTest, componentNodes,
                           depth) {
  var oneArgNodes = [];
  var twoArgNodes = [];
  var threeArgNodes = [];

  for (var i in nodesToTest) {
    var node = nodesToTest[i];
    if (_.reduce(examples, function(acc, ex) {
      return (acc && evaluateNodeOnExample(node, ex) ==
              ex.elementPropsAfter[targetProp]);
    }, true)) {
      return node;
    }
  }

  if (depth <= 1) {
    return null;
  }

  for (var i in componentNodes) {
    var node1 = componentNodes[i];
    for (var funcName in oneArgFuncs) {
      var newNode = new Node('function', funcName, node1);
      oneArgNodes.push(newNode);
    }
    for (var j in componentNodes) {
      var node2 = componentNodes[j];
      for (var funcName in twoArgFuncs) {
        var newNode = new Node('function', funcName, node1, node2);
        twoArgNodes.push(newNode);
      }
      for (var k in componentNodes) {
        var node3 = componentNodes[k];
        for (var funcName in threeArgFuncs) {
          var newNode = new Node('function', funcName, node1, node2, node3);
          threeArgNodes.push(newNode);
        }
      }
    }
  }

  var nodesToTestNext = oneArgNodes.concat(twoArgNodes, threeArgNodes);
  var componentNodesNext = componentNodes.concat(nodesToTestNext);

  return deepMatchingValue(examples, targetProp, nodesToTestNext,
                           componentNodesNext, depth - 1);
}

function deepMatchingValueOptimized(examples, targetProp, values, depth) {
  // console.log(examples, targetProp, values, depth);
  var valuesForLater = _.clone(values);
  var examplesLength = examples.length;

  var correctTuple = [];
  for (var i in examples) {
    var example = examples[i];
    correctTuple.push(example.elementPropsAfter[targetProp]);
  }

  var t1 = new Date();
  console.log('lengths at start ', getObjectSize(values));

  if (depth <= 1) {
    return null;
  }

  for (var tuple1 in values) {
    var tuple1vals = values[tuple1][0];
    var node1 = values[tuple1][1];
    for (var funcName in oneArgFuncs) {
      var func = oneArgFuncs[funcName];
      var tuple = [];
      for (var i = 0; i < examplesLength; i++) {
        tuple.push(func(tuple1vals[i]));
      }
      var tupleString = tuple.toString();
      if (!(tupleString in values)) {
        var newNode = new Node('function', funcName, node1);
        if (_.isEqual(tuple, correctTuple)) {
          return newNode;
        }
        valuesForLater[tupleString] = [tuple, newNode];
      }
    }
  }

  for (var tuple1 in values) {
    var tupl// e1vals = values[tuple1][0];
    var node1 = values[tuple1][1];
    for (var tuple2 in values) {
      var tuple2vals = values[tuple2][0];
      var node2 = values[tuple2][1];
      for (var funcName in twoArgFuncs) {
        var func = twoArgFuncs[funcName];
        var tuple = [];
        for (var i = 0; i < examplesLength; i++) {
          var val = func(tuple1vals[i], tuple2vals[i]);
          tuple.push(val);
        }
        var tupleString = tuple.toString();
        if (!(tupleString in values)) {
          if (node1.val == 'value' && node2.val == 'char') {
            console.log('new tuple', tuple);
            console.log('correct tuple', correctTuple);
            console.log(node1, node2, funcName);
          }
          var newNode = new Node('function', funcName, node1, node2);
          if (_.isEqual(tuple, correctTuple)) {
            return newNode;
          }
          valuesForLater[tupleString] = [tuple, newNode];
        }
      }
    }
  }

  for (var tuple1 in values) {
    var tuple1vals = values[tuple1][0];
    var node1 = values[tuple1][1];
    for (var tuple2 in values) {
      var tuple2vals = values[tuple2][0];
      var node2 = values[tuple2][1];
      for (var tuple3 in values) {
        var tuple3vals = values[tuple3][0];
        var node3 = values[tuple3][1];
        for (var funcName in threeArgFuncs) {
          var func = threeArgFuncs[funcName];
          var tuple = [];
          for (var i = 0; i < examplesLength; i++) {
            var val = func(tuple1vals[i], tuple2vals[i], tuple3vals[i]);
            tuple.push(val);
          }
          var tupleString = tuple.toString();
          if (!(tupleString in values)) {
            var newNode = new Node('function', funcName, node1, node2, node3);
            if (_.isEqual(tuple, correctTuple)) {
              return newNode;
            }
            valuesForLater[tupleString] = [tuple, newNode];
          }
        }
      }
    }
  }

  console.log('values after', valuesForLater);

  console.log('lengths at end ', getObjectSize(valuesForLater));
  var t2 = new Date();
  var time = t2 - t1;
  console.log('time: ', time);

  return deepMatchingValueOptimized(examples, targetProp, valuesForLater,
                                    depth - 1);
}

function deepMatchingValueOptimized2(examples, targetProp, values, depth) {
  var valuesForLater = _.clone(values);
  var examplesLength = examples.length;

  var correctTuple = [];
  for (var i in examples) {
    var example = examples[i];
    correctTuple.push(example.elementPropsAfter[targetProp]);
  }

  if (depth <= 1) {
    return null;
  }

  for (var tuple1 in values) {
    var tuple1vals = values[tuple1][0];
    var node1 = values[tuple1][1];
    for (var funcName in oneArgFuncs) {
      var func = oneArgFuncs[funcName];
      var tuple = [];
      for (var i = 0; i < examplesLength; i++) {
        tuple.push(func(tuple1vals[i]));
      }
      var tupleString = tuple.toString();
      if (!(tupleString in values)) {
        var newNode = new Node('function', funcName, node1);
        if (sameTuple(correctTuple, tuple)) {
          return newNode;
        }
        valuesForLater[tupleString] = [tuple, newNode];
      }
    }
  }

  var twoArgFuncsRestricted = _.omit(twoArgFuncs, 'concat');
  var doConcat = _.contains(_.keys(twoArgFuncs), 'concat');

  for (var tuple1 in values) {
    var tuple1vals = values[tuple1][0];
    var node1 = values[tuple1][1];
    for (var tuple2 in values) {
      var tuple2vals = values[tuple2][0];
      var node2 = values[tuple2][1];
      for (var funcName in twoArgFuncsRestricted) {
        var func = twoArgFuncs[funcName];
        var tuple = [];
        for (var i = 0; i < examplesLength; i++) {
          var val = func(tuple1vals[i], tuple2vals[i]);
          tuple.push(val);
        }
        var tupleString = tuple.toString();
        if (!(tupleString in values)) {
          var newNode = new Node('function', funcName, node1, node2);
          if (sameTuple(correctTuple, tuple)) {
            return newNode;
          }
          valuesForLater[tupleString] = [tuple, newNode];
        }
      }
      //now let's take care of concat separately
      if (doConcat) {
        var func = twoArgFuncs['concat'];
        var tuple = [];
        for (var i = 0; i < examplesLength; i++) {
          var val = func(tuple1vals[i], tuple2vals[i]);
          tuple.push(val);
        }
        var tupleString = tuple.toString();
        if (!(tupleString in values)) {
          var newNode = new Node('function', 'concat', node1, node2);
          if (sameTuple(correctTuple, tuple)) {
            return newNode;
          }
          if (includesTuple(correctTuple, tuple)) {
            valuesForLater[tupleString] = [tuple, newNode];
          }
        }
      }
    }
  }

  var threeArgFuncsRestricted = _.omit(threeArgFuncs, 'if_func');
  var doIf = _.contains(_.keys(threeArgFuncs), 'if_func');

  for (var tuple1 in values) {
    var tuple1vals = values[tuple1][0];
    var node1 = values[tuple1][1];
    for (var tuple2 in values) {
      var tuple2vals = values[tuple2][0];
      var node2 = values[tuple2][1];
      for (var tuple3 in values) {
        var tuple3vals = values[tuple3][0];
        var node3 = values[tuple3][1];
        for (var funcName in threeArgFuncs) {
          var func = threeArgFuncs[funcName];
          var tuple = [];
          for (var i = 0; i < examplesLength; i++) {
            var val = func(tuple1vals[i], tuple2vals[i], tuple3vals[i]);
            tuple.push(val);
          }
          var tupleString = tuple.toString();
          if (!(tupleString in values)) {
            var newNode = new Node('function', funcName, node1, node2, node3);
            if (sameTuple(correctTuple, tuple)) {
              return newNode;
            }
            valuesForLater[tupleString] = [tuple, newNode];
          }
        }
        //if the new thing is an if, split into two pools and do two separate searches
        //also, first check if the if actually splits the pool at all.  if it doesn't, skip the if
        //if we can't find a solution for one pool, don't do the if either
        if (doIf) {
          var trueList = [];
          var trueIndexes = [];
          var falseList = [];
          var falseIndexes = [];
          for (var i = 0; i < examplesLength; i++) {
            var example = examples[i];
            if (evaluateNodeOnExample(node1, example)) {
              trueList.push(example);
              trueIndexes.push(i);
            } else {
              falseList.push(example);
              falseIndexes.push(i);
            }
          }
          //now all the examples for which node1 would evaluate true are
          //in trueList, and all examples for which node2 would evaluate
          //false are in falseList
          if (trueList.length == 0 || falseList.length == 0) {
            //if our condition doesn't split the pool of examples, it's
            //silly to use it
            continue;
          }
          //because of our concat optimization, concats might get thrown out
          //if they don't work for all examples, so we can't just use the values
          //we've already built up.  we're going to have to try to generate
          //a wholly new expression of the appropriate depth, for each branch

          //let's send off a search for an expression that works for all trueList examples
          var trueExpression = deepMatchingValueOptimized2(trueList,
              targetProp, generateValuesForExamples(trueList, correctTuple),
              depth - 1);
          if (trueExpression == null) {
            //again, silly to try this if, so we continue
            continue;
          }
          var falseExpression = deepMatchingValueOptimized2(falseList,
              targetProp, generateValuesForExamples(falseList, correctTuple),
              depth - 1);
          if (falseExpression == null) {
            //again, silly to try this if, so we continue
            continue;
          }
          //we actually only get to this point if we've found an if
          //that's successful for the whole subset of examples on
          //which it needs to succeed.
          return new Node('function', 'if_func', node1, trueExpression,
                          falseExpression);
        }
      }
    }
  }

  return deepMatchingValueOptimized2(examples, targetProp, valuesForLater,
                                     depth - 1);
}

function sameTuple(tuple1, tuple2) {
  var len = tuple1.length;
  for (var i = 0; i < len; i++) {
    if (tuple1[i] != tuple2[i]) {
      return false;
    }
  }
  return true;
}

function includesTuple(targetTuple, tuple) {
  for (var tupleIndex in targetTuple) {
    if (typeof targetTuple[tupleIndex] == 'string' &&
        targetTuple[tupleIndex].indexOf(tuple[tupleIndex]) == -1) {
      return false;
    }
  }
  return true;
}

function generateValuesForExamples(examples, correctTuple) {
  //let's set up the first pool of nodes
  var startNodes = [];
  var messagePropNodes = examples[0].messagePropNodes;
  var elementPropNodes = examples[0].elementPropNodes;
  startNodes.push(new Node('constant', 1));
  startNodes.push(new Node('constant', -1));
  startNodes = startNodes.concat(messagePropNodes, elementPropNodes);

  var values = {};
  for (var i in startNodes) {
    var node = startNodes[i];
    var tuple = [];
    for (var i in examples) {
      var example = examples[i];
      tuple.push(evaluateNodeOnExample(node, example));
    }
    var tupleString = tuple.toString();
    if (!(tupleString in values)) {
      if (tuple == correctTuple) {
        return node;
      }
      values[tupleString] = [tuple, node];
    }
  }
  return values;
}

function functionsFromNodes(nodes) {
  var functions = [];
  for (var i in nodes) {
    var topNode = nodes[i];
    var targetProp = topNode.targetProp;
    var node = topNode.node;
    var RHSFunction = functionFromNode(node);
    var wholeFunction = makeFunction(targetProp, node, RHSFunction);
    functions.push(wholeFunction);
  }
  return functions;
}

function makeFunction(targetProp, node, RHSFunction){
  var compFunction;
  compFunction = function(eventMessage, element) {
    if ((typeof element[targetProp]) !== 'undefined') {
      log.log("before compensation:", element[targetProp]);
      var newVal = RHSFunction(eventMessage, element);
      if (newVal)
        element[targetProp] = newVal;
      log.log("after compensation:", element[targetProp]);
    }
  };
  return compFunction;
}


function functionFromNode(node) {
  if (node.type == 'constant') {
    return makeConstantFunction(node);
  } else if (node.type == 'messageProp') {
    return makeMessagePropFunction(node);
  } else if (node.type == 'elementProp') {
    return makeElementPropFunction(node);
  } else if (node.type == 'concat') {
    return makeConcatFunction(node);
  } else if (node.type == 'function') {
    return makeFunctionFunction(node);
  } else if (node.type == 'mirror') {
    return makeMirrorFunction(node);
//  } else if (node.type == 'mirrorRecord') {
//    return makeMirrorRecordFunction(node);
  }
}

function makeConstantFunction(node) {
  var elementPropFunction = function(eventMessage, element) {
    return node.val;
  };
  return elementPropFunction;
}

function makeMessagePropFunction(node) {
  var messageProp = node.val;
  var messagePropFunction;
  if (messageProp == '_charCode_keyCode') {
    messagePropFunction = function(eventMessage, element) {
      return String.fromCharCode(eventMessage['keyCode']);
    };
  } else if (messageProp == '_charCode_charCode') {
    messagePropFunction = function(eventMessage, element) {
      return String.fromCharCode(eventMessage['charCode']);
    };
  } else {
    messagePropFunction = function(eventMessage, element) {
      return eventMessage[messageProp];
    };
  }
  return messagePropFunction;
}

function makeElementPropFunction(node) {
  var elementProp = node.val;
  var elementPropFunction = function(eventMessage, element) {
    return element[elementProp];
  };
  return elementPropFunction;
}

function makeConcatFunction(node) {
  var leftNodeFunc = functionFromNode(node.leftNode);
  var rightNodeFunc = functionFromNode(node.rightNode);

  var concatFunction = function(eventMessage, element) {
    return leftNodeFunc(eventMessage, element) +
           rightNodeFunc(eventMessage, element);
  };
  return concatFunction;
}

function makeFunctionFunction(node) {
  var functionFunction;
  if (node.val in oneArgFuncs) {
    var funcToApply = oneArgFuncs[node.val];
    var leftNodeFunc = functionFromNode(node.leftNode);
    functionFunction = function(eventMessage, element) {
      return funcToApply(leftNodeFunc(eventMessage, element));
    };
  }
  if (node.val in twoArgFuncs) {
    var funcToApply = twoArgFuncs[node.val];
    var leftNodeFunc = functionFromNode(node.leftNode);
    var rightNodeFunc = functionFromNode(node.rightNode);
    functionFunction = function(eventMessage, element) {
      return funcToApply(leftNodeFunc(eventMessage, element),
                         rightNodeFunc(eventMessage, element));
    };
  }
  if (node.val in threeArgFuncs) {
    var funcToApply = threeArgFuncs[node.val];
    var leftNodeFunc = functionFromNode(node.leftNode);
    var rightNodeFunc = functionFromNode(node.rightNode);
    var rightRightNodeFunc = functionFromNode(node.rightRightNode);
    functionFunction = function(eventMessage, element) {
      return funcToApply(leftNodeFunc(eventMessage, element),
                         rightNodeFunc(eventMessage, element),
                         rightRightNodeFunc(eventMessage, element));
    };
  }
  return functionFunction;
}

function makeMirrorFunction(node) {
  var targetProp = node.val;
  var mirrorFunction = function(eventMessage, element) {
//    return eventMessage[targetProp + '_value'];
    var snapshotProps = eventMessage.nodeSnapshot.prop;
    if (targetProp in snapshotProps)
      return snapshotProps[targetProp];
    else
      return null;
  };
  return mirrorFunction;
}

function makeMirrorRecordFunction(node) {
  var targetProp = node.val;
  var mirrorRecordFunction = function(element, eventMessage) {
    return element[targetProp];
  };
  return mirrorRecordFunction;
}

function addCompensationEvent(name, typeOfNode, typeOfEvent, replayNodes,
                              recordNodes, example) {
  if (Object.keys(recordNodes).length == 0 &&
      Object.keys(replayNodes).length == 0)
    return;

  var oldAnnotation = annotationEvents[name];
  var oldReplayNodes = oldAnnotation.replayNodes;
  var oldRecordNodes = oldAnnotation.recordNodes;

  var allReplayNodes = $.extend({}, oldReplayNodes, replayNodes);
  var allRecordNodes = $.extend({}, oldRecordNodes, recordNodes);

  var guard = function(eventData, eventMessage) {
    return eventMessage.nodeName == typeOfNode &&
           eventMessage.type == typeOfEvent;
  };

  var replayFunctions = functionsFromNodes(allReplayNodes);
  //var recordFunctions = functionsFromNodes(allRecordNodes);

  var replay = function(element, eventMessage) {
    //iterate through the statements we want to execute
    for (var i = 0; i < replayFunctions.length; i++) {
      replayFunctions[i](eventMessage, element);
    }
  };

  var record = null;
//  //if we don't have anything to do at record, go ahead and avoid
//  //making a function for it
//  if (recordFunctions.length == 0) {
//    record = null;
//  } else {
//    var record = function(element, eventMessage) {
//      for (var i = 0; i < recordFunctions.length; i++) {
//        recordFunctions[i](element, eventMessage);
//      }
//    };
//  }

  //let's get the examples associated with this type of compensation event
  var examples = annotationEvents[name].examples;
  //recall we've already appended the new example to the annotaiton examples
  annotationEvents[name] = {
    'guard': guard,
    'record': record,
    'replay': replay,
    'examples': examples,
    'replayNodes': allReplayNodes,
    'recordNodes': allRecordNodes
  };
  return annotationEvents[name];
}

//***************************************************************************
//  Delta code
//***************************************************************************

// we're going to return the list of deltas, taking out any deltas
// that also appear in deltasToRemove

// if we call this on filterDeltas(recordDeltas replayDeltas), we'll return the
// list of recordDeltas that did not also appear during replay time
function filterDeltas(deltas, deltasToRemove) {
  var finalDeltas = [];

  for (var i = 0, ii = deltas.length; i < ii; ++i) {
    var delta = deltas[i];
    var matched = false;
    for (var j = 0, jj = deltasToRemove.length; j < jj; ++j) {
      var deltaToRemove = deltasToRemove[j];
      // now let's check if every property changed by delta
      // is also changed in the same way by deltaToRemove
      // in which case we can go ahead and say that delta is matched
      if (deltaEqual(delta, deltaToRemove)) {
        matched = true;
        continue;
      }
    }

    if (!matched)
      finalDeltas.push(delta);
  }
  return finalDeltas;
}

// returns true if div2 changes all the props that div1 changes or div2 leaves
// the property unchanged and value is correct. Only checks for property
// differences

function deltaEqual(delta1, delta2) {
  var type = 'Property is different.';
  if (delta1.type != type || delta2.type != type)
    return false;

  var prop1 = delta1.divergingProp;
  var prop2 = delta2.divergingProp;

  return prop1 == prop2 && 
         delta1.changed.prop[prop1] == delta2.changed.prop[prop2];
}

//returns a list of the properties for which two objects have different
//values
function divergingProps(obj1props, obj2props) {
  if (!(obj1props && obj2props)) {
    throw "divergingProps called with bad arguements";
  }
  var obj1props = _.omit(obj1props, params.synthesis.omittedProps);
  var obj2props = _.omit(obj2props, params.synthesis.omittedProps);

  var divergingProps = [];
  for (var prop in obj1props) {
    if (obj1props[prop] != obj2props[prop]) {
      divergingProps.push(prop);
    }
  }
  return divergingProps;
}

// takes in two DOMs, traversing and lining up and outputs the differences
function getDeltas(origDom, changedDom) {
  return compareNodes(origDom, changedDom);
}

// tries to line up DOM nodes, descends through DOM
function compareNodes(origNode, changedNode) {
  if (!origNode && !changedNode)
    throw "both nodes doesn't actually exist";

  // check if both nodes are DOM nodes and not just text nodes
  if (origNode && changedNode &&
      origNode.type == 'DOM' && changedNode.type == 'DOM') {

    var deltas = [];

    // we've tried to match a node that turns out not to be the same
    // we want to mark that this is a divergence, but there may be  more 
    // relevant deltas among its children, so let's just add this divergence
    // and continue descending
    if (!nodeEquals(origNode, changedNode)) {
      var props1 = origNode.prop || [];
      var props2 = changedNode.prop || [];
      var omittedProps = params.synthesis.omittedProps;

      props1 = _.omit(props1, omittedProps);
      props2 = _.omit(props2, omittedProps);
     
      var diffProps = divergingProps(props1, props2);
      for (var i = 0, ii = diffProps.length; i < ii; ++i) {
        deltas.push({
          'type': "Property is different.",
          'orig': origNode,
          'changed': changedNode,
          'divergingProp': diffProps[i]
        });
      }
    }
  
    // check the children 
    var children1 = origNode.children;
    var children2 = changedNode.children;
    var numChildren1 = children1.length;
    var numChildren2 = children2.length;

    // these objects have messy children that need matching
    var mismatched = false;
    if (numChildren1 != numChildren2) {
      mismatched = true;
    } else  {
      // proceed on the assumption that we can just index into these
      // children without difficulty, only change our mind if we find
      // any of the children's properties don't match
      for (var i = 0; i < numChildren1; i++) {
        if (!(nodeEquals(children1[i], children2[i]))) {
          mismatched = true;
          break;
        }
      }
    }

    if (mismatched) {
      deltas = deltas.concat(compareNodesMismatched(origNode, changedNode));
    } else {
      // if we're here, we didn't have to do mismatched children at this step
      // recurse normally
      for (var i = 0; i < numChildren1; i++) {
        var newDivergences = compareNodes(children1[i], children2[i]);
        deltas = deltas.concat(newDivergences);
      }
    }
    return deltas;
  // at least one node isn't a DOM node
  } else {
    if (!origNode) {
      return [{
        'type': 'New node in changed DOM.',
        'orig': origNode,
        'changed': changedNode,
      }];
    } else if (!changedNode) {
      return [{
        'type': 'Node missing in changed DOM.',
        'orig': origNode,
        'changed': changedNode,
      }];
    } else if (origNode.type == 'DOM' || changedNode.type == 'DOM') {
      return [{
        'type': 'Node types differ.',
        'orig': origNode,
        'changed': changedNode,
      }];
    // Both nodes should be text nodes
    } else if (origNode.type == 'text' && origNode.type == 'text') {
      if (nodeEquals(origNode, changedNode)) {
        return [];
      }
      //sad, we descended all the way and the nodes aren't the same
      return [{
        'type': "Nodes not the same.",
        'orig': origNode,
        'changed': changedNode,
      }];
    }
  }
}

//  try to match up children before traversing the rest of the subtree
//  both obj1 and obj2 have children so we need to find a mapping between
//    children
function compareNodesMismatched(origNode, changedNode) {
  var divergences = [];
  var children1 = origNode.children;
  var children2 = changedNode.children;
  var numChildren1 = children1.length;
  var numChildren2 = children2.length;
  var children1NumMatches = [];
  var children1MatchedWith = [];
  var children2MatchedWith = [];

  if (verbose) {
    console.log('recursive visit mismatched children', origNode, changedNode);
    console.log(nodeToString(origNode));
    console.log(nodeToString(changedNode));
  }

  for (var i = 0; i < numChildren1; i++) {
    children1NumMatches.push(0);
    children1MatchedWith.push(-1);
  }
  for (var i = 0; i < numChildren2; i++) {
    children2MatchedWith.push(-1);
  }

  //let's iterate through changedNode's children and try to find a
  //corresponding child in origNode's children
  //we'll make a mapping

  for (var i = 0; i < numChildren2; i++) {
    var child2 = children2[i];
    var child1 = children1[i];
    //first let's see if the corresponding child actually does work
    if (i < numChildren1 && (
        sameId(child2, child1) || sameTagAndTagSufficient(child2,
        child1) || nodeEquals(child2, child1) ||
        similarity(child2, child1) > similarityThreshold)) {
      children2MatchedWith[i] = i;
      children1MatchedWith[i] = i;
      children1NumMatches[i]++;
    //otherwise let's do our matching based just on similarity
    } else {
      if (verbose) {
        console.log("didn't match i", child2, child1);
        console.log(nodeToString(child2));
        console.log(nodeToString(child1));
        console.log('nodeEquals', nodeEquals(child2, child1));
        if (child2 && child1 && child2.prop && child1.prop &&
            child2.prop.tagName && child1.prop.tagName) {
          console.log('tagName ', child2.prop.tagName ==
                      child1.prop.tagName,
                      (child2.prop.tagName in acceptTags));
        }
        console.log('similarity', similarity(child2, child1),
                    similarity(child2, child1) > similarityThreshold);
      }

      var maxSimilarityScore = 0;
      var maxSimilarityScoreIndex = 0;
      for (var j = 0; j < numChildren1; j++) {
        var child1 = children1[j];
        if (nodeEquals(child2, child1) ||
            sameTagAndTagSufficient(child2, child1) ||
            sameId(child2, child1)) {
          //we can rest assured about child1 and child2
          //add to the mapping
          //console.log("Matched with nodeEquals and sameTagAndTagSufficient");
          children2MatchedWith[i] = j;
          children1MatchedWith[j] = i;
          children1NumMatches[j]++;
          break;
        }
        //if we haven't matched it yet, we have to keep computing
        //similarity scores
        var similarityScore = similarity(child2, child1);
        //console.log("Didn't match.  Had to find similarity. ", similarityScore);
        if (similarityScore > maxSimilarityScore) {
          maxSimilarityScore = similarityScore;
          maxSimilarityScoreIndex = j;
        }
      }
      //if our maxSimilarityScore is sufficiently high, go ahead and
      //add the pairing to our mapping
      //console.log("our max similarity score is ", maxSimilarityScore);
      if (maxSimilarityScore > similarityThreshold) {
        children2MatchedWith[i] = maxSimilarityScoreIndex;
        children1MatchedWith[maxSimilarityScoreIndex] = i;
        children1NumMatches[maxSimilarityScoreIndex]++;
      //otherwise, let's assume we haven't found a match for child2
      //and it was added to changedNode's page
      } else if (children2MatchedWith[i] == -1) {
        divergences.push({
          'type': 'New child in changed DOM.',
          'orig': origNode,
          'changed': changedNode,
          'relevantChildren': [child2],
        });
      }
    }
  }

  //now we need to see which of origNode's children didn't have any changedNode
  //children mapped to them
  //if such a child is similar to other origNode children that did get
  //mapped to, it looks like a different number of children type problem
  //and we should report that
  //otherwise it looks as though there was a child removed, and we
  //should report that

  //note that in this scheme, we don't actually traverse things that
  //seem to be in classes of siblings...things that seem to be similar
  //we adopt this because at that point we expect it to be a template
  //for differing content

  for (var i = 0; i < numChildren1; i++) {
    //this case should never catch any of the children we want to ignore
    //console.log("trying to find mappings", children1NumMatches);
    if (children1NumMatches[i] > 0) {
      //console.log("check for siblings");
      //potential sibling class
      var numSiblingsInObj1Page = 1; //starts at 1 because item i
      for (var j = 0; j < numChildren1; j++) {
        if (children1NumMatches[j] == 0 && (nodeEquals(children1[i],
            children1[j]) || similarity(children1[i],
            children1[j]) > similarityThreshold)) {
          //we have a match!
          numSiblingsInObj1Page++;
          //let's not catch this later when we report nodes
          //missing from changedNode's page but present in origNode's
          children1NumMatches[j] = -1;
        }
      }
      //let's distinguish between 1-1 mappings and sibling classes here
      if (numSiblingsInObj1Page > 1 || children1NumMatches[i] > 1) {
        //this is a case of having multiple similar siblings
        divergences.push({
          'type': 'Different number of a particular node type: ' + 
                  numSiblingsInObj1Page + '/' + children1NumMatches[i],
          'orig': origNode,
          'changed': changedNode,
          'relevantChildren': [children1[i]],
        });
      } else {
        //1-1 mapping, so let's keep descending to find out what's going on
        divergences = divergences.concat(compareNodes(children1[i],
                                         children2[children1MatchedWith[i]]));
      }
    }
  }

  //now we've taken care of any page 1 nodes that were just missed
  //because page 2 preferred its siblings
  //so anything that still hasn't been matched is something that
  //was actually removed

  for (var i = 0; i < numChildren1; i++) {
    if (children1NumMatches[i] == 0) {
      if (!(children1[i].prop && children1[i].prop.innerText)) {
        continue;
      }
      divergences.push({
        'type': 'Missing child in changed DOM.',
        'orig': origNode,
        'changed': changedNode,
        'relevantChildren': [children1[i]],
      });
    }
  }
  return divergences;
}

/* toString for DOM nodes */
function nodeToString(obj1) {
  if (obj1 && obj1.children) {

    var obj1String = obj1.prop.tagName;
    var children1 = obj1.children;
    var numChildren1 = obj1.children.length;

    for (var i = 0; i < numChildren1; i++) {
      if (children1[i].prop) obj1String += children1[i].prop.tagName;
    }
    return obj1String;
  } else {
    return '';
  }
}

function similarityStringClasses(obj1) {
  if (obj1 && obj1.children) {

    var obj1String = obj1.prop.tagName + obj1.prop.className;
    var children1 = obj1.children;
    var numChildren1 = obj1.children.length;

    for (var i = 0; i < numChildren1; i++) {
      if (children1[i].prop) obj1String += (children1[i].prop.tagName +
          children1[i].prop.className);
    }
    return obj1String;
  } else {
    return '';
  }
}

function similarity(obj1, obj2) {
  //how about just traversing the trees and seeing if they have the same
  //structure, just not the same content?
  //maybe just put down tags.  that'd be nice I think
  //we'll check to depth 4
  var ret = tagMatchesAndTotalTags(obj1, obj2, 1);
  //console.log("similarity of ", nodeToString(obj1), " and ", nodeToString(obj2), "is", ret.tagMatches/ret.totalTags);
  var score = ret.tagMatches / ret.totalTags;
  return score;
}

function sameTagAndTagSufficient(obj1, obj2) {
  var ret = obj1 && obj2 && obj1.prop && obj2.prop && obj1.prop.tagName &&
            obj2.prop.tagName && obj1.prop.tagName == obj2.prop.tagName &&
            obj1.prop.tagName in acceptTags;
  return ret;
}

function tagMatchesAndTotalTags(obj1, obj2, depth) {
  var totalTags = 0;
  var tagMatches = 0;


  //if don't have two objects, we have a mismatch and we'll return
  if (!(obj1 && obj2)) {
    return {
      'totalTags': totalTags,
      'tagMatches': tagMatches
    };
  }
  //if the current tagNames match, increment the number of matches
  if (obj1.prop && obj2.prop && obj1.prop.tagName && obj2.prop.tagName) {
    totalTags++;
    if (obj1.prop.tagName == obj2.prop.tagName) {
      //console.log("the tag name ", obj1.prop.tagName, " matches, increment tagMatches");
      tagMatches++;
    }
  }
  //if the current classes match, increment the number of matches
  if (obj1.prop && obj2.prop && obj1.prop.className && obj2.prop.className &&
      obj1.prop.className == obj2.prop.className) {
    totalTags++;
    tagMatches++;
    //console.log("the class name ", obj1.prop.className, " matches, increment totalTags and tagMatches");
  }
  //if there are no children or if we're at depth limit, don't continue
  if (!(obj1.children && obj2.children) || depth <= 0) {
    //console.log("back up to the next level now");
    return {
      'totalTags': totalTags,
      'tagMatches': tagMatches
    };
  }

  var children1 = obj1.children;
  var children2 = obj2.children;
  var numChildren1 = obj1.children.length;
  var numChildren2 = obj2.children.length;
  var extra;
  var smallLength;

  if (numChildren1 > numChildren2) {
    extra = numChildren1 - numChildren2;
    smallLength = numChildren2;
  } else {
    extra = numChildren2 - numChildren1;
    smallLength = numChildren1;
  }
  totalTags += extra;
  //console.log("extra children, so we're adding ", extra, " to totalTags");

  for (var i = 0; i < smallLength; i++) {
    var ret = tagMatchesAndTotalTags(children1[i], children2[i], depth - 1);
    totalTags += ret.totalTags;
    tagMatches += ret.tagMatches;
  }

  return {
    'totalTags': totalTags,
    'tagMatches': tagMatches
  };
}


/* checks if two nodes have the same properties, all properties must be the 
   same */
function nodeEquals(node1, node2) {
  if (node1 && node2) {
    if ('prop' in node1 && 'prop' in node2) {
      var omittedProps = params.synthesis.omittedProps;
      var node1RelevantProps = _.omit(node1.prop, omittedProps);
      var node2RelevantProps = _.omit(node2.prop, omittedProps);

      return _.isEqual(node1RelevantProps, node2RelevantProps);
    } else if ('text' in node1 && 'text' in node2) {
      return node1.text == node2.text;
    }
  }
  return node1 == node2;
}

function sameId(node1, node2) {
  if (node1 && node2 && node1.prop && node2.prop && node1.prop.id &&
      node2.prop.id && node1.prop.id == node2.prop.id) {
    return true;
  }
  return false;
}
