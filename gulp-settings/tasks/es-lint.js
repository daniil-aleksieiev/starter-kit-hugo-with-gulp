/**
 * Lint ES
 */
'use strict';

const { src } = require('gulp'),
  esLint = require('gulp-eslint');

module.exports = function (options) {

  return cb => {
    src(`./themes/${options.theme}/${options.src}/js/**/*.js`)
      .pipe(esLint())
      // eslint.format() outputs the lint results to the console.
      // Alternatively use eslint.formatEach() (see Docs).
      .pipe(esLint.format())

      ;

    // To have the process exit with an error code (1) on
    // lint error, return the stream and pipe to failAfterError last.

    // .pipe(esLint.failAfterError());

    cb();
  };

};