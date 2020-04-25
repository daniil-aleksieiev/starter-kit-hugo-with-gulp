/**
 * Compile scss files listed in the config
 */
'use strict';

const { src, dest } = require('gulp');
const sass = require('gulp-sass');
const gcmq = require('gulp-group-css-media-queries');
const gulpif = require('gulp-if');
const sourcemaps = require('gulp-sourcemaps');
const autoprefixer = require('gulp-autoprefixer');

module.exports = function (options) {

  return function (cb) {
    const { files, isGcmq } = options.sassFilesInfo;

    if (files.length > 0) {
      return src(files)
        .pipe(sourcemaps.init({
          loadMaps: true
        }))
        .pipe(sass().on('error', function (err) {
          options.showError.apply(this, ['Sass compile error', err]);
        }))
        .pipe(gulpif(isGcmq, gcmq()))
        .pipe(autoprefixer(options.versions))
        .pipe(sourcemaps.write('./'))
        .pipe(dest(`./themes/${options.theme}/${options.dest}/css`));
    } else {
      return cb();
    }
  };

};