/* -*- Mode: Java; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* vim: set shiftwidth=2 tabstop=2 autoindent cindent expandtab: */

'use strict';

/* This is probably horribly broken */
var ScriptServer = (function ScriptServerClosure() {
  var scriptLog = getLog('script');

  function ScriptServer(server) {
    this.server = server;
    this.queue = [];
    this.processing = false;
    this.callbacks = [];
    this.timeout = 50;
  }

  ScriptServer.prototype = {
    process: function _process() {
      if (this.processing)
        return;


      var queue = this.queue;
      if (queue.length > 0) {
        var item = queue.shift();
        var retries = item.retries;
        if (retries && retries > 3) {
          scriptLog.error('Cannot reach server');
          throw "Cannot reach server";
        }

        var scriptServer = this;
        var type = item.type;

        var finish = function _finish() {
          scriptServer.processing = false;
          scriptServer.process();
        }
      
        this.processing = true;

        switch (type) {
          case "event":
            setTimeout(function() {
              scriptServer.processEvent(item, finish);
            }, this.timeout);
            break;
          case "script":
            setTimeout(function() {
              scriptServer.processScript(item, finish);
            }, this.timeout);
            break;
          case "benchmark":
            setTimeout(function() {
              scriptServer.processBenchmark(item, finish);
            }, this.timeout);
            break;
          case "benchmarkrun":
            setTimeout(function() {
              scriptServer.processBenchmarkRun(item, finish);
            }, this.timeout);
            break;
          default:
            scriptLog.debug('Found unknown type:', type);
        }
      } else {
        scriptLog.debug('Finished processing queue');
        this.callbacks.forEach(function(c) {
          setTimeout(c, 0);
        });
        this.callbacks = [];
      }
    },
    finishedProcessing: function _finishedProcessing(callback) {
      if (this.processing || this.queue.length > 0)
        this.callbacks.push(callback);
      else
        setTimeout(callback, 0);
    },
    retry: function _retry(item) {
      if ('retries' in item) {
        item.retries++;
      } else {
        item.retries = 1;
      }

      this.timeout *= 2;

      this.queue.splice(0, 0, item);
    },
    saveScript: function _saveScript(name, events, parentId, params, captures, 
        notes) {
      this.queue.push({
        type: 'script',
        name: name,
        // make a copy of the array
        events: events.slice(0),
        parentId: parentId,
        params: $.extend({}, params),
        captures: $.extend({}, captures),
        notes: notes
      });
      this.process();
    },
    saveEvents: function _saveEvents(scriptId, events) {
      for (var i = 0, ii = events.length; i < ii; ++i) {
        this.queue.push({
          type: 'event',
          event: events[i],
          index: i,
          scriptId: scriptId
        });
      }
    },
    saveBenchmark: function _saveEvents(name, scriptId, captures, enabled,
        callback) {
      this.queue.push({
        type: 'benchmark',
        name: name,
        scriptId: scriptId,
        successCaptures: captures,
        enabled: enabled,
        callback: callback
      });
      this.process();
    },
    saveBenchmarkRun: function _saveBenchmarkRun(benchmarkId, successful, 
        eventsExecuted, eventsTotal, time, captures, triggerTimeouts,
        elementTimeouts, version) {
      this.queue.push({
        type: 'benchmarkrun',
        id: benchmarkId,
        successful: successful,
        eventsExecuted: eventsExecuted,
        eventsTotal: eventsTotal,
        time: time,
        captures: captures,
        triggerTimeouts: triggerTimeouts,
        elementTimeouts: elementTimeouts,
        version: version
      });
      this.process();
    },
    processScript: function _processScript(item, callback) {
      var name = item.name;
      var events = item.events;
      var parentId = item.parentId;
      var notes = item.notes;
      var params = item.params;
      var captures = item.captures;

      var scriptServer = this;
      var server = this.server;
      var postMsg = {};
      postMsg['name'] = name;
      postMsg['user'] = {username: window.params.server.user};
      postMsg['events'] = [];
      postMsg['params'] = params;
      postMsg['captures'] = captures;

      if (typeof parentId == 'number') {
        postMsg['parent_id'] = parentId;
      }

      if (typeof notes == 'string') {
        postMsg['notes'] = notes;
      } if (notes && typeof notes == 'object') {
        postMsg['notes'] = JSON.stringify(notes, null, 2);
      }


      scriptLog.log('Saving script:', postMsg);

      var scriptServer = this;
      var req = $.ajax({
        error: function(jqXHR, textStatus, errorThrown) {
          scriptLog.warn('Error saving script', jqXHR, textStatus, errorThrown);
          scriptServer.retry(item);
        },
        success: function(data, textStatus, jqXHR) {
          scriptLog.log('Saved script:', data, jqXHR, textStatus);

          var scriptId = data.id;
          scriptServer.saveEvents(scriptId, events);
        },
        complete: function(jqXHR, textSataus) {
          callback();
        },
        contentType: 'application/json',
        data: JSON.stringify(postMsg),
        dataType: 'json',
        processData: false,
        type: 'POST',
        timeout: 15000,
        url: this.server + 'script/'
      });
      scriptLog.log(req);
    },
    processEvent: function _saveEvent(item, callback) {
      this.processing = true;

      var e = item.event;
      var i = item.index;
      var scriptId = item.scriptId;

      // need to create new scope to variables don't get clobbered
      var postMsg = {};
      var evtMsg = {};

      evtMsg['event_type'] = e.type;
      evtMsg['execution_order'] = i;

      var parameters = [];

      for (var prop in e) {
        var propMsg = {};
        var val = e[prop];
        propMsg['name'] = prop;
        propMsg['value'] = JSON.stringify(val);
        propMsg['data_type'] = typeof val;
        parameters.push(propMsg);
      }
      evtMsg['parameters'] = parameters;

      postMsg['script_id'] = scriptId;
      postMsg['events'] = [evtMsg];

      scriptLog.log('Saving event:', postMsg);
      var scriptServer = this;
      $.ajax({
        error: function(jqXHR, textStatus, errorThrown) {
          scriptLog.warn('Error saving event', jqXHR, textStatus, errorThrown);
          scriptServer.retry(item);
        },
        success: function(data, textStatus, jqXHR) {
          scriptLog.log(data, jqXHR, textStatus);
        },
        complete: function(jqXHR, textSataus) {
          callback();
        },
        contentType: 'application/json',
        data: JSON.stringify(postMsg),
        dataType: 'json',
        processData: false,
        type: 'POST',
        timeout: 15000,
        url: this.server + 'event/'
      });
    },
    processBenchmark: function _processBenchmark(item, callback) {
      this.processing = true;

      var postMsg = {};
      postMsg['script'] = item.scriptId;
      postMsg['success_captures'] = JSON.stringify(item.successCaptures);
      postMsg['enabled'] = item.enabled;
      postMsg['name'] = item.name;

      scriptLog.log('Saving benchmark:', postMsg);
      var scriptServer = this;
      $.ajax({
        error: function(jqXHR, textStatus, errorThrown) {
          scriptLog.warn('Error saving event', jqXHR, textStatus, errorThrown);
          scriptServer.retry(item);
        },
        success: function(data, textStatus, jqXHR) {
          scriptLog.log(data, jqXHR, textStatus);
          if (item.callback) {
            item.callback(data.id);
          }
        },
        complete: function(jqXHR, textSataus) {
          callback();
        },
        contentType: 'application/json',
        data: JSON.stringify(postMsg),
        dataType: 'json',
        processData: false,
        type: 'POST',
        timeout: 15000,
        url: this.server + 'benchmark/'
      });

      return null;
    },
    processBenchmarkRun: function _processBenchmarkRun(item, callback) {
      this.processing = true;

      var postMsg = {};

      postMsg['benchmark'] = item.id;
      postMsg['successful'] = item.successful;
      postMsg['events_executed'] = item.eventsExecuted;
      postMsg['events_total'] = item.eventsTotal;
      postMsg['captures'] = JSON.stringify(item.captures, null, 2);
      postMsg['time'] = item.time;

      postMsg['trigger_timeouts'] = item.triggerTimeouts;
      postMsg['element_timeouts'] = item.elementTimeouts;
      postMsg['version'] = item.version;

      /* 
       * Lets ignore these for now
       *
      var errors = item.errors;
      var notes = item.notes;
      var log = item.log;

      if (errors)
        postMsg['errors'] = errors;

      if (notes)
        postMsg['notes'] = JSON.stringify(notes, null, 2);

      if (log)
        postMsg['log'] = log;
      */

      scriptLog.log('Saving benchmark run:', postMsg);
      var scriptServer = this;
      $.ajax({
        error: function(jqXHR, textStatus, errorThrown) {
          scriptLog.warn('Error saving event', jqXHR, textStatus, errorThrown);
          scriptServer.retry(item);
        },
        success: function(data, textStatus, jqXHR) {
          scriptLog.log(data, jqXHR, textStatus);
        },
        complete: function(jqXHR, textSataus) {
          callback();
        },
        contentType: 'application/json',
        data: JSON.stringify(postMsg),
        dataType: 'json',
        processData: false,
        type: 'POST',
        timeout: 15000,
        url: this.server + 'benchmark_run/'
      });

      return null;
    },
//    processCapture: function _saveCapture(capture, scriptId) {
//      var scriptServer = this;
//      var server = this.server;
//
//      var postMsg = {};
//      postMsg['script'] = scriptId;
//      postMsg['innerHtml'] = capture.innerHtml;
//      postMsg['innerText'] = capture.innerText;
//      postMsg['nodeName'] = capture.nodeName;
//
//      $.ajax({
//        error: function(jqXHR, textStatus, errorThrown) {
//          scriptLog.log(jqXHR, textStatus, errorThrown);
//        },
//        success: function(data, textStatus, jqXHR) {
//          scriptLog.log(data, textStatus, jqXHR);
//        },
//        contentType: 'application/json',
//        data: JSON.stringify(postMsg),
//        dataType: 'json',
//        processData: false,
//        type: 'POST',
//        url: server + 'capture/'
//      });
//      return null;
//    },
//    saveParams: function _saveParams(scriptId, params) {
//      var server = this.server;
//
//      function convertParams(param, prefix) {
//        prefix = prefix || '';
//        var list = [];
//
//        for (var p in param) {
//          var v = param[p];
//          if (typeof v == 'object')
//            list = list.concat(convertParams(v, prefix + p + '.'));
//          else
//            list.push({name: prefix + p, value: v});
//        }
//        return list;
//      }
//
//      var listParams = convertParams(params);
//
//      var postMsg = {};
//
//      postMsg['params'] = listParams;
//      postMsg['script_id'] = scriptId;
//
//      scriptLog.log('saving params:', postMsg);
//      $.ajax({
//        error: function(jqXHR, textStatus, errorThrown) {
//          scriptLog.log('error params', jqXHR, textStatus, errorThrown);
//        },
//        success: function(data, textStatus, jqXHR) {
//          scriptLog.log(data, jqXHR, textStatus);
//        },
//        contentType: 'application/json',
//        data: JSON.stringify(postMsg),
//        dataType: 'json',
//        processData: false,
//        type: 'POST',
//        url: server + 'script_param/'
//      });
//    },
    getScripts: function _getScripts(name, cont) {
      var scriptServer = this;
      var server = this.server;

      $.ajax({
        error: function(jqXHR, textStatus, errorThrown) {
          scriptLog.error('Error getting scripts:', jqXHR, textStatus,
            errorThrown);
          return cont("Error retrieving script", null);
        },
        success: function(data, textStatus, jqXHR) {
          scriptLog.debug('Got script:', data, textStatus, jqXHR);
          var scripts = data;
          return cont(null, scripts);
        },
        url: server + 'script/' + name + '/?format=json',
        type: 'GET',
        processData: false,
        accepts: 'application/json',
        dataType: 'json'
      });
      return null;
    },
    getScript: function _getScript(name, cont) {
      var scriptServer = this;
      var server = this.server;

      $.ajax({
        error: function(jqXHR, textStatus, errorThrown) {
          scriptLog.error('Error getting script:', jqXHR, textStatus,
            errorThrown);
          return cont("Error retrieving script", null);
        },
        success: function(data, textStatus, jqXHR) {
          scriptLog.debug('Got script:', data, textStatus, jqXHR);
          var scripts = data;
          if (scripts.length == 0) {
            return cont("No script found", null);
          }

          // find the lastest script saved with this name
          var script = scripts[0];
          for (var i = 0, ii = scripts.length; i < ii; ++i) {
            var s = scripts[i];
            if (parseInt(script.id) < parseInt(s.id)) {
              script = s;
            }
          }

          scriptServer.getEvents(script.events, function(scriptEvents) {
            var serverEvents = scriptEvents.sort(function(a, b) {
              return a.execution_order - b.execution_order;
            });

            var events = [];
            for (var i = 0, ii = serverEvents.length; i < ii; ++i) {
              var serverEvent = serverEvents[i];
              var serverParams = serverEvent.parameters;
              var e = {};

              for (var j = 0, jj = serverParams.length; j < jj; ++j) {
                var p = serverParams[j];
                e[p.name] = JSON.parse(p.value);
              }
              events.push(e);
            }
            cont(null, {
              name: script.name,
              id: script.id,
              events: events,
              parentId: script.parentId,
              notes: script.notes
            });
          });
        },
        url: server + 'script/' + name + '/?format=json',
        type: 'GET',
        processData: false,
        accepts: 'application/json',
        dataType: 'json'
      });
      return null;
    },
    getEvents: function _getEvents(eventIds, cont) {
      var events = null;
      var server = this.server;

      function getEvent(i, retrievedEvents, retries) {
        if (i >= eventIds.length) {
          scriptLog.info('Done getting script');
          cont(retrievedEvents);
          return;
        }

        if (retries > 3) {
          cont(null);
          return;
        }

        $.ajax({
          error: function(jqXHR, textStatus, errorThrown) {
            scriptLog.error('Error getting event: ', jqXHR, textStatus,
                errorThrown);
            getEvent(i, retrievedEvents, retries + 1);
          },
          success: function(data, textStatus, jqXHR) {
            scriptLog.log('Got event: ', data, textStatus, jqXHR);
            retrievedEvents.push(data);
            getEvent(i + 1, retrievedEvents);
          },
          url: server + 'event/' + eventIds[i].id + '/?format=json',
          type: 'GET',
          processData: false,
          accepts: 'application/json',
          dataType: 'json'
        });
      }

      getEvent(0, [], 0);
      return null;
    },
    getBenchmarks: function _getBenchmarks(cont) {
      var server = this.server;

      $.ajax({
        error: function(jqXHR, textStatus, errorThrown) {
          scriptLog.log(jqXHR, textStatus, errorThrown);
        },
        success: function(data, textStatus, jqXHR) {
          scriptLog.log(data, textStatus, jqXHR);
          var benchmarks = data;
          // convert capture string to capture array
          var converted = benchmarks.map(function(b) {
            b.successCaptures = JSON.parse(b.success_captures);
            delete b.success_captures;
            return b;
          });
          cont(converted);
        },
        url: server + 'benchmark/?format=json',
        type: 'GET',
        processData: false,
        accepts: 'application/json',
        dataType: 'json'
      });
      return null;
    },
    getBenchmarkRuns: function _getBenchmarkRuns(cont) {
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
        url: server + 'benchmark_run/?format=json',
        type: 'GET',
        processData: false,
        accepts: 'application/json',
        dataType: 'json'
      });
      return null;
    },

//    getCapture: function _getCapture(scriptId, cont) {
//      var scriptServer = this;
//      var server = this.server;
//
//      $.ajax({
//        error: function(jqXHR, textStatus, errorThrown) {
//          scriptLog.log(jqXHR, textStatus, errorThrown);
//        },
//        success: function(data, textStatus, jqXHR) {
//          scriptLog.log(data, textStatus, jqXHR);
//          var capture = data;
//          cont(capture);
//        },
//        url: server + 'capture/' + scriptId + '/?format=json',
//        type: 'GET',
//        processData: false,
//        accepts: 'application/json',
//        dataType: 'json'
//      });
//      return null;
//    }
  };

  return ScriptServer;
})();

