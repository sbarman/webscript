/* -*- Mode: Java; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* vim: set shiftwidth=2 tabstop=2 autoindent cindent expandtab: */

'use strict';

var snapshotDom = null;
var compareDom = null;
//var ignoreClasses = {"replaystatus": true};
var ignoreTags = {"script": true, "style": true};
 
(function() {
  function createObjTree(node, nodeName) {
    var returnVal = {children: [], prop: {}};
    returnVal.prop["nodeName"] = nodeName;

    if (node.hasChildNodes()) {
      var childNodes = node.childNodes
      var children = returnVal.children;

      for (var i = 0, ii = childNodes.length; i < ii; ++i) {
        var child = childNodes.item(i);
        var nodeType = child.nodeType;
/*
        if (oChild.nodeType === 4) {
          var value = oChild.nodeValue;
          if (value)
            children.push(value); // nodeType is "CDATASection" (4)
        } else 
*/
        if (nodeType === 3) {
          var value = child.nodeValue.trim();
          if (value)
            children.push(value); // nodeType is "Text" (3)
        } else if (nodeType === 1) {
          /*&& !oChild.prefix &&*/
          var childNodeName = child.nodeName.toLowerCase();
          if (!(childNodeName in ignoreTags) && 
              !child.classList.contains("replaystatus")) {
            // nodeType is "Element" (1)
            var child = createObjTree(child, childNodeName); 
            children.push(child);
          }
        }
      }
    }    

    // possible failure due to cross-domain browser restrictions
    if (nodeName != "iframe") {
      var propList = returnVal.prop;
      for (var prop in node) {
        try {
          var firstChar = prop.charCodeAt(0);
          if (firstChar >= 65 && firstChar <= 90)
            continue;

          val = node[prop]
          var type = typeof val;
          if (type == 'string' || type == 'number' || type == 'boolean') {
            propList[prop] = val;
          }
        } catch(e) {
          // do nothing
        }
      }
    }
    return returnVal;
  }
  
  function descendToBody(node){
    var nodeName = node.nodeName.toLowerCase();
    if (nodeName == "body"){
      var objTree = createObjTree(node, nodeName);
      //console.log(objTree);
      return objTree;
    }

    if (node.hasChildNodes()) {
      var childNodes = node.childNodes;
      for (var i = 0, ii = childNodes.length; i < ii; ++i) {
        var child = childNodes.item(i);
        var ret = descendToBody(child);
        if (ret)
          return ret;
      }
    }
    return null;
  }

/*  
  function ignoreTag(oNode){
    return _.contains(ignoreTags,oNode.nodeName.toLowerCase());
  }
  
  function ignoreClass(oNode){
    var lowerCaseClassList = _.map(oNode.classList,function(div){return div.toLowerCase();});
    return _.reduce(ignoreClasses, function(acc,div){return acc || _.contains(lowerCaseClassList,div);},false);
  }
*/  
  snapshotDom = descendToBody;
})();

