/* -*- Mode: Java; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* vim: set shiftwidth=2 tabstop=2 autoindent cindent expandtab: */

'use strict';

/* Benchmarks can automatically be created from the django command line 
 * using the following command:
 * 
 * python manage.py makebenchmarks <script_id ...>
 *
 * Steps to benchmarking:
 *
 * 1) Record and save scrpt 'foo'.
 * 2) Run learning on script.
 *    synthesizeTriggers('foo') or synthesizeTriggersLoop(['foo'])
 * 3) Create benchmarks from inferred scripts
 *    synthesizeTriggers('foo', function(name) {
 *      makeBenchmarks(name);
 *    })
 * 4) Run enabled benchmarks in all the different configurations (we can
 *    hardcode this to make it easier).
 * 5) Get stats from all benchmarks. For each benchmark, show name, number
 *    of runs, successful, failed, time for passing (avg, min, max), timing,
 *    element strategy
 *
 *    Have ability to filter
 *
 *    Get stats from learning - # of executions
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
    resetParams: function _resetParams() {
      params = jQuery.extend(true, {}, defaultParams);
      this.updateParams();
    },
    updateParams: function _updateParams() {
      this.controller.updateParams();
    },
    getBenchmarks: function _getBenchmarks(cont) {
      var scriptServer = this.scriptServer;
      scriptServer.getBenchmarks(cont);
    },
    getBenchmarkByName: function _getBenchmarkByName(name, cont) {
      var filteredList = [];
      this.getBenchmarks(function(benchmarks) {
        for (var i = 0, ii = benchmarks.length; i < ii; ++i) {
          var benchmark = benchmarks[i];
          if (benchmark.name == name)
            filteredList.push(benchmark);
        }
        cont(filteredList);
      });
    },
    /* Runs a set of benchmarks
     * @param benchmarks[array] a list of objects, with each object containing
     *     the following fields: benchmark, init, notes
     */
    runBenchmarks: function _runBenchmarks(benchmarks, numRuns, cont) {
      var scriptServer = this.scriptServer;
      var b = this;

      function helper(index) {
        if (index >= benchmarks.length)
          return;

        var info = benchmarks[index];
        var benchmark = info.benchmark;
        var init = info.init;
        var notes = info.notes;
        
        b.runBenchmark(benchmark, init, notes, numRuns,
          function() {
            helper(index + 1);
          }
        );
      }
      helper(0);
    },
    runBenchmark: function _runBenchmark(benchmark, init, notes, numRuns, cont) {
      var b = this;

      this.resetParams();
      // params.replay.eventTimeout = 60;
      params.panel.enableEdit = false;
      params.replay.saveReplay = false;

      if (init)
        init();
      this.updateParams();

      scriptServer.getScript(benchmark.script.id, function(script) {
        log.debug('Starting benchmark:', benchmark.script.id, events);

        function replayOnce(pastRuns) {
          if (pastRuns >= numRuns) {
            if (cont)
              cont();
            return;
          }

          var timeoutId = -1;

          var r = b.controller.replayScript(script.events, 
              {scriptId: script.id}, function(replay) {
            clearTimeout(timeoutId);

            /* remove all the tabs created during execution */
            var events = replay.record.events;
            var allTabs = [];
            for (var i = 0, ii = events.length; i < ii; ++i) {
              var e = events[i];
              var tab = "";
              if (e.frame && e.frame.tab)
                tab = e.frame.tab;
              if (e.data && e.data.tabId)
                tab = e.data.tabId;

              if (tab && allTabs.indexOf(tab) < 0)
                allTabs.push(tab);
            }

            for (var i = 0, ii = allTabs.length; i < ii; ++i) {
              var tabId = parseInt(allTabs[i]);
              if (tabId >= 0)
                chrome.tabs.remove(parseInt(tabId));
            }

            var rcaptures = benchmark.successCaptures;
            var captures = replay.captures;

            var correctCaptures = [];
            for (var i = 0, ii = rcaptures.length; i < ii; ++i) {
              if (i < captures.length) {
                var c = rcaptures[i].trim() == captures[i].trim();
                correctCaptures.push({
                    correct: rcaptures[i],
                    actual: captures[i],
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
            var error = replay.errorMsg;

            log.debug('Finished benchmark');
            scriptServer.saveBenchmarkRun(benchmark.id, success, replay.index,
                replay.events.length, time, notes, correctCaptures, error);

            replayOnce(pastRuns + 1);
          });

          controller.replay = r;

          // kill script after timeout period
          timeoutId = setTimeout(function() {
            r.finish();
          }, params.benchmark.timeout * 1000);
        }
        replayOnce(0);
      });
    }
  };

  return Benchmarker;
})();

/* singleton object */
var b = new Benchmarker(ports, record, scriptServer, controller);

function runAllBenchmarks(numRuns) {
  b.getBenchmarks(function(matches) {
    var benchmarks = [];
    for (var i = 0, ii = matches.length; i < ii; ++i) {
      benchmarks.push({benchmark: matches[i], notes: {}});
    }
    b.runBenchmarks(benchmarks, numRuns)
  });
}

function runBenchmark(name, numRuns) {
  b.getBenchmarkByName(name, function(matches) {
    if (matches.length > 0) {
      var benchmark = matches[0];
      var benchmarks = [];
      benchmarks.push({benchmark: benchmark, notes: {}});
      b.runBenchmarks(benchmarks, numRuns);
    }
  })
}

function makeBenchmarks(name, callback) {
  scriptServer.getScripts(name, function(scripts) {
    var whitelist = ['original', 'original-nowait', 'original-triggers',
                     'initial-triggers', 'final', 'final-triggers'];

    for (var i = 0, ii = scripts.length; i < ii; ++i) {
      // create local scope
      (function() {
        var s = scripts[i];
        var notes = JSON.parse(s.notes);
        if (whitelist.indexOf(notes.state) >= 0 && !notes.replay) {
          scriptServer.getScript(s.id, function(script) {
            var captures = script.events.filter(function(e) {
              return e.type == "capture";
            });
            
            var success = captures.map(function(c) {
              return c.target.snapshot.prop.innerText;
            });

            scriptServer.saveBenchmark(s.name + '-' + notes.state, s.id,
                success, true, callbackReady);
          });
        }
      })();
    }

    var ids = [];
    function callbackReady(id) {
      ids.push(id);
      if (callback && ids.length == whitelist.length)
        callback(ids);
    }
  });
}

function runSynthesizeBenchmarks(name, numRuns) {
  synthesizeTriggers(name, function(timestampName) {
    scriptServer.finishedProcessing(function() {
      makeBenchmarks(timestampName, function(benchmarkIds) {
        b.getBenchmarks(function(allBenchmarks) {
          var benchmarks = [];
          for (var i = 0, ii = allBenchmarks.length; i < ii; ++i) {
            var benchmark = allBenchmarks[i];
            if (benchmarkIds.indexOf(benchmark.id) >= 0) {
              benchmarks.push({benchmark: benchmark, notes: {}});
            }
          }
          console.log(benchmarks);
          b.runBenchmarks(benchmarks, numRuns)
        });
        console.log(benchmarkIds);
      });
    });
  });
}

////
////function runBenchmarkPaper(ids) {
////  b.getBenchmarks(function(benchmarks) {
////    var timingStrategies = Object.keys(TimingStrategy);
////
////    var benchmarkList = [];
////    var initList = [];
////    var notes = [];
////
////    for (var i = 0, ii = benchmarks.length; i < ii; ++i) {
////      var benchmark = benchmarks[i];
////      if (ids.indexOf(benchmark.id) != -1) {
////        // add basic replay
////        benchmarkList.push(benchmark);
////        initList.push(function() {});
////        notes.push('Plain old replay');
////
////        // replay without compensation
////        benchmarkList.push(benchmark);
////        initList.push(function() {
////          params.replaying.compensation = Compensation.NONE;
////        });
////        notes.push('No compensation');
////
////        // replay without atomic events
////        benchmarkList.push(benchmark);
////        initList.push(function() {
////          params.replaying.atomic = false;
////        });
////        notes.push('No atomic events');
////
////        // replay without cascading event check
////        benchmarkList.push(benchmark);
////        initList.push(function() {
////          params.replaying.cascadeCheck = false;
////        });
////        notes.push('No cascading event check');
////
////        // replay as fast as possible
////        benchmarkList.push(benchmark);
////        initList.push(function() {
////          params.replaying.timingStrategy = TimingStrategy.SPEED;
////        });
////        notes.push('Speed timing');
////
////        // replay with perturbed timing
////        benchmarkList.push(benchmark);
////        initList.push(function() {
////          params.replaying.timingStrategy = TimingStrategy.PERTURB;
////        });
////        notes.push('Perturb timing');
////      }
////    }
////
////    b.runBenchmarks(benchmarkList, initList, notes);
////  });
////}
