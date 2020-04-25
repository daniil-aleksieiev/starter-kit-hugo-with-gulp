// You can write a call and import your functions in this file.
//
// This file will be compiled into app.js and will not be minified.
// Feel free with using ES6 here.

// import {NAME} from './modules/...';
import hljs from 'highlight.js/lib/highlight';
import javascript from 'highlight.js/lib/languages/javascript';
import pageTransition from './modules/pageTransition';
import hamburger from './modules/hamburger';
// import pageScroll from './modules/pageScroll';

(($) => {
  // When DOM is ready
  $(() => {
    pageTransition.transition();
    $('#currentYear').text(`${new Date().getFullYear()}`);
    // pageScroll.smoothScrolling();
    hamburger.handler();
    hljs.registerLanguage('javascript', javascript);
    hljs.initHighlightingOnLoad();
  });
})(jQuery);
