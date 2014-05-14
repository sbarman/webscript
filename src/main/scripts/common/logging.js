/* -*- Mode: Java; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* vim: set shiftwidth=2 tabstop=2 autoindent cindent expandtab: */

'use strict';

/*
 * Logging utility. Allows logs to be disabled based upon name and level.
 * These values are set in common/params.js.
 */

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

  var Logger = (function LoggerClosure() {
    function Logger(tags) {
      this.tags = tags;
    }

    Logger.prototype = {
      print: function() {
        var args = ['[' + this.tags[0] + ']'];
        for (var i = 0, ii = arguments.length; i < ii; ++i) {
          args.push(arguments[i]);
        }
        console.log.apply(console, args);
      },
      log: function() {
        if (level <= LogLevel.LOG)
          this.print.apply(this, arguments);
      },
      info: function() {
        if (level <= LogLevel.INFO)
          this.print.apply(this, arguments);
      },
      debug: function() {
        if (level <= LogLevel.DEBUG)
          this.print.apply(this, arguments);
      },
      warn: function() {
        if (level <= LogLevel.WARN)
          this.print.apply(this, arguments);
      },
      error: function() {
        if (level <= LogLevel.ERROR)
          this.print.apply(this, arguments);
      }
    };

    return Logger;
  })();

  var NoopLogger = (function NoopLoggerClosure() {
    function NoopLogger() {
    }

    NoopLogger.prototype = {
      log: function() {},
      info: function() {},
      debug: function() {},
      warn: function() {},
      error: function() {}
    };

    return NoopLogger;
  })();

  /* Check to see if the log is enabled. */
  getLog = function() {
    var names = arguments;
    if (names.length == 0)
      return logger;

    var enabledLogs = params.logging.enabled;

    for (var i = 0, ii = names.length; i < ii; ++i) {
      var name = names[i];
      if (enabledLogs.indexOf(name) != -1)
        return new Logger(names);
    }

    return new NoopLogger();
  };
})();
