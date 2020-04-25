module.exports = {
  folder: {
    tasks: 'gulp-settings/tasks',
    src: 'src',
    build: 'assets',
    theme: 'project_theme'
  },
  file: {
    mainJs: 'app.js',
    vendorJs: 'vendor.js',
    vendorJsMin: 'vendor.min.js',
    mainScss: 'style.scss',
    mainScssMin: 'style.min.css',
    vendorScss: 'vendor.scss',
    vendorScssMin: 'vendor.min.css'
  },
  task: {
    esLint: 'es-lint',
    buildCustomJs: 'build-custom-js',
    buildHugo: 'build-hugo',
    buildJsVendors: 'build-js-vendors',
    buildSass: 'build-sass',
    buildSassFiles: 'compile-sass-files',
    buildStylesVendors: 'build-styles-vendors',
    cleanBuild: 'clean-build',
    cleanPublic: 'clean-public',
    watch: 'watch'
  },
  autoprefixer: {
    versions: 'last 4 versions'
  },
  getPathesForSassCompiling: function () {
    return {
      files: [],
      isGcmq: false
    };
  }
};