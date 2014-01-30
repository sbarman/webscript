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
      $('#input').autosize();
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

      $('#input').keypress(function(e) {
        if(e.which == 13 && !e.shiftKey) {
          var target = $(e.target);
          var val = target.val();
          controller.submitInput(val);
          panel.addMessage(val);
          target.val("");
          e.preventDefault();
        }
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
      var eventInfo = eventRecord.value;
      var id = eventInfo.meta.id;
      var type = eventInfo.data.type;
      var xpath = eventInfo.data.target.xpath;
      var URL = eventInfo.frame.URL;
      var port = eventInfo.frame.port;

      var eventDiv = $('<div/>', {class: 'event wordwrap', id: id});
      eventDiv.append('<b>[' + id + ']type:' + '</b>' + type + '<br/>');
      eventDiv.append('<b>xpath:' + '</b>' + xpath + '<br/>');
      eventDiv.append('<b>URL:' + '</b>' + URL + '<br/>');
      eventDiv.append('<b>port:' + '</b>' + port + '<br/>');

      function toggle(e) {
        $(e.target).next().toggle(300);
      };

      for (var cat in eventInfo) {
        var props = eventInfo[cat];
        var catDiv = $('<div/>', {class: 'category'});

        var title = $('<div/>', {class: 'catTitle'})
        title.text(cat);
        catDiv.append(title);

        var propsDiv =  $('<div/>');
        for (var key in props) {
          var propDiv = $('<div/>');
          var text = '<b>' + key + ':' + '</b>' + "<span class='editable'>" + 
              props[key] + '</span>' + '<br/>';
          propDiv.append(text);
          propsDiv.append(propDiv);
        }
        catDiv.append(propsDiv);
        eventDiv.append(catDiv);
        propsDiv.hide();
        title.click(toggle);
      }
      $('#events').append(eventDiv);

      eventDiv.children('span.editable').editable('http://www.example.com/save.php', { 
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
