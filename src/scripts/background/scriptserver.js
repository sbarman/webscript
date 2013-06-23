/* -*- Mode: Java; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* vim: set shiftwidth=2 tabstop=2 autoindent cindent expandtab: */

var ScriptServer = (function ScriptServerClosure() {
  var scriptLog = getLog('script');

  function ScriptServer(server) {
    this.server = server;
  }

  ScriptServer.prototype = {
    saveEvents: function _saveEvents(scriptId, events) {
      var server = this.server;

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
          var propMsg = {};
          var val = msgValue[prop];
          propMsg['name'] = prop;
          propMsg['value'] = JSON.stringify(val);
          propMsg['data_type'] = typeof val;
          parameters.push(propMsg);
        }
        evtMsg['parameters'] = parameters;

        postMsg['script_id'] = scriptId;
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
          url: server + 'event/'
        });
      }
      saveEvent(0);
    },
    saveComments: function _saveComments(scriptId, comments) {
      var server = this.server;

      if (!comments)
        return;

      var postMsg = {};
      var commentMsg = [];
      for (var i = 0, ii = comments.length; i < ii; ++i) {
        var comment = comments[i];
        comment['script_id'] = scriptId;
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
    },
    saveParams: function _saveParams(scriptId, params) {
      var server = this.server;

      function convertParams(param, prefix) {
        prefix = prefix || '';
        var list = [];

        for (var p in param) {
          var v = param[p];
          if (typeof v == 'object')
            list = list.concat(convertParams(v, prefix + p + '.'));
          else
            list.push({name: prefix + p, value: v});
        }
        return list;
      }

      var listParams = convertParams(params);

      var postMsg = {};

      postMsg['params'] = listParams;
      postMsg['script_id'] = scriptId;

      scriptLog.log('saving params:', postMsg);
      $.ajax({
        error: function(jqXHR, textStatus, errorThrown) {
          scriptLog.log('error params', jqXHR, textStatus, errorThrown);
        },
        success: function(data, textStatus, jqXHR) {
          scriptLog.log(data, jqXHR, textStatus);
        },
        contentType: 'application/json',
        data: JSON.stringify(postMsg),
        dataType: 'json',
        processData: false,
        type: 'POST',
        url: server + 'script_param/'
      });
    },
    saveScript: function _saveScript(name, events, comments, params, parentId) {
      if (events.length == 0)
        return;

      // make a copy of the array
      events = events.slice(0);
      comments = comments.slice(0);

      var scriptServer = this;
      var server = this.server;
      var postMsg = {};
      postMsg['name'] = name;
      postMsg['user'] = {username: params.user};
      postMsg['events'] = [];

      if (typeof parentId == 'number') {
        postMsg['parent_id'] = parentId;
      }

      scriptLog.log('saving script:', postMsg);

      var req = $.ajax({
        error: function(jqXHR, textStatus, errorThrown) {
          scriptLog.log('error saving script', jqXHR, textStatus, errorThrown);
        },
        success: function(data, textStatus, jqXHR) {
          scriptLog.log(data, jqXHR, textStatus);

          var scriptId = data.id;
          scriptServer.saveEvents(scriptId, events);
          scriptServer.saveComments(scriptId, comments);
          scriptServer.saveParams(scriptId, params);
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
      return null;
    },
    getComments: function _getComments(scriptId, cont) {
      var server = this.server;

      function getComments() {
        $.ajax({
          error: function(jqXHR, textStatus, errorThrown) {
            scriptLog.log(jqXHR, textStatus, errorThrown);
            cont(null);
          },
          success: function(data, textStatus, jqXHR) {
            scriptLog.log(data, textStatus, jqXHR);
            cont(data);
          },
          url: server + 'script_comments/' + scriptId + '/?format=json',
          type: 'GET',
          processData: false,
          accepts: 'application/json',
          dataType: 'json'
        });
      }

      getComments();
      return null;
    },
    getScript: function _getScript(name, convert, cont) {
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

            scriptServer.getComments(script.id, function(comments) {
              scriptServer.getEvents(script.events, function(scriptEvents) {
                var serverEvents = scriptEvents.sort(function(a, b) {
                  return a.execution_order - b.execution_order;
                });

                if (!convert) {
                  cont(script.id, serverEvents, comments);
                  return;
                }

                var events = [];
                for (var i = 0, ii = serverEvents.length; i < ii; ++i) {
                  var e = serverEvents[i];
                  var serverParams = e.parameters;
                  var event = {};
                  event.msg = {type: 'event', value: {}};

                  var msgValue = event.msg.value;

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
                cont(script.id, events, comments);
              });
            });
          }
        },
        url: server + 'script/' + name + '/?format=json',
        type: 'GET',
        processData: false,
        accepts: 'application/json',
        dataType: 'json'
      });
      return null;
    },
    getBenchmarks: function _getBenchmarks(cont) {
      var scriptServer = this;
      var server = this.server;

      $.ajax({
        error: function(jqXHR, textStatus, errorThrown) {
          scriptLog.log(jqXHR, textStatus, errorThrown);
        },
        success: function(data, textStatus, jqXHR) {
          scriptLog.log(data, textStatus, jqXHR);
          var benchmarks = data;
          cont(benchmarks);
        },
        url: server + 'benchmark/?format=json',
        type: 'GET',
        processData: false,
        accepts: 'application/json',
        dataType: 'json'
      });
      return null;
    },
    saveBenchmarkRun: function _saveBenchmarkRun(benchmarkRun) {
      var scriptServer = this;
      var server = this.server;

      var postMsg = {};
      postMsg['benchmark'] = benchmarkRun.benchmark.id;
      postMsg['successful'] = benchmarkRun.successful;
      postMsg['events_executed'] = benchmarkRun.events_executed;
      
      if (benchmarkRun.errors)
        postMsg['errror'] = benchmarkRun.errors;

      $.ajax({
        error: function(jqXHR, textStatus, errorThrown) {
          scriptLog.log(jqXHR, textStatus, errorThrown);
        },
        success: function(data, textStatus, jqXHR) {
          scriptLog.log(data, textStatus, jqXHR);
        },
        contentType: 'application/json',
        data: JSON.stringify(postMsg),
        dataType: 'json',
        processData: false,
        type: 'POST',
        url: server + 'benchmark_run/',
      });
      return null;
    },
    saveCapture: function _saveCapture(capture, scriptId) {
      var scriptServer = this;
      var server = this.server;

      var postMsg = {};
      postMsg['script'] = scriptId;
      postMsg['innerHtml'] = capture.innerHtml;
      postMsg['nodeName'] = capture.nodeName;
      
      $.ajax({
        error: function(jqXHR, textStatus, errorThrown) {
          scriptLog.log(jqXHR, textStatus, errorThrown);
        },
        success: function(data, textStatus, jqXHR) {
          scriptLog.log(data, textStatus, jqXHR);
        },
        contentType: 'application/json',
        data: JSON.stringify(postMsg),
        dataType: 'json',
        processData: false,
        type: 'POST',
        url: server + 'capture/',
      });
      return null;
    },
    getCapture: function _getCapture(scriptId, cont) {
      var scriptServer = this;
      var server = this.server;

      $.ajax({
        error: function(jqXHR, textStatus, errorThrown) {
          scriptLog.log(jqXHR, textStatus, errorThrown);
        },
        success: function(data, textStatus, jqXHR) {
          scriptLog.log(data, textStatus, jqXHR);
          var capture = data;
          cont(capture);
        },
        url: server + 'capture/' + scriptId + '/?format=json',
        type: 'GET',
        processData: false,
        accepts: 'application/json',
        dataType: 'json'
      });
      return null;
    },
  };

  return ScriptServer;
})();

