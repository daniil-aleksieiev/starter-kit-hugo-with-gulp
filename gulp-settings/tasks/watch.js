/**
 * Watch for file changes
 */
'use strict';

const { watch, series } = require('gulp');

module.exports = function (options) {
  const { files } = options.sassFilesInfo;

  return () => {
    watch(`./themes/${options.theme}/${options.src}/js/**/*`, series(options.tasks.buildCustomJs, options.tasks.esLint));

    watch(`./themes/${options.theme}/${options.src}/scss/**/*`, series(options.tasks.buildSass));

    if (files.length > 0) {
      watch(files, series(options.tasks.buildSassFiles));
    }
  };

};