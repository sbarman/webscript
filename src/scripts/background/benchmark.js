/* -*- Mode: Java; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* vim: set shiftwidth=2 tabstop=2 autoindent cindent expandtab: */

'use strict';

var Benchmarker = (function BenchmarkerClosure() {
  var log = getLog('benchmark');

  function Benchmarker(ports, record, scriptServer, panel, controller) {
    this.ports = ports;
    this.record = record;
    this.scriptServer = scriptServer;
    this.panel = panel;
    this.controller = controller;
  }

  Benchmarker.prototype = {
    getBenchmarks: function _getBenchmarks(cont) {
      var scriptServer = this.scriptServer;
      scriptServer.getBenchmarks(cont);
    },
    runBenchmarks: function _runBenchmarks(benchmarks) {
      var scriptServer = this.scriptServer;
      var benchmarker = this;

      params.replaying.eventTimeout = 60;
      this.controller.updateParams();

      function runBenchmark(benchmarks, index) {
        if (index >= benchmarks.length)
          return;

        var benchmark = benchmarks[index];
        scriptServer.getScript(benchmark.script.id, true, function(id, events) {
          benchmarker.controller.setLoadedEvents(id, events);
          log.debug('Starting benchmark:', benchmark.script.id, events);
          
          benchmarker.runBenchmark(events,
            function(replay) {
              var rcaptures = jQuery.parseJSON(benchmark.success_captures);
              var captures = replay.captures;
              
              var correct_captures = [];
              for (var i = 0, ii = rcaptures.length; i < ii; ++i) {
                if (i < captures.length) {
                  var c = rcaptures[i].trim() == captures[i].innerText.trim();
                  correct_captures.push({
                      correct: rcaptures[i],
                      actual: captures[i].innerText,
                      match: c
                  });
                } else {
                  correct_captures.push({
                    correct: rcaptures[i],
                    actual: "",
                    match: false
                  });
                }
              }

              var success = replay.events.length == replay.index;
              for (var i = 0, ii = correct_captures.length; i < ii; ++i) {
                if (!correct_captures[i].match)
                  success = false;
              }

              var benchmarkRun = {
                benchmark: benchmark,
                errrors: '',
                events_executed: replay.index,
                events_total: replay.events.length,
                successful: success,
                notes: JSON.stringify(correct_captures)
              };

              log.debug('Finished benchmark:', benchmarkRun);
              scriptServer.saveBenchmarkRun(benchmarkRun);
              runBenchmark(benchmarks, index + 1);
            }
          );
        });
      }
      runBenchmark(benchmarks, 0);
    },
    runBenchmark: function _runBenchmark(events, cont) {
      var replay = new Replay(events, this.panel, this.ports,
                              this.record, this.scriptServer);
      controller.replay = replay;

      // kill script after timeout period
      var timeoutId = setTimeout(function() {
        replay.finish();
      }, params.benchmarking.timeout * 1000);

      replay.replay(function(replay) {
        // get the results of replay
        clearTimeout(timeoutId);
        cont(replay);
      });
    }
  };

  return Benchmarker;
})();

function runAllBenchmarks() {
  var b = new Benchmarker(ports, record, scriptServer, panel, controller);
  b.getBenchmarks(function(benchmarks) {
    b.runBenchmarks(benchmarks);
  });
}
