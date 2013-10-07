var getTarget;

(function() {

  function getTargetSimple(eventData) {
    return xPathToNode(eventData.target);
  }

  getTarget = getTargetSimple;
})()
