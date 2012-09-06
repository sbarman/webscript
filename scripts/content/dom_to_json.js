/* -*- Mode: Java; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* vim: set shiftwidth=2 tabstop=2 autoindent cindent expandtab: */

'use strict';

var DOMToJSON = new (function() {

  function createObjTree(oNode) {
    var vReturnVal = {children: [], attr: {}};
    vReturnVal.attr["nodeName"] = oNode.nodeName.toLowerCase();

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

    if (oNode.hasAttributes()) {
      var nAttrLen = oNode.attributes.length;
      for (var oAttrib, nAttrib = 0; nAttrib < nAttrLen; nAttrib++) {
        oAttrib = oNode.attributes.item(nAttrib);
        vReturnVal.attr[oAttrib.name.toLowerCase()] = oAttrib.value.trim();
      }
    }
    return vReturnVal;
  }
  
  this.build = createObjTree;

})();

