/**
 * Build js vendor (concatenate vendors array)
 */
'use strict';

const { src, dest } = require('gulp');
const filesExist = require('files-exist');
const uglify = require('gulp-uglify');
const concat = require('gulp-concat');

module.exports = function (options) {

  return (cb) => {
    let jsVendors = require(`../../themes/${options.theme}/${options.src}/vendor_entries/${options.vendorJs}`);

    if (jsVendors.length == 0) {
      return cb();
    }

    return src(filesExist(jsVendors))
      .pipe(concat(options.vendorJsMin))
      .pipe(uglify())
      .pipe(dest(`./themes/${options.theme}/${options.dest}/js`));
  };

};