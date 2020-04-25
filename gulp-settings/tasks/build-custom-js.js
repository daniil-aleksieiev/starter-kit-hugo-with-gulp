/**
 * Build custom js
 */
'use strict';

const { dest } = require('gulp');
const browserify = require('browserify');
const babelify = require('babelify');
const source = require('vinyl-source-stream');

module.exports = function (options) {

  return function () {
    return browserify({
      entries: `./themes/${options.theme}/${options.src}/js/${options.mainJs}`,
      // Remove sourcemap for production
      debug: !options.isProduction
    })
      .transform('babelify', {
        presets: ['es2015']
      })
      .bundle().on('error', function (err) {
        options.showError.apply(this, ['JS error', err])
      })
      .pipe(source('app.js'))
      .pipe(dest(`./themes/${options.theme}/${options.dest}/js`));
  };

};