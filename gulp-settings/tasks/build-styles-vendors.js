/**
 * Build styles for vendor from SASS
 */
'use strict';

const { src, dest } = require('gulp');
const sass = require('gulp-sass');
const rename = require('gulp-rename');
const cssnano = require('gulp-cssnano');
const cssimport = require('gulp-cssimport');

module.exports = function (options) {

  return function () {
    return src(`./themes/${options.theme}/${options.src}/vendor_entries/${options.vendorScss}`)
      .pipe(sass().on('error', function (err) {
        options.showError.apply(this, ['Sass compile error (vendor)', err]);
      }))
      .pipe(cssimport())
      .pipe(rename(options.vendorScssMin))
      .pipe(cssnano({
        safe: true
      }))
      .pipe(dest(`./themes/${options.theme}/${options.dest}/css`));
  };

};