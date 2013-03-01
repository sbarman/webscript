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

      function runBenchmark(benchmarks, index) {
        if (index >= benchmarks.length)
          return;

        var benchmark = benchmarks[index];
        scriptServer.getScript(benchmark.script.id, function(id, events) {
          benchmarker.controller.setLoadedEvents(id, events);
          benchmarker.runBenchmark(events, benchmark.success_condition,
                                   function(replay) {
            var benchmarkRun = {
              benchmark: benchmark,
              errrors: "",
              successful: replay.events.length == replay.index,
              events_executed: replay.index
            }
            scriptServer.saveBenchmarkRun(benchmarkRun);
            runBenchmark(benchmarks, index + 1);
          });
        });
      }
      runBenchmark(benchmarks, 0);
    },
    runBenchmark: function _runBenchmark(events, success_condition, cont) {
      var replay = new Replay(events, this.panel, this.ports, 
                              this.record, this.scriptServer);
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
  }

  return Benchmarker;
})();

function runAllBenchmarks() {
  var b = new Benchmarker(ports, record, scriptServer, panel, controller);
  b.getBenchmarks(function(benchmarks) {
    b.runBenchmarks(benchmarks);
  });
}
