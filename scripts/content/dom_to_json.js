/* -*- Mode: Java; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* vim: set shiftwidth=2 tabstop=2 autoindent cindent expandtab: */

'use strict';

var snapshotDom = null;
var compareDom = null;
 
(function() {

  function createObjTree(oNode) {
    var vReturnVal = {children: [], prop: {}};
    vReturnVal.prop["nodeName"] = oNode.nodeName.toLowerCase();

    if (oNode.hasChildNodes()) {
      for (var oChild, nItem = 0; nItem < oNode.childNodes.length; nItem++) {
        oChild = oNode.childNodes.item(nItem);
        var children = vReturnVal.children;
        if (oChild.nodeType === 4) {
          var value = oChild.nodeValue;
          if (value)
            children.push(value); /* nodeType is "CDATASection" (4) */
        } else if (oChild.nodeType === 3) {
          var value = oChild.nodeValue.trim();
          if (value)
            children.push(value); /* nodeType is "Text" (3) */
        } else if (oChild.nodeType === 1 && !oChild.prefix) {
          var child = createObjTree(oChild); /* nodeType is "Element" (1) */
          children.push(child);
        }
      }
    }    

    // possible failure due to cross-domain browser restrictions
    if (oNode.nodeName.toLowerCase() != "iframe") {
    for (var prop in oNode) {
      try {
        var val = oNode[prop];
        if (typeof val == 'string' || typeof val == 'number' || 
            typeof val == 'boolean') {
          vReturnVal.prop[prop] = val;
        }
      } catch(e) {
        // do nothing
      }
    }
    }
    return vReturnVal;
  }

  function getDifferences(tree1, tree2) {
    var props1 = tree1.prop;
    var props2 = tree2.prop;
    
    for (var p1 in props1) {
      if (p1 in props2 && props1[p1] == props2[p1]) {
        // do nothin
      } else {
      }
    }

  }
  
  snapshotDom = createObjTree;
  compareDom = getDifferences;

})();

