/**
 * Build styles for application from SASS
 */
'use strict';

const { src, dest } = require('gulp');
const sass = require('gulp-sass');
const rename = require('gulp-rename');
const sourcemaps = require('gulp-sourcemaps');
const autoprefixer = require('gulp-autoprefixer');
const gcmq = require('gulp-group-css-media-queries');
const cssnano = require('gulp-cssnano');

module.exports = function (options) {

  return function () {
    return src(`./themes/${options.theme}/${options.src}/scss/${options.mainScss}`)
      .pipe(rename(options.mainScssMin))
      .pipe(sourcemaps.init({
        loadMaps: false
      }))
      .pipe(sass().on('error', function (err) {
        options.showError.apply(this, ['Sass compile error', err]);
      }))
      .pipe(gcmq())
      .pipe(cssnano({
        safe: true
      }))
      .pipe(autoprefixer(options.versions))
      .pipe(sourcemaps.write('./'))
      .pipe(dest(`./themes/${options.theme}/${options.dest}/css`));
  };

};