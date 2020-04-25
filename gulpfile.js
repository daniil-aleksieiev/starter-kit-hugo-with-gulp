(() => {
  'use strict';

  const cfg = require('./gulp-settings/config.js');
  const self = this;
  const { task, series, parallel } = require('gulp');
  const notifier = require('node-notifier');
  const gutil = require('gulp-util');
  const shell = require('gulp-shell');

  /**
   * Require gulp task from file
   * @param  {string} taskName     Task name
   * @param  {String} path         Path to task file
   * @param  {Object} options      Options for task
   * @param  {Array}  dependencies Task dependencies
   */
  function requireTask(taskName, options, dependencies) {
    let settings = options || {};
    const taskFunction = function (callback) {

      let task = require(`./${cfg.folder.tasks}/${taskName}.js`).call(this, settings);

      return task(callback);
    }

    settings.taskName = taskName;

    if (!Array.isArray(dependencies)) {
      task(taskName, taskFunction);
    } else if (dependencies.length === 1) {
      task(taskName, series(dependencies[0], taskFunction));
    } else {
      task(taskName, series(dependencies, taskFunction));
    }
  }

  /**
   * Lint ES
   */
  requireTask(`${cfg.task.esLint}`, {
    src: cfg.folder.src,
    theme: cfg.folder.theme
  });

  /**
   * Build custom js
   */
  requireTask(`${cfg.task.buildCustomJs}`, {
    src: cfg.folder.src,
    dest: cfg.folder.build,
    theme: cfg.folder.theme,
    mainJs: cfg.file.mainJs,
    showError: showError
  });

  /**
   * Build js vendor (concatenate vendors array)
   */
  requireTask(`${cfg.task.buildJsVendors}`, {
    src: cfg.folder.src,
    dest: cfg.folder.build,
    theme: cfg.folder.theme,
    vendorJs: cfg.file.vendorJs,
    vendorJsMin: cfg.file.vendorJsMin
  });

  /**
   * Build styles for application from SASS
   */
  requireTask(`${cfg.task.buildSass}`, {
    src: cfg.folder.src,
    dest: cfg.folder.build,
    theme: cfg.folder.theme,
    mainScss: cfg.file.mainScss,
    mainScssMin: cfg.file.mainScssMin,
    versions: cfg.autoprefixer.versions,
    self: self,
    showError: showError
  });

  /**
   * Compile scss files listed in the config
   */
  requireTask(`${cfg.task.buildSassFiles}`, {
    sassFilesInfo: cfg.getPathesForSassCompiling(),
    dest: cfg.folder.build,
    theme: cfg.folder.theme,
    versions: cfg.autoprefixer.versions,
    self: self,
    showError: showError
  });

  /**
   * Build styles for vendor from SASS
   */
  requireTask(`${cfg.task.buildStylesVendors}`, {
    src: cfg.folder.src,
    dest: cfg.folder.build,
    theme: cfg.folder.theme,
    vendorScss: cfg.file.vendorScss,
    vendorScssMin: cfg.file.vendorScssMin,
    showError: showError
  });

  /**
   * Clean build folder
   */
  requireTask(`${cfg.task.cleanBuild}`, {
    src: cfg.folder.build,
    theme: cfg.folder.theme
  });

  /**
   * Clean public dir
   */
  task(`${cfg.task.cleanPublic}`, shell.task('rm -rf public'));

  /**
   * Build Hugo
   */
  task(`${cfg.task.buildHugo}`, shell.task('hugo'));

  /**
   * Watch for file changes
   */
  requireTask(`${cfg.task.watch}`, {
    sassFilesInfo: cfg.getPathesForSassCompiling(),
    src: cfg.folder.src,
    dest: cfg.folder.build,
    theme: cfg.folder.theme,
    tasks: {
      buildSassFiles: cfg.task.buildSassFiles,
      buildCustomJs: cfg.task.buildCustomJs,
      buildSass: cfg.task.buildSass,
      esLint: cfg.task.esLint
    }
  }, false);

  /**
   * Default Gulp task
   */
  task('default', series(
    parallel(
      cfg.task.cleanBuild,
      cfg.task.cleanPublic
    ),
    parallel(
      cfg.task.buildCustomJs,
      cfg.task.buildJsVendors,
      cfg.task.buildSass,
      cfg.task.buildSassFiles,
      cfg.task.buildStylesVendors,
      cfg.task.esLint
    ),
    series(
      cfg.task.buildHugo,
      cfg.task.watch
    )
  ));

  /**
   * Build task
   */
  task('build', series(
    parallel(
      cfg.task.cleanBuild,
      cfg.task.cleanPublic
    ),
    parallel(
      cfg.task.buildCustomJs,
      cfg.task.buildJsVendors,
      cfg.task.buildSass,
      cfg.task.buildSassFiles,
      cfg.task.buildStylesVendors,
      cfg.task.esLint
    ),
    cfg.task.buildHugo
  ));

  /**
   * Show error in console
   * @param  {String} preffix Title of the error
   * @param  {String} err     Error message
   */
  function showError(preffix, err) {
    gutil.log(gutil.colors.white.bgRed(' ' + preffix + ' '), gutil.colors.white.bgBlue(' ' + err.message + ' '));
    notifier.notify({
      title: preffix,
      message: err.message
    });
    this.emit('end');
  }
})();