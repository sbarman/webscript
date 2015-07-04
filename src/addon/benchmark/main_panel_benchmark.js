/* -*- Mode: Java; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* vim: set shiftwidth=2 tabstop=2 autoindent cindent expandtab: */

'use strict';

/* Benchmarks can automatically be created from the django command line 
 * using the following command (deprecated):
 * 
 * python manage.py makebenchmarks <script_id ...>
 *
 * Steps to benchmarking:
 *
 * 1) Record and save script 'foo'.
 * 2) Run learning and benchmarks on script.
 *
 *    runSynthesizeBenchmarksLoop(names, numRuns)
 */

/* Paramaterizable, but should only need to use singleton object */
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
      scriptServer.getBenchmarks(function(benchmarks) {
        return cont(null, benchmarks)
      });
    },
    getBenchmarkByName: function _getBenchmarkByName(name, cont) {
      this.getBenchmarks(function(err, benchmarks) {
        if (err)
          return cont(err, null);

        var filtered = benchmarks.filter(function(b) {
          return b.name == name;
        });
        
        return cont(null, filtered);
      });
    },
    /* Runs a set of benchmarks
     * @param benchmarks[array] a list of objects, with each object containing
     *     the following fields: benchmark, init, version
     */
    runBenchmarks: function _runBenchmarks(benchmarks, numRuns, cont) {
      var scriptServer = this.scriptServer;
      var b = this;

      function helper(index) {
        if (index >= benchmarks.length) {
          if (cont)
            return cont(null);
          return;
        }

        var info = benchmarks[index];
        var benchmark = info.benchmark;
        var init = info.init;
        var version = info.version;
        
        b.runBenchmark(benchmark, init, version, numRuns, function(err) {
          if (err)
            return cont(err);
          helper(index + 1);
        });
      }
      helper(0);
    },
    runBenchmark: function _runBenchmark(benchmark, init, version, numRuns,
        cont) {
      var b = this;

      if (!version)
        version = '';

      this.resetParams();
      // params.replay.eventTimeout = 60;
      params.panel.enableEdit = false;
      params.replay.saveReplay = true;
      params.replay.defaultWaitNewTab = 100;
      params.replay.defaultWaitNextEvent = 100;
      params.replay.snapshot = true;
      params.logging.saved = false;
      params.logging.level = 4;

      if (init)
        init();

      this.updateParams();
      this.controller.clearMessages();

      scriptServer.getScript(benchmark.script.id, function(err, script) {
        log.debug('Starting benchmark:', benchmark.script.id, events);

        function replayOnce(pastRuns) {
          if (pastRuns >= numRuns) {
            if (cont)
              cont(null);
            return;
          }

          var timeoutId = -1;

          /* save a file indicating that the benchmark started */
          saveText('', benchmark.name + ':' + version);

          var r = b.controller.replayScript(script.events, 
              {scriptId: script.id}, function(replay) {
            clearTimeout(timeoutId);

            /* remove all the tabs created during execution */
            var events = replay.record.events;
            var allTabs = [];
            for (var i = 0, ii = events.length; i < ii; ++i) {
              var e = events[i];
              var tab = "";
              /* tabs from DOM events */
              if (e.frame && e.frame.tab)
                tab = e.frame.tab;
              /* tabs from web requests */
              if (e.data && e.data.tabId)
                tab = e.data.tabId;

              if (tab && allTabs.indexOf(tab) < 0)
                allTabs.push(tab);
            }

            /* Remove all tabs seen during demonstration */
            for (var i = 0, ii = allTabs.length; i < ii; ++i) {
              var tabId = parseInt(allTabs[i]);
              if (tabId >= 0) {
                chrome.tabs.get(tabId, function(tabInfo) {
                  if (chrome.runtime.lastError)
                    log.info('Tab does not exists');
                  else
                    chrome.tabs.remove(tabId);
                });
              }
            }

            /* Check if captures match */
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

            /* define success as capturing the correct text */
            // var success = replay.events.length == replay.index;
            var success = true;
            for (var i = 0, ii = correctCaptures.length; i < ii; ++i) {
              if (!correctCaptures[i].match)
                success = false;
            }

            var time = replay.time;
            var error = replay.errorMsg;
            var triggerTimeouts = replay.triggerTimeouts;
            var elementTimeouts = replay.elementTimeouts;

            saveText("", JSON.stringify(success));

            log.debug('Finished benchmark');
            scriptServer.saveBenchmarkRun(benchmark.id, success, replay.index,
                replay.events.length, time, correctCaptures, triggerTimeouts,
                elementTimeouts, version);

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

/* set of benchmarks for the paper */
var paperBenchmarks = [
  'allrecipes',
  'gmail',
  'drugs',
  'goodreads',
  'google translate',
  'myfitnesspal',
  'thesaurus',
  'xe',
  'yahoo finance',
  'yelp',
  'zillow',
  'mapquest',
  'google',
  'opentable',
  'target',
  'walmart',
  'facebook',
  'booking',
  'expedia',
  'hotels',
  'southwest',
  'trip advisor'
];

var whitelist = [
  'original',
  'original-nowait',
  'original-triggers',
  'initial-triggers',
  'final',
  'final-triggers'
];


/* singleton object */
var b = new Benchmarker(ports, record, scriptServer, controller);

function runAllBenchmarks(numRuns) {
  b.getBenchmarks(function(err, matches) {
    var benchmarks = [];
    for (var i = 0, ii = matches.length; i < ii; ++i) {
      benchmarks.push({benchmark: matches[i], version: 'basic'});
    }
    b.runBenchmarks(benchmarks, numRuns)
  });
}

function runBenchmark(name, numRuns) {
  b.getBenchmarkByName(name, function(err, matches) {
    if (matches.length > 0) {
      var benchmark = matches[0];
      var benchmarks = [];
      benchmarks.push({benchmark: benchmark, version: 'basic'});
      b.runBenchmarks(benchmarks, numRuns);
    }
  });
}

function makeSynthesizedBenchmarks(name, callback) {
  scriptServer.getScripts(name, function(err, scripts) {
    var numBenchmarks = 0;
    for (var i = 0, ii = scripts.length; i < ii; ++i) {
      /* create local scope */
      (function() {
        var s = scripts[i];
        var notes = JSON.parse(s.notes);
        /* find scripts that contain whitelisted type, and are not replays */
        if (whitelist.indexOf(notes.state) >= 0 && !notes.replay) {
          numBenchmarks += 1;
          scriptServer.getScript(s.id, function(err, script) {
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

    /* if no benchmarks matched, then immediately return to callback */
    if (numBenchmarks == 0)
      return callback(null, []);

    var ids = [];
    function callbackReady(id) {
      ids.push(id);
      if (callback && ids.length == numBenchmarks)
        return callback(null, ids);
    }
  });
}

function runSynthesizeBenchmarkLoop(names, numRuns) {
  function helper(index) {
    if (index >= names.length)
      return;

    runSynthesizeBenchmark(names[index], numRuns, function(err) {
      if (err)
        log.error('Error in runSynthesizeBenchmarkLoop:', err);
      helper(index + 1);
    });
  }
  helper(0);
}

function runSynthesizeBenchmark(name, numRuns, cont) {
  synthesizeTriggers(name, function(err, timestampName) {
    scriptServer.finishedProcessing(function() {
      makeSynthesizedBenchmarks(timestampName, function(err, benchmarkIds) {
        log.log(benchmarkIds);
        scriptServer.finishedProcessing(function() {
          b.getBenchmarks(function(err, benchmarks) {
            benchmarks = benchmarks.filter(function(b) {
              return benchmarkIds.indexOf(b.id) >= 0;
            });
            benchmarks =  benchmarks.map(function(b) {
              return {benchmark: b};
            });
            log.log(benchmarks);
            b.runBenchmarks(benchmarks, numRuns, cont)
          });
        });
      });
    });
  });
}
