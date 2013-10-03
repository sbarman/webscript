/* -*- Mode: Java; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* vim: set shiftwidth=2 tabstop=2 autoindent cindent expandtab: */

'use strict';

var Benchmarker = (function BenchmarkerClosure() {
  var log = getLog('benchmark');

  function Benchmarker(ports, record, scriptServer, controller) {
    this.ports = ports;
    this.record = record;
    this.scriptServer = scriptServer;
    this.controller = controller;
  }

  Benchmarker.prototype = {
    getBenchmarks: function _getBenchmarks(cont) {
      var scriptServer = this.scriptServer;
      scriptServer.getBenchmarks(cont);
    },
    resetParams: function _resetParams() {
      params = jQuery.extend(true, {}, defaultParams);
      this.updateParams();
    },
    updateParams: function _updateParams() {
      this.controller.updateParams();
    },
    runBenchmarks: function _runBenchmarks(benchmarks, initFunctions, notes) {
      var scriptServer = this.scriptServer;
      var benchmarker = this;

      function helper(index) {
        if (index >= benchmarks.length)
          return;

        benchmarker.resetParams();
        params.replaying.eventTimeout = 60;
        if (initFunctions)
          initFunctions[index]();
        benchmarker.updateParams();

        var benchmark = benchmarks[index];
        var note = "";
        if (notes)
          note = notes[index];

        benchmarker.runBenchmark(benchmark, note,
          function(replay) {
            helper(index + 1);
          }
        );
      }

      helper(0);
    },
    runBenchmark: function _runBenchmark(benchmark, note, cont) {
      var b = this;

      scriptServer.getScript(benchmark.script.id, true, function(id, events) {
        log.debug('Starting benchmark:', benchmark.script.id, events);

        var timeoutId = -1;

        var r = b.controller.replayScript(id, events, function(replay) {
          clearTimeout(timeoutId);
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
            errors: replay.debug.toString(),
            events_executed: replay.index,
            events_total: replay.events.length,
            successful: success,
            notes: note + ":" + JSON.stringify(correct_captures)
          };

          log.debug('Finished benchmark:', benchmarkRun);
          scriptServer.saveBenchmarkRun(benchmarkRun);

          if (cont)
            cont(replay);
        });

        controller.replay = r;

        // kill script after timeout period
        timeoutId = setTimeout(function() {
          r.finish();
        }, params.benchmarking.timeout * 1000);
      });
    }
  };

  return Benchmarker;
})();


function runBenchmarks(benchmarkList, initList) {
  var b = new Benchmarker(ports, record, scriptServer, controller);
  b.runBenchmarks(benchmarkList, initList);
}

function runAllBenchmarks() {
  var b = new Benchmarker(ports, record, scriptServer, controller);
  b.getBenchmarks(function(benchmarks) {
    b.runBenchmarks(benchmarks);
  });
}

function runBenchmark(name) {
  var b = new Benchmarker(ports, record, scriptServer, controller);
  var filteredList = []
  b.getBenchmarks(function(benchmarks) {
    for (var i = 0, ii = benchmarks.length; i < ii; ++i) {
      var benchmark = benchmarks[i];
      if (benchmark.script.name == name)
        filteredList.push(benchmark);
    }
    b.runBenchmarks(filteredList);
  });
}

function runBenchmarkAllTimes(selector, trials) {
  var b = new Benchmarker(ports, record, scriptServer, controller);
  b.getBenchmarks(function(benchmarks) {
    var timingStrategies = Object.keys(TimingStrategy);

    var benchmarkList = [];
    var initList = [];
    var notes = [];

    for (var i = 0, ii = benchmarks.length; i < ii; ++i) {
      var benchmark = benchmarks[i];
      if (selector(benchmark)) {
        for(var j = 0, jj = timingStrategies.length; j < jj; ++j) {
          for (var k = 0; k < trials; ++k) {
            benchmarkList.push(benchmark);
            (function() {
              var timingName = timingStrategies[j];
              notes.push(timingName);
              var timingStrategy = TimingStrategy[timingName];
              initList.push(function() {
                params.replaying.timingStrategy = timingStrategy;
              });
            })();
          }
        }
      }
    }

    b.runBenchmarks(benchmarkList, initList, notes);
  });
}
