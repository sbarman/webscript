/* -*- Mode: Java; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* vim: set shiftwidth=2 tabstop=2 autoindent cindent expandtab: */

var ScriptServer = (function ScriptServerClosure() {
  var scriptLog = getLog('script');

  function ScriptServer(server) {
    this.server = server;
  }

  ScriptServer.prototype = {
    saveEvents: function _saveEvents(isScriptEvent, parentId, events,
                                     comments) {
      var server = this.server;
      var eventUrl = isScriptEvent ? server + 'event/' :
                                     server + 'replay_event/';

      function saveEvent(i) {
        if (i >= events.length) {
          scriptLog.log('Done saving');
          return;
        }

        // need to create new scope to variables don't get clobbered
        var postMsg = {};
        var evtMsg = {};

        var e = events[i];
        var msgValue = e.msg.value;
        evtMsg['dom_post_event_state'] = JSON.stringify(msgValue.snapshotAfter);
        evtMsg['dom_pre_event_state'] = JSON.stringify(msgValue.snapshotBefore);
        evtMsg['event_type'] = msgValue.type;
        evtMsg['execution_order'] = i;

        var parameters = [];
        prop: for (var prop in e) {
          if (prop == 'msg') {
            continue prop;
          }
          var propMsg = {};
          var val = e[prop];
          propMsg['name'] = '_' + prop;
          propMsg['value'] = JSON.stringify(val);
          propMsg['data_type'] = typeof val;
          parameters.push(propMsg);
        }

        msgprop: for (var prop in msgValue) {
          if (prop == 'snapshotBefore' || prop == 'snapshotAfter') {
            continue msgprop;
          }
          var propMsg = {};
          var val = msgValue[prop];
          propMsg['name'] = prop;
          propMsg['value'] = JSON.stringify(val);
          propMsg['data_type'] = typeof val;
          parameters.push(propMsg);
        }

        evtMsg['parameters'] = parameters;

        if (isScriptEvent) {
          postMsg['script_id'] = parentId;
        } else {
          postMsg['replay_id'] = parentId;
        }
        postMsg['events'] = [evtMsg];

        scriptLog.log('saving event:', postMsg);
        $.ajax({
          error: function(jqXHR, textStatus, errorThrown) {
            scriptLog.log('error saving event', jqXHR, textStatus, errorThrown);
          },
          success: function(data, textStatus, jqXHR) {
            scriptLog.log(data, jqXHR, textStatus);
            saveEvent(i + 1);
          },
          contentType: 'application/json',
          data: JSON.stringify(postMsg),
          dataType: 'json',
          processData: false,
          type: 'POST',
          url: eventUrl
        });
      }

      function saveComments() {
        if (!comments)
          return;

        var postMsg = {};
        var commentMsg = [];
        for (var i = 0, ii = comments.length; i < ii; ++i) {
          var comment = comments[i];
          if (isScriptEvent) {
            comment['script_id'] = parentId;
          } else {
            comment['replay_id'] = parentId;
          }
          commentMsg.push(comment);
        }

        postMsg['comments'] = commentMsg;
        scriptLog.log('saving comments:', postMsg);
        $.ajax({
          error: function(jqXHR, textStatus, errorThrown) {
            scriptLog.log('error comments', jqXHR, textStatus, errorThrown);
          },
          success: function(data, textStatus, jqXHR) {
            scriptLog.log(data, jqXHR, textStatus);
          },
          contentType: 'application/json',
          data: JSON.stringify(postMsg),
          dataType: 'json',
          processData: false,
          type: 'POST',
          url: server + 'comment/'
        });
      }

      saveEvent(0);
      saveComments();
    },
    saveReplay: function _saveReplay(events, comments, origScriptId) {
      if (events.length == 0)
        return;

      var scriptServer = this;
      var server = this.server;
      var postMsg = {};
      postMsg['script_id'] = origScriptId;
      postMsg['user'] = {username: params.user};
      postMsg['events'] = [];
      scriptLog.log('saving replay:', postMsg);

      var req = $.ajax({
        error: function(jqXHR, textStatus, errorThrown) {
          scriptLog.log('error saving replay:', jqXHR, textStatus, errorThrown);
        },
        success: function(data, textStatus, jqXHR) {
          scriptLog.log(data, jqXHR, textStatus);

          var replayId = data.id;
          scriptServer.saveEvents(false, replayId, events, comments);
        },
        contentType: 'application/json',
        data: JSON.stringify(postMsg),
        dataType: 'json',
        processData: false,
        type: 'POST',
        url: server + 'replay/'
      });
      scriptLog.log(req);
    },
    saveScript: function _saveScript(name, events, comments) {
      if (events.length == 0)
        return;

      var scriptServer = this;
      var server = this.server;
      var postMsg = {};
      postMsg['name'] = name;
      postMsg['user'] = {username: params.user};
      postMsg['events'] = [];
      scriptLog.log('saving script:', postMsg);

      var req = $.ajax({
        error: function(jqXHR, textStatus, errorThrown) {
          scriptLog.log('error saving script', jqXHR, textStatus, errorThrown);
        },
        success: function(data, textStatus, jqXHR) {
          scriptLog.log(data, jqXHR, textStatus);

          var scriptId = data.id;
          scriptServer.saveEvents(true, scriptId, events, comments);
        },
        contentType: 'application/json',
        data: JSON.stringify(postMsg),
        dataType: 'json',
        processData: false,
        type: 'POST',
        url: server + 'script/'
      });
      scriptLog.log(req);
    },
    getEvents: function _getEvents(eventIds, cont) {
      var events = null;
      var server = this.server;

      function getEvent(i, retrievedEvents) {
        if (i >= eventIds.length) {
          scriptLog.log('Done getting');
          cont(retrievedEvents);
          return;
        }

        $.ajax({
          error: function(jqXHR, textStatus, errorThrown) {
            scriptLog.log(jqXHR, textStatus, errorThrown);
            cont(retrievedEvents);
          },
          success: function(data, textStatus, jqXHR) {
            scriptLog.log(data, textStatus, jqXHR);
            var e = data;
            retrievedEvents.push(e);
            getEvent(i + 1, retrievedEvents);
          },
          url: server + 'event/' + eventIds[i].id + '/?format=json',
          type: 'GET',
          processData: false,
          accepts: 'application/json',
          dataType: 'json'
        });
      }

      getEvent(0, []);
    },
    getScript: function _getScript(name, cont) {
      var scriptServer = this;
      var server = this.server;

      $.ajax({
        error: function(jqXHR, textStatus, errorThrown) {
          scriptLog.log(jqXHR, textStatus, errorThrown);
        },
        success: function(data, textStatus, jqXHR) {
          scriptLog.log(data, textStatus, jqXHR);
          var scripts = data;
          if (scripts.length != 0) {
            var script = scripts[0];
            for (var i = 0, ii = scripts.length; i < ii; ++i) {
              var s = scripts[i];
              if (parseInt(script.id) < parseInt(s.id)) {
                script = s;
              }
            }
            var events = [];
            scriptServer.getEvents(script.events, function(scriptEvents) {
              var serverEvents = scriptEvents.sort(function(a, b) {
                return a.execution_order - b.execution_order;
              });

              for (var i = 0, ii = serverEvents.length; i < ii; ++i) {
                var e = serverEvents[i];
                var serverParams = e.parameters;
                var event = {};
                event.msg = {type: 'event', value: {}};

                var msgValue = event.msg.value;
                msgValue.snapshotBefore = JSON.parse(e.dom_pre_event_state);
                msgValue.snapshotAfter = JSON.parse(e.dom_post_event_state);

                for (var j = 0, jj = serverParams.length; j < jj; ++j) {
                  var p = serverParams[j];
                  if (p.name.charAt(0) == '_') {
                    event[p.name.slice(1)] = JSON.parse(p.value);
                  } else {
                    msgValue[p.name] = JSON.parse(p.value);
                  }
                }
                events.push(event);
              }
              cont(script.id, events);
            });
          }
        },
        url: server + 'script/' + name + '/?format=json',
        type: 'GET',
        processData: false,
        accepts: 'application/json',
        dataType: 'json'
      });
      return [];
    }
  };

  return ScriptServer;
})();

