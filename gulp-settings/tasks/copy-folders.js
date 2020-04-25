/**
 * Copy folders to another folder
 */
'use strict';

const { src, dest } = require('gulp');

module.exports = function (options) {

  return () => {
    return src(options.foldersToCopy, { dot: true })
      .pipe(dest(`./${options.dest}`));
  };

};