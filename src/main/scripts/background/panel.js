/* -*- Mode: Java; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* vim: set shiftwidth=2 tabstop=2 autoindent cindent expandtab: */

'use strict';

/* User interface */
var Panel = (function PanelClosure() {
  function Panel(controller) {
    this.controller = controller;

    this.setup();
    this.loadParams();
    this.attachHandlers(controller);
    this.resize();

    this.events = [];
    this.selectStart = null;
    this.selectEvents = null;

    var panel = this;
    controller.addListener(function(msg) {
      panel.controllerUpdate(msg);
    });

    /* window is closed so tell the content scripts to stop recording and reset
     * the extension icon */
    $(window).unload(function() {
      controller.stop();
      chrome.browserAction.setBadgeText({text: ''});
      chrome.runtime.onMessage.removeListener(handleMessage);
    });
    
    var panel = this;
    $(window).resize(function() {
      panel.resize();
    });
  }

  Panel.prototype = {
    controllerUpdate: function _controllerUpdate(msg) {
      var type = msg.type;
      var value = msg.value;

      switch (type) {
        case 'event':
          this.addEvent(value.event, value.index);
          break;
        case 'status':
          this.addMessage('Status: ' + value);
          break;
        case 'reset':
          this.clearEvents();
          break;
        case 'simulate':
          this.scroll(value);
          break;
        case 'captureText':
          this.addMessage('Capture: ' + value);
          break;
        case 'message':
          this.addMessage(value);
          break;
        case 'clearMessages':
          this.clearMessages();
          break;
        default:
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
      var panel = this;

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

      $('#loop').click(function(eventObject) {
        controller.loop(panel.selectEvents);
      });

      $('#next').click(function(eventObject) {
        controller.next(panel.selectEvents);
      });

      $('#clearcookie').click(function(eventObject) {
        controller.clearCookie(panel.selectEvents);
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
        if (e.which == 13 && !e.shiftKey) {
          var target = $(e.target);
          var val = target.val();
          target.val('');
          e.preventDefault();

          panel.answer(val);
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
            var input = $('<input/>', {type: 'text', name: name});
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
    updateSelectedEvents: function _updateSelectedEvents(e) {
      var target = e.target;
      while (target.className.indexOf('event') < 0) {
        target = target.parentElement;
      }

      var selectStart = this.selectStart;
      var selectEvents = this.selectEvents;

      if (!e.shiftKey) {
        this.selectStart = target.id;
        this.selectEvents = [target.id];
      } else {
        var selectEnd = target.id;
        if (selectStart && selectStart != selectEnd) {

          var events = this.events;
          var selectEvents = [];
          var foundStart = false;

          for (var i = 0, ii = events.length; i < ii; ++i) {
            var id = events[i].meta.id;
            if (id == selectStart || id == selectEnd) {
              if (!foundStart) {
                foundStart = true;
              } else {
                selectEvents.push(id);
                break;
              }
            }

            if (foundStart)
              selectEvents.push(id);
          }
          this.selectEvents = selectEvents;
        }
      }

      var selectEvents = this.selectEvents;
      $('.event').removeClass('selected');
      $('.event').filter(function(index) {
        return selectEvents.indexOf(this.id) >= 0;
      }).addClass('selected');
    },
    addEvent: function _addEvent(eventInfo, index) {
      var events = this.events;
      if (typeof index != 'number')
        index = events.length;

      events.splice(index, 0, eventInfo);

      var id = eventInfo.meta.id;
      var type = eventInfo.type;

      if (!params.panel.enableRequest && 
          (type == 'completed' || type == 'start'))
        return;

      var eventDiv = $('<div/>', {class: 'event wordwrap', id: id});

      if (index + 1 < events.length) {
        var postEventId = events[index + 1].meta.id;
        $('#'+ postEventId).before(eventDiv);
      } else {
        $('#events').append(eventDiv);
      }
 
      var panel = this;
      // do this in a timeout so it doesn't block the main thread
      setTimeout(function() {
        var title = $('<div><b>[' + id + ']type:' + '</b>' + type + '</div>');
        title.click(function(e) {
          panel.updateSelectedEvents(e);
        });
        eventDiv.append(title);


        function addInfo(field, value) {
          eventDiv.append('<b>' + field + ':</b>' + value + '<br/>');
        }

        if (type == 'dom') {
          addInfo('type', eventInfo.data.type);
          addInfo('xpath', eventInfo.target.xpath);
          addInfo('URL' ,eventInfo.frame.URL);
          addInfo('port', eventInfo.frame.port);
        } else if (type == 'capture') {
          addInfo('xpath', eventInfo.target.xpath);
          addInfo('URL' ,eventInfo.frame.URL);
          addInfo('port', eventInfo.frame.port);
        }

        function toggle(e) {
          $(e.target).next().toggle(300);
        };

        function createMenu(obj, idPrefix) {
          var topDiv = $('<div/>');
          for (var key in obj) {
            var val = obj[key];
            if (typeof val == 'object'/* && key != 'snapshot'*/) {
              var catDiv = $('<div/>');
              var title = $('<div/>', {class: 'catTitle'});
              title.text(key);
              title.click(toggle);
              var menu = createMenu(val, idPrefix + '.' + key);

              catDiv.append(title);
              catDiv.append(menu);
              menu.hide();
              menu.addClass('catMenu');
              topDiv.append(catDiv);
            } else {
              var propDiv = $('<div/>');
              propDiv.append('<b>' + key + ':' + '</b>');
              var valSpan = $('<span/>',
                              {class: 'editable', id: idPrefix + '.' + key});
              valSpan.text(val);
              propDiv.append(valSpan);
              propDiv.append('<br/>');
              topDiv.append(propDiv);
            }
          }
          return topDiv;
        }

        if (params.panel.enableEdit) {
          eventDiv.append(createMenu(eventInfo, id));

          var controller = this.controller;
          var edited = function(value, settings) {
            var id = this.id;
            var parts = id.split('.');
            var event = parts[0];
            var field = parts.slice(1).join('.');
            controller.userUpdate(event, field, value);
            return value;
          };

          eventDiv.find('span.editable').editable(edited, {
            type: 'textarea',
            width: '100%',
            cancel: 'Cancel',
            submit: 'OK',
            tooltip: 'Click to edit...'
          });
        }
      }, 0);
    },
    addMessage: function _addMessage(message) {
      var newDiv = $('<div/>', {class: 'message wordwrap'});
      newDiv.text(message);
      $('#messages').prepend(newDiv);
    },
    clearMessages: function _clearMessages() {
      $('#messages').empty();
    },
    question: function _question(text, callback) {
      this.addMessage(text);
      this.questionCallback = callback;
    },
    answer: function _answer(val) {
      this.addMessage(val);

      var callback = this.questionCallback;
      if (callback) {
        this.questionCallback = null;
        callback(val);
      }
    },
    clearEvents: function _clearEvents() {
      $('#events').empty();
      this.events = [];
    },
    updateStatus: function _updateStatus(status) {
      $('#status').text(status);
    },
    scroll: function _scroll(id) {
      var div = $('#' + id);
      if (div.size() > 0)
        div.get(0).scrollIntoView();
    },
    resize: function _resize() {
      $('#accordion').accordion('refresh');
    }
  };

  return Panel;
})();

var panel = new Panel(controller);
user.setPanel(panel);
