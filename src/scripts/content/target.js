var getTarget;
var targetFunctions;
var saveTargetInfo;

(function() {
  var log = getLog('target');

  saveTargetInfo = function _saveTargetInfo(target) {
    var targetInfo = {};
    targetInfo.xpath = nodeToXPath(target);
    targetInfo.snapshot = snapshotNode(target);
    targetInfo.branch = snapshotBranch(target);

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
        log.warn('multiple targets found:', targets);
        return targets;
      }

      // If we're here, we failed to find the child. Try dropping
      // steadily larger prefixes of the xpath until some portion works.
      // Gives up if only three levels left in xpath.
      if (xpath.split("/").length < 4){
        // No more prefixes to reasonably remove, so give up
        return null;
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
    } else {
      return [];
    }
  }

  function getTargetSearch(targetInfo) {
    // search over changes to the ancesters (replacing each ancestor with a
    // star plus changes such as adding or removing ancestors)
  }

  function getTargetClass(targetInfo) {
    var className = targetInfo.snapshot.className;
    if (text) {
      return xPathToNodes('//*[text()="' + text + '"]');
    } else {
      return [];
    }
  }

  function getTargetId(targetInfo) {
    var text = targetInfo.snapshot.innerText;
    if (text) {
      return xPathToNodes('//*[text()="' + text + '"]');
    } else {
      return [];
    }
  }

  getTarget = function(targetInfo) {
    var targets = getTargetSuffix(targetInfo);
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
