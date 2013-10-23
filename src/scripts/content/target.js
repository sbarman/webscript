var getTarget;
var getTargetFunction;
var targetFunctions;
var saveTargetInfo;

(function() {
  var log = getLog('target');

  saveTargetInfo = function _saveTargetInfo(target, recording) {
    var targetInfo = {};
    targetInfo.xpath = nodeToXPath(target);
    targetInfo.snapshot = snapshotNode(target);
    if (recording == RecordState.RECORDING) {
      targetInfo.branch = snapshotBranch(target);
    }
    return targetInfo;
  }

  function getTargetSimple(targetInfo) {
    return xPathToNodes(targetInfo.xpath);
  }

  function getTargetSuffix(targetInfo) {

    function helper(xpath) {
      var index = 0;
      while (xpath[index] == '/')
        index++;

      if (index > 0)
        xpath = xpath.slice(index)

      var targets = xPathToNodes('//' + xpath);
   
      if (targets.length > 0) {
        return targets;
      }

      // If we're here, we failed to find the child. Try dropping
      // steadily larger prefixes of the xpath until some portion works.
      // Gives up if only three levels left in xpath.
      if (xpath.split("/").length < 4){
        // No more prefixes to reasonably remove, so give up
        return [];
      }

      var index = xpath.indexOf("/");
      xpathSuffix = xpath.slice(index+1);
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
    // search over changes to the ancesters (replacing each ancestor with a
    // star plus changes such as adding or removing ancestors)

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

      var classes = className.split(' ');
      var selector = "";
      for (var i = 0, ii = classes.length; i < ii; ++i)
        selector += '.' + classes[i];

      return $.makeArray($(selector));
    }
    return [];
  }

  function getTargetId(targetInfo) {
    var id = targetInfo.snapshot.prop.id;
    if (id) {
      var selector = "#" + id;
      return $.makeArray($(selector));
    }
    return [];
  }

  function getTargetComposite(targetInfo) {
    var targets = [];
    var metaInfo = [];

    for (var strategy in targetFunctions) {
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

  getTargetFunction = getTargetComposite

  getTarget = function(targetInfo) {
    var targets = getTargetFunction(targetInfo);
    if (!targets) {
      log.debug('No target found');
      return null
    } else if (targets.length > 1) {
      log.debug('Multiple targets found:', targets);
      return targets[0];
    } else {
      return targets[0];
    }
  };

  targetFunctions = {
    simple: getTargetSimple,
    suffix: getTargetSuffix,
    text: getTargetText,
    class: getTargetClass,
    id: getTargetId,
    search: getTargetSearch
  }

})()
