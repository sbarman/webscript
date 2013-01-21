/* -*- Mode: Java; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* vim: set shiftwidth=2 tabstop=2 autoindent cindent expandtab: */

'use strict';

var snapshotDom = null;
var snapshot = null;
 
(function() {
  var ignoreTags = {"script": true, "style": true};

  function createObjTree(node, nodeName, xpath) {
    var returnVal = {children: [], prop: {}};
    returnVal.prop["nodeName"] = nodeName;
    returnVal.prop["xpath"] = xpath;

    if (node.hasChildNodes()) {
      var childNodes = node.childNodes
      var children = returnVal.children;

      var childrenTags = {};
      for (var i = 0, ii = childNodes.length; i < ii; ++i) {
        var child = childNodes.item(i);
        var nodeType = child.nodeType;
        
        //let's track the number of tags of this kind we've seen in the
        //children so far, to build the xpath
        var childNodeName = child.nodeName.toLowerCase();
        if(!(childNodeName in childrenTags)){
          childrenTags[childNodeName]=1;
        }
        else{
          childrenTags[childNodeName]+=1;
        }
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
          if (!(childNodeName in ignoreTags) && 
              !child.classList.contains("replayStatus")) {
            // nodeType is "Element" (1)
            var newPath = xpath+"/"+childNodeName+"["+childrenTags[childNodeName]+"]";
            var child = createObjTree(child, childNodeName, newPath); 
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
          if (firstChar >= 65 && firstChar <= 90){
            continue;
          }
          var val = node[prop];
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
      var objTree = createObjTree(node, nodeName,"html/body[1]");
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

  snapshotDom = descendToBody;
  snapshot = function() {
    return snapshotDom(document);
  };

})();

