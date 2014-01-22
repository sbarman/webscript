/* -*- Mode: Java; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* vim: set shiftwidth=2 tabstop=2 autoindent cindent expandtab: */

'use strict';

// handles user interface
var Panel = (function PanelClosure() {
  function Panel(controller) {
    this.controller = controller;

    this.setup();
    this.loadParams();
    this.attachHandlers(controller);
    this.resize();

    var panel = this;
    controller.addListener(function(msg) {
      panel.controllerUpdate(msg);
    });
  }

  Panel.prototype = {
    controllerUpdate: function _controllerUpdate(msg) {
      if ('event' in msg) {
        this.addEvent(msg.event);
      } else if ('status' in msg) {
        this.updateStatus(msg.status);
      } else if ('reset' in msg) {
        this.clearEvents();
      } else if ('simulate' in msg) {
        this.scroll(msg.simulate);
      } else {
        throw 'unknown controller update';
      }
    },
    setup: function _setup() {
      $('#accordion').accordion({
        header: 'h3',
        animate: 100,
        heightStyle: 'fill'}
      );
    },
    attachHandlers: function _attachHandlers(controller) {
      $('#start').click(function(eventObject) {
        controller.start();
      });

      $('#stop').click(function(eventObject) {
        controller.stop();
      });

      $('#reset').click(function(eventObject) {
        controller.reset();
      });

      $('#capture').click(function(eventObject) {
        controller.capture();
      });

      $('#replay').click(function(eventObject) {
        controller.replayRecording();
      });

      $('#pause').click(function(eventObject) {
        controller.pause();
      });

      $('#restart').click(function(eventObject) {
        controller.restart();
      });

      $('#skip').click(function(eventObject) {
        controller.skip();
      });

      $('#resend').click(function(eventObject) {
        controller.resend();
      });

      $('#replayOne').click(function(eventObject) {
        controller.replayOne();
      });

      /*
      $('#paramsDiv').hide(1000);

      $('#paramsHide').click(function(eventObject) {
        $('#paramsDiv').toggle(1000);
      });
      */

      $('#save').click(function(eventObject) {
        var name = $('#scriptname').prop('value');
        controller.saveScript(name);
      });

      $('#load').click(function(eventObject) {
        var name = $('#scriptname').prop('value');
        controller.getScript(name);
      });

      var panel = this;
      // when the form is submitted, the parameters should be dispatched to the
      // content scripts so that everything is kept in sync
      $('#params').change(function(eventObject) {
        panel.updateParams();
        return false;
      });
    },
    loadParams: function _loadParams() {
      // create a form based on parameters
      var loadParamForm = function(node, paramObject, prefix) {
        for (var param in paramObject) {
          var paramValue = paramObject[param];
          var paramType = typeof paramValue;
          var name = prefix + '.' + param;

          if (paramType == 'number') {
            var input = $('<input/>', {type: 'text', name: name})
            input.prop('value', paramValue);
            var newDiv = $('<div/>', {text: param});
            newDiv.append(input);
            node.append(newDiv);
          } else if (paramType == 'boolean') {
            var input = $('<input/>', {type: 'checkbox', name: name});
            input.prop('checked', paramValue);
            var newDiv = $('<div/>', {text: param});
            newDiv.append(input);
            node.append(newDiv);
          } else if (paramType == 'object') {
            var newDiv = $('<div/>', {class: 'boxed'});
            var title = $('<div/>', {text: param});
            newDiv.append(title);
            loadParamForm(newDiv, paramValue, name);
            node.append(newDiv);
          }
        }
      };

      var form = $('#params');
      loadParamForm(form, params, 'params');
    },
    updateParams: function _updateParams() {
      var obj = {};
      var inputs = $('#params').prop('elements');
      for (var i = 0, ii = inputs.length; i < ii; ++i) {
        var input = inputs[i];

        var val;
        if (input.type == 'checkbox') {
          val = input.checked;
        } else if (input.type == 'text') {
          val = parseInt(input.value);
        } else {
          continue;
        }
        var names = input.name.split('.');

        var cur = params;
        for (var j = 1, jj = names.length - 1; j < jj; ++j) {
          var key = names[j];
          if (!(key in cur)) {
            cur[key] = {};
          }
          cur = cur[key];
        }
        cur[names[names.length - 1]] = val;
      }
      this.controller.updateParams();
    },
    addEvent: function _addEvent(eventRecord) {
      var eventInfo = eventRecord.msg.value;
      var id = eventRecord.id;
      var tab = eventRecord.tab;
      var topURL = eventRecord.topURL;
      var portName = eventRecord.port;
      var topFrame = eventRecord.topFrame;
      var iframeIndex = eventRecord.iframeIndex;
      var waitTime = eventRecord.waitTime;


      var newDiv = $('<div/>', {class: 'event wordwrap', id: id});

      var text = '<b>[' + id + ']type:' + '</b>' + eventInfo.type +
                 '<br/>' +
                 '<b>tab:' + '</b>' + tab + '<br/>' +
                 '<b>topURL:' + '</b>' + topURL + '<br/>' +
                 '<b>port:' + '</b>' + portName + '<br/>' +
                 '<b>topFrame:' + '</b>' + topFrame + '<br/>' +
                 '<b>iframeIndex:' + '</b>' + iframeIndex + '<br/>' +
                 '<b>waitTime:' + '</b>' + waitTime + '<br/>';

      for (var prop in eventInfo) {
        if (prop != 'type') {
          text += '<b>' + prop + ':' + '</b>' + "<span class='editable'>" + 
              eventInfo[prop] + '</span>' + '<br/>';
        }
      }
      newDiv.append(text);
      $('#events').append(newDiv);

      newDiv.children('span.editable').editable('http://www.example.com/save.php', { 
        type      : 'textarea',
        cancel    : 'Cancel',
        submit    : 'OK',
        indicator : '<img src="img/indicator.gif">',
        tooltip   : 'Click to edit...'
      });
    },
    addMessage: function _addMessage(message) {
      var newDiv = $('<div/>', {class: 'message wordwrap'});
      newDiv.text(message);
      $('#messages').prepend(newDiv);
    },
    clearEvents: function _clearEvents() {
      $('#events').empty();
    },
    updateStatus: function _updateStatus(status) {
      $('#status').text(status);
    },
    scroll: function _scroll(id) {
      $('#' + id).get(0).scrollIntoView();
    },
    resize: function _resize() {
      $('#accordion').accordion('refresh');
    }
  };

  return Panel;
})();
