/* -*- Mode: Java; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* vim: set shiftwidth=2 tabstop=2 autoindent cindent expandtab: */

'use strict'

var getTarget;
var getTargetFunction;
var targetFunctions;
var saveTargetInfo;

var matchLabel;
var getAnchors;
var createLabel;

(function() {
  var log = getLog('target');

  /* Store information about the DOM node */
  saveTargetInfo = function _saveTargetInfo(target, recording) {
    var allFeatures = ["tagName", "className", 
      "left", "bottom", "right", "top", "width", "height",
      "font-size", "font-family", "font-style", "font-weight", "color",
      "background-color", 
      "preceding-text",
      "xpath",
      "anchor",
      "snapshot"];

    // if (recording == RecordState.RECORDING) {
    //   allFeatures.push('branch');
    // }

    var targetInfo = {};
    for (var i = 0, ii = allFeatures.length; i < ii; ++i) {
      var feature = allFeatures[i];
      switch (feature) {
        case "xpath":
          targetInfo[feature] = nodeToXPath(target);
          break;
        case "snapshot":
          targetInfo[feature] = snapshotNode(target);
          break;
        case "branch":
          targetInfo[feature] = snapshotBranch(target);
          break;
        case "preceding-text":
          targetInfo[feature] = $(target).prev().text();
          break;
        case "top":
        case "right":
        case "bottom":
        case "left":
        case "width":
        case "height":
          if (target.getBoundingClientRect) {
            var rect = target.getBoundingClientRect();
            targetInfo[feature] = rect[feature];
          }
          break;
        case "tagName":
        case "className":
          targetInfo[feature] = target[feature];
          break;
        case "anchor":
          targetInfo[feature] = getAnchors(target);
          break;
        default:
          var style = getComputedStyle(target, null);
          if (style)
            targetInfo[feature] = style.getPropertyValue(feature);
      }
    }
    return targetInfo;
  };

  createLabel = function(e) {
    var tagName = e.tagName;
    var label = {tagName: tagName};

    // list of tags taken from 
    // https://developer.mozilla.org/en-US/docs/Web/HTML/Element
    // these all add visual clues to the 
    if (["A", "BUTTON", "LABEL", "OPTION"].indexOf(tagName) != -1) {
      label.textContent = e.textContent;
    } else if (["H1", "H2", "H3", "H4", "H5", "H6", "DIV", "SPAN"].
        indexOf(tagName) != -1) {
      var textContent = e.textContent;
      if (textContent.length < 20)
        label.textContent = textContent;
    } else if (["IMG"].indexOf(tagName) != -1) {
      if (e.alt)
        label.alt = e.alt;
    }
    return label;
  };

  var getUniqueSubtree =  function(element, otherNodes) {
    function checkContains(subtree, otherNodes) {
      for (var i = 0, ii = otherNodes.length; i < ii; ++i) {
        if (element.contains(otherNodes[i]))
          return true;
      }
      return false;
    }

    var e = element;
    var p = e.parentElement;
    while (e != document.body && checkContains(p, otherNodes)) {
      e = p;
      p = e.parentElement;
    }
    return e;
  };

  getAnchors = function(target) {
  // function getAnchors(target) {
    var label = createLabel(target);
    // sometimes we try to find anchors of the head element, which means the
    // body doesnt exist
    if (document.body)
      var otherConflictElements = matchLabel(label, document.body);
    else
      var otherConflictElements = [];

    return {
      label: label,
      numConflicts: otherConflictElements.length
    }
  };

  matchLabel = function(label, root) {
//  function findMatchingElements(label, root) {
    function evaluateXPath(aNode, aExpr) {
      var xpe = new XPathEvaluator();
      var nsResolver = xpe.createNSResolver(aNode.ownerDocument == null ?
        aNode.documentElement : aNode.ownerDocument.documentElement);
      var result = xpe.evaluate(aExpr, aNode, nsResolver, 0, null);
      var found = [];
      var res;
      while (res = result.iterateNext())
        found.push(res);
      return found;
    }

    var query = nodeToXPath(root.parentElement);
    var tagName = label.tagName;
    query += '//' + tagName;
    if (label.textContent)
      query += '[text()="' + label.textContent + '"]';

    var matches = evaluateXPath(document, query);
    if (label.alt)
      matches = matches.filter(function(e) { return e.alt == label.alt; });

    return matches;
  };

  /* The following functions are different implementations to take a target
   * info object, and convert it to a list of possible DOM nodes */ 

  function getTargetSimple(targetInfo) {
    return xPathToNodes(targetInfo.xpath);
  }

  function getTargetSuffix(targetInfo) {

    function helper(xpath) {
      var index = 0;
      while (xpath[index] == '/')
        index++;

      if (index > 0)
        xpath = xpath.slice(index);

      var targets = xPathToNodes('//' + xpath);

      if (targets.length > 0) {
        return targets;
      }

      /* If we're here, we failed to find the child. Try dropping
       * steadily larger prefixes of the xpath until some portion works.
       * Gives up if only three levels left in xpath. */
      if (xpath.split('/').length < 4) {
        /* No more prefixes to reasonably remove, so give up */
        return [];
      }

      var index = xpath.indexOf('/');
      xpathSuffix = xpath.slice(index + 1);
      return helper(xpathSuffix);
    }

    return helper(targetInfo.xpath);
  }

  function getTargetText(targetInfo) {
    var text = targetInfo.snapshot.prop.innerText;
    if (text) {
      return xPathToNodes('//*[text()="' + text + '"]');
    }
    return [];
  }

  function getTargetSearch(targetInfo) {
    /* search over changes to the ancesters (replacing each ancestor with a
     * star plus changes such as adding or removing ancestors) */

    function helper(xpathSplit, index) {
      if (index == 0)
        return [];

      var targets;

      if (index < xpathSplit.length - 1) {
        var clone = xpathSplit.slice(0);
        var xpathPart = clone[index];

        clone[index] = '*';
        targets = xPathToNodes(clone.join('/'));
        if (targets.length > 0)
          return targets;

        clone.splice(index, 0, xpathPart);
        targets = xPathToNodes(clone.join('/'));
        if (targets.length > 0)
          return targets;
      }

      targets = xPathToNodes(xpathSplit.join('/'));
      if (targets.length > 0)
        return targets;

      return helper(xpathSplit, index - 1);
    }

    var split = targetInfo.xpath.split('/');
    return helper(split, split.length - 1);
  }

  function getTargetClass(targetInfo) {
    var className = targetInfo.snapshot.prop.className;
    if (className) {
      //xPathToNodes("//*[@class='" + className + "']");

      var classes = className.trim().replace(':', '\\:').split(' ');
      var selector = '';
      for (var i = 0, ii = classes.length; i < ii; ++i) {
        var className = classes[i];
        if (className)
          selector += '.' + classes[i];
      }

      return $.makeArray($(selector));
    }
    return [];
  }

  function getTargetId(targetInfo) {
    var id = targetInfo.snapshot.prop.id;
    if (id) {
      var selector = '#' + id.trim().replace(':', '\\:');
      return $.makeArray($(selector));
    }
    return [];
  }

  function getTargetComposite(targetInfo) {
    var targets = [];
    var metaInfo = [];

    for (var strategy in targetFunctions) {
      try {
        var strategyTargets = targetFunctions[strategy](targetInfo);
        for (var i = 0, ii = strategyTargets.length; i < ii; ++i) {
          var t = strategyTargets[i];
          var targetIndex = targets.indexOf(t);
          if (targetIndex == -1) {
            targets.push(t);
            metaInfo.push([strategy]);
          } else {
            metaInfo[targetIndex].push(strategy);
          }
        }
      } catch (e) {}
    }

    var maxStrategies = 0;
    var maxTargets = [];
    for (var i = 0, ii = targets.length; i < ii; ++i) {
      var numStrategies = metaInfo[i].length;
      if (numStrategies == maxStrategies) {
        maxTargets.push(targets[i]);
      } else if (numStrategies > maxStrategies) {
        maxTargets = [targets[i]];
        maxStrategies = numStrategies;
      }
    }

    return maxTargets;
  }

  /* Set the target function */
  getTargetFunction = getTargetComposite;

  /* Given the target info, produce a single target DOM node. May get several
   * possible candidates, and would just return the first candidate. */
  getTarget = function(targetInfo) {
    var targets = getTargetFunction(targetInfo);
    if (!targets) {
      log.warn('No target found');
      return null;
    } else if (targets.length > 1) {
      log.warn('Multiple targets found:', targets);
      return null;
    } else {
      return targets[0];
    }
  };

  /* List of all target functions. Used for benchmarking */
  targetFunctions = {
    simple: getTargetSimple,
    suffix: getTargetSuffix,
    text: getTargetText,
    class: getTargetClass,
    id: getTargetId,
    search: getTargetSearch
  };

})();
