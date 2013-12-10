/* -*- Mode: Java; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* vim: set shiftwidth=2 tabstop=2 autoindent cindent expandtab: */

'use strict';

require('./external/shelljs/make');

var ROOT_DIR = __dirname + '/', // absolute path to project's root
    BUILD_DIR = 'build/',
    BUILD_TARGET = BUILD_DIR + 'webscript',
    FIREFOX_BUILD_DIR = BUILD_DIR + '/firefox/',
    CHROME_BUILD_DIR = BUILD_DIR + '/chrome/';

//
// make all
//
target.all = function() {
  // Don't do anything by default
  echo('Please specify a target. Available targets:');
  for (t in target)
    if (t !== 'all') echo('  ' + t);
};

//
// make lint
//
target.lint = function() {
  cd(ROOT_DIR);
  echo();
  echo('### Linting JS files (this can take a while!)');

  var LINT_FILES = ['make.js',
                    'src/scripts/background/*.js',
                    'src/scripts/common/*.js',
                    'src/scripts/content/*.js'
                   ];

  exec('gjslint --nojsdoc ' + LINT_FILES.join(' '));
};

//
// make makefile
//
target.makefile = function() {
  var makefileContent = 'help:\n\tnode make\n\n';
  var targetsNames = [];
  for (var i in target) {
    makefileContent += i + ':\n\tnode make ' + i + '\n\n';
    targetsNames.push(i);
  }
  makefileContent += '.PHONY: ' + targetsNames.join(' ') + '\n';
  makefileContent.to('Makefile');
};
