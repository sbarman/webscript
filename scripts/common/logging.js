/* -*- Mode: Java; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* vim: set shiftwidth=2 tabstop=2 autoindent cindent expandtab: */

'use strict';

var getLog = null;

var LogLevel = {
  LOG: 1,
  INFO: 2,
  DEBUG: 3,
  WARN: 4,
  ERROR: 5
};

(function() {

  var level = params.logging.level;

  function log() {
    if (level <= LogLevel.LOG)
      console.log.apply(console, arguments);
  }
  
  function info() {
    if (level <= LogLevel.INFO)
     console.log.apply(console, arguments);
  }
  
  function debug() {
    if (level <= LogLevel.DEBUG)
      console.log.apply(console, arguments);
  }

  function warn() {
    if (level <= LogLevel.WARN)
      console.log.apply(console, arguments);
  }

  function error() {
    if (level <= LogLevel.ERROR)
      console.log.apply(console, arguments);
  }
  
  function noop() {
  }

  var logger = {log: log, info: info, debug: debug, warn: warn, error: error}
  var noopLogger = {log: noop, info: noop, debug: noop, warn: noop, error: noop}

  getLog = function() {
    var names = arguments;
    if (names.length == 0)
      return logger;

    var enabledLogs = params.logging.enabled;

    for (var i = 0, ii = names.length; i < ii; ++i) {
      var name = names[i];
      if (enabledLogs.indexOf(name) != -1)
        return logger;
    }

    return noopLogger;
  };
})();
