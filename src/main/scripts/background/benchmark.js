/* -*- Mode: Java; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* vim: set shiftwidth=2 tabstop=2 autoindent cindent expandtab: */

'use strict';

/* Benchmarks can automatically be created from the django command line 
 * using the following command:
 * 
 * python manage.py makebenchmarks <script_id ...>
 */


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
        // params.replay.eventTimeout = 60;
        if (initFunctions)
          initFunctions[index]();
        benchmarker.updateParams();

        var benchmark = benchmarks[index];
        var note = '';
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

      scriptServer.getScript(benchmark.script.id, function(script) {
        log.debug('Starting benchmark:', benchmark.script.id, events);

        var timeoutId = -1;

        var r = b.controller.replayScript(script.events, 
          {scriptId: script.id}, function(replay) {
          clearTimeout(timeoutId);
          var rcaptures = benchmark.successCaptures;
          var captures = replay.captures;

          var correctCaptures = [];
          for (var i = 0, ii = rcaptures.length; i < ii; ++i) {
            if (i < captures.length) {
              var c = rcaptures[i].trim() == captures[i].innerText.trim();
              correctCaptures.push({
                  correct: rcaptures[i],
                  actual: captures[i].innerText,
                  match: c
              });
            } else {
              correctCaptures.push({
                correct: rcaptures[i],
                actual: '',
                match: false
              });
            }
          }

          var success = replay.events.length == replay.index;
          for (var i = 0, ii = correctCaptures.length; i < ii; ++i) {
            if (!correctCaptures[i].match)
              success = false;
          }

          var time = replay.time;
          var notes = note;

          log.debug('Finished benchmark');
          scriptServer.saveBenchmarkRun(benchmark.id, success, replay.index,
              replay.events.length, notes);

          if (cont)
            cont(replay);
        });

        controller.replay = r;

        // kill script after timeout period
        timeoutId = setTimeout(function() {
          r.finish();
        }, params.benchmark.timeout * 1000);
      });
    }
  };

  return Benchmarker;
})();

/* singleton object */
var b = new Benchmarker(ports, record, scriptServer, controller);

function runBenchmarks(benchmarkList, initList) {
  b.runBenchmarks(benchmarkList, initList);
}

function runAllBenchmarks() {
  b.getBenchmarks(function(benchmarks) {
    b.runBenchmarks(benchmarks);
  });
}

function runBenchmark(name) {
  var filteredList = [];
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
  b.getBenchmarks(function(benchmarks) {
    var timingStrategies = Object.keys(TimingStrategy);

    var benchmarkList = [];
    var initList = [];
    var notes = [];

    for (var i = 0, ii = benchmarks.length; i < ii; ++i) {
      var benchmark = benchmarks[i];
      if (selector(benchmark)) {
        for (var j = 0, jj = timingStrategies.length; j < jj; ++j) {
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

function runBenchmarkPaper(ids) {
  b.getBenchmarks(function(benchmarks) {
    var timingStrategies = Object.keys(TimingStrategy);

    var benchmarkList = [];
    var initList = [];
    var notes = [];

    for (var i = 0, ii = benchmarks.length; i < ii; ++i) {
      var benchmark = benchmarks[i];
      if (ids.indexOf(benchmark.id) != -1) {
        // add basic replay
        benchmarkList.push(benchmark);
        initList.push(function() {});
        notes.push('Plain old replay');

        // replay without compensation
        benchmarkList.push(benchmark);
        initList.push(function() {
          params.replaying.compensation = Compensation.NONE;
        });
        notes.push('No compensation');

        // replay without atomic events
        benchmarkList.push(benchmark);
        initList.push(function() {
          params.replaying.atomic = false;
        });
        notes.push('No atomic events');

        // replay without cascading event check
        benchmarkList.push(benchmark);
        initList.push(function() {
          params.replaying.cascadeCheck = false;
        });
        notes.push('No cascading event check');

        // replay as fast as possible
        benchmarkList.push(benchmark);
        initList.push(function() {
          params.replaying.timingStrategy = TimingStrategy.SPEED;
        });
        notes.push('Speed timing');

        // replay with perturbed timing
        benchmarkList.push(benchmark);
        initList.push(function() {
          params.replaying.timingStrategy = TimingStrategy.PERTURB;
        });
        notes.push('Perturb timing');
      }
    }

    b.runBenchmarks(benchmarkList, initList, notes);
  });
}
