/* -*- Mode: Java; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* vim: set shiftwidth=2 tabstop=2 autoindent cindent expandtab: */

'use strict';

// ***************************************************************************
// Generalization code
// ***************************************************************************

var origXPath;
var examples;
var ids;

function generalizeXPath(eventObj) {
  origXPath = eventObj.target.xpath;
  examples = [];
  ids = [];

  log.log('starting generalization');
  startCapture(addExample);
  promptUser('Select a few elements in domain then press enter.',
    function(response) {
      generalizeFinish();
    }
  );
}

function addExample(target, event) {
  var highlightId = highlightNode(target);

  ids.push(highlightId);
  examples.push(target);

  event.preventDefault();
  event.stopImmediatePropagation();

  startCapture(addExample);
}

function generalizeFinish() {
  cancelCaptureNode();

  for (var i = 0, ii = ids.length; i < ii; ++i)
    dehighlightNode(ids[i]);

  for (var i = 0, ii = examples.length; i < ii; ++i)
    log.log(nodeToXPath(examples[i]));

  var parts = origXPath.split('/');
  var generalizedNodes = null;
  var generalXPath = null;
  var maxStars = 2;

  console.log(origXPath);

  starsloop: for (var numStars = 1; numStars <= maxStars; ++numStars) {
    partsloop: for (var i = parts.length - numStars; i >= 0; --i) {
      var newParts = parts.slice(0);
      for (var k = 0; k < numStars; ++k) {
        newParts.splice(i + k, 1, '*');
      }
      var newXPath = newParts.join('/');
      console.log(newXPath);
      var nodes = xPathToNodes(newXPath);

      // check to see if xpath is valid
      for (var j = 0, jj = examples.length; j < jj; ++j) {
        if (nodes.indexOf(examples[j]) == -1) {
          continue partsloop;
        }
      }

      generalizedNodes = nodes;
      generalXPath = newXPath;
      break starsloop;
    }
  }

  log.log('found more general xpath:', generalXPath, origXPath);
  findPrefixes(origXPath, generalXPath);
}

function findPrefixes(origXPath, generalXPath) {
  var generalizedNodes = xPathToNodes(generalXPath);

  if (generalizedNodes) {
    for (var i = 0, ii = generalizedNodes.length; i < ii; ++i) {
      var idName = highlightNode(generalizedNodes[i]);
      setTimeout(function() {
        dehighlightNode(idName);
      }, 2000);
    }
  } else {
    log.error('no nodes found');
    return;
  }

  // find the last occurence of * in xpath to find prefix in original xpath
  var parts = origXPath.split('/');
  var newParts = generalXPath.split('/');
  var lastStarIndex = newParts.lastIndexOf('*');
  var origPrefix = parts.slice(0, lastStarIndex + 1).join('/');

  ids = [];
  examples = [];

  var prefixes = [];
  for (var i = 0, ii = generalizedNodes.length; i < ii; ++i) {
    var newParts = nodeToXPath(generalizedNodes[i]).split('/');
    var newPrefix = newParts.slice(0, lastStarIndex + 1).join('/');
    prefixes.push(newPrefix);
  }

  port.postMessage({type: 'setGeneralize', state: recording, value: {
    type: Ack.GENERALIZE,
    generalXPath: generalXPath,
    origXPath: origXPath,
    generalPrefixes: prefixes,
    origPrefix: origPrefix,
    setTimeout: true
  }});
};

addonPreTarget.push(function(eventRecord) {
  var generalize = eventRecord.generalize;
  var target = eventRecord.target;
  var xpath = target.xpath;

  if (generalize && xpath.indexOf(generalize.orig) == 0) {
    target.xpath = xpath.replace(generalize.orig, generalize.new);
  }
});

handlers['generalize'] = generalizeXPath;
handlers['prefix'] =  function(v) {
  findPrefixes(v.origXPath, v.generalXPath);
};
