/* -*- Mode: Java; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* vim: set shiftwidth=2 tabstop=2 autoindent cindent expandtab: */

'use strict';

var snapshot = null;
var snapshotNode = null;

(function() {
  var ignoreTags = {'script': true, 'style': true};

  function cloneNode(node, nodeName, xpath) {

    var returnVal = {children: [], prop: {}, type: 'DOM'};
    returnVal.prop['nodeName'] = nodeName;
    returnVal.prop['xpath'] = xpath;

    // possible failure due to cross-domain browser restrictions
    if (nodeName != 'iframe') {
      var propList = returnVal.prop;
      for (var prop in node) {
        try {
          var firstChar = prop.charCodeAt(0);
          if (firstChar >= 65 && firstChar <= 90) {
            continue;
          }
          var val = node[prop];
          var type = typeof val;
          if (type == 'string' || type == 'number' || type == 'boolean') {
            propList[prop] = val;
          }
        } catch (e) {
          // do nothing
        }
      }
    }
    return returnVal;
  }

  function cloneSubtree(node, nodeName, xpath) {
    var returnVal = cloneNode(node, nodeName, xpath);

    if (node.hasChildNodes()) {
      var childNodes = node.childNodes;
      var children = returnVal.children;

      var childrenTags = {};
      for (var i = 0, ii = childNodes.length; i < ii; ++i) {
        var child = childNodes.item(i);
        var nodeType = child.nodeType;

        //let's track the number of tags of this kind we've seen in the
        //children so far, to build the xpath
        var childNodeName = child.nodeName.toLowerCase();
        if (!(childNodeName in childrenTags))
          childrenTags[childNodeName] = 1;
        else
          childrenTags[childNodeName] += 1;

        if (nodeType === 3) { // nodeType is "Text" (3)
          var value = child.nodeValue.trim();
          if (value)
            children.push({text: value, type: 'text'});
        } else if (nodeType === 1) { // nodeType is "Element" (1)
          if (!(childNodeName in ignoreTags) &&
              !child.classList.contains('replayStatus')) {

            var newPath = xpath + '/' + childNodeName + '[' +
                          childrenTags[childNodeName] + ']';
            var child = cloneSubtree(child, childNodeName, newPath);
            children.push(child);
          }
        }
      }
    }

    return returnVal;
  }

  function descendToBody(node) {
    var nodeName = node.nodeName.toLowerCase();
    if (nodeName == 'body') {
      var objTree = cloneSubtree(node, nodeName, 'html/body[1]');
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

  snapshot = function() {
    return descendToBody(document);
  };

  snapshotNode = function(node) {
    if (!node)
      return null;

    var objTree = cloneNode(node, node.nodeName, nodeToXPath(node));
    return objTree;
  };

})();
