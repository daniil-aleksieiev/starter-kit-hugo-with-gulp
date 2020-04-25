(function(){function r(e,n,t){function o(i,f){if(!n[i]){if(!e[i]){var c="function"==typeof require&&require;if(!f&&c)return c(i,!0);if(u)return u(i,!0);var a=new Error("Cannot find module '"+i+"'");throw a.code="MODULE_NOT_FOUND",a}var p=n[i]={exports:{}};e[i][0].call(p.exports,function(r){var n=e[i][1][r];return o(n||r)},p,p.exports,r,e,n,t)}return n[i].exports}for(var u="function"==typeof require&&require,i=0;i<t.length;i++)o(t[i]);return o}return r})()({1:[function(require,module,exports){
/*
Syntax highlighting with language autodetection.
https://highlightjs.org/
*/

(function(factory) {

  // Find the global object for export to both the browser and web workers.
  var globalObject = typeof window === 'object' && window ||
                     typeof self === 'object' && self;

  // Setup highlight.js for different environments. First is Node.js or
  // CommonJS.
  // `nodeType` is checked to ensure that `exports` is not a HTML element.
  if(typeof exports !== 'undefined' && !exports.nodeType) {
    factory(exports);
  } else if(globalObject) {
    // Export hljs globally even when using AMD for cases when this script
    // is loaded with others that may still expect a global hljs.
    globalObject.hljs = factory({});

    // Finally register the global hljs with AMD.
    if(typeof define === 'function' && define.amd) {
      define([], function() {
        return globalObject.hljs;
      });
    }
  }

}(function(hljs) {
  // Convenience variables for build-in objects
  var ArrayProto = [],
      objectKeys = Object.keys;

  // Global internal variables used within the highlight.js library.
  var languages = {},
      aliases   = {};

  // Regular expressions used throughout the highlight.js library.
  var noHighlightRe    = /^(no-?highlight|plain|text)$/i,
      languagePrefixRe = /\blang(?:uage)?-([\w-]+)\b/i,
      fixMarkupRe      = /((^(<[^>]+>|\t|)+|(?:\n)))/gm;

  // The object will be assigned by the build tool. It used to synchronize API
  // of external language files with minified version of the highlight.js library.
  var API_REPLACES;

  var spanEndTag = '</span>';

  // Global options used when within external APIs. This is modified when
  // calling the `hljs.configure` function.
  var options = {
    classPrefix: 'hljs-',
    tabReplace: null,
    useBR: false,
    languages: undefined
  };

  // keywords that should have no default relevance value
  var COMMON_KEYWORDS = 'of and for in not or if then'.split(' ')


  /* Utility functions */

  function escape(value) {
    return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function tag(node) {
    return node.nodeName.toLowerCase();
  }

  function testRe(re, lexeme) {
    var match = re && re.exec(lexeme);
    return match && match.index === 0;
  }

  function isNotHighlighted(language) {
    return noHighlightRe.test(language);
  }

  function blockLanguage(block) {
    var i, match, length, _class;
    var classes = block.className + ' ';

    classes += block.parentNode ? block.parentNode.className : '';

    // language-* takes precedence over non-prefixed class names.
    match = languagePrefixRe.exec(classes);
    if (match) {
      return getLanguage(match[1]) ? match[1] : 'no-highlight';
    }

    classes = classes.split(/\s+/);

    for (i = 0, length = classes.length; i < length; i++) {
      _class = classes[i];

      if (isNotHighlighted(_class) || getLanguage(_class)) {
        return _class;
      }
    }
  }

  function inherit(parent) {  // inherit(parent, override_obj, override_obj, ...)
    var key;
    var result = {};
    var objects = Array.prototype.slice.call(arguments, 1);

    for (key in parent)
      result[key] = parent[key];
    objects.forEach(function(obj) {
      for (key in obj)
        result[key] = obj[key];
    });
    return result;
  }

  /* Stream merging */

  function nodeStream(node) {
    var result = [];
    (function _nodeStream(node, offset) {
      for (var child = node.firstChild; child; child = child.nextSibling) {
        if (child.nodeType === 3)
          offset += child.nodeValue.length;
        else if (child.nodeType === 1) {
          result.push({
            event: 'start',
            offset: offset,
            node: child
          });
          offset = _nodeStream(child, offset);
          // Prevent void elements from having an end tag that would actually
          // double them in the output. There are more void elements in HTML
          // but we list only those realistically expected in code display.
          if (!tag(child).match(/br|hr|img|input/)) {
            result.push({
              event: 'stop',
              offset: offset,
              node: child
            });
          }
        }
      }
      return offset;
    })(node, 0);
    return result;
  }

  function mergeStreams(original, highlighted, value) {
    var processed = 0;
    var result = '';
    var nodeStack = [];

    function selectStream() {
      if (!original.length || !highlighted.length) {
        return original.length ? original : highlighted;
      }
      if (original[0].offset !== highlighted[0].offset) {
        return (original[0].offset < highlighted[0].offset) ? original : highlighted;
      }

      /*
      To avoid starting the stream just before it should stop the order is
      ensured that original always starts first and closes last:

      if (event1 == 'start' && event2 == 'start')
        return original;
      if (event1 == 'start' && event2 == 'stop')
        return highlighted;
      if (event1 == 'stop' && event2 == 'start')
        return original;
      if (event1 == 'stop' && event2 == 'stop')
        return highlighted;

      ... which is collapsed to:
      */
      return highlighted[0].event === 'start' ? original : highlighted;
    }

    function open(node) {
      function attr_str(a) {return ' ' + a.nodeName + '="' + escape(a.value).replace('"', '&quot;') + '"';}
      result += '<' + tag(node) + ArrayProto.map.call(node.attributes, attr_str).join('') + '>';
    }

    function close(node) {
      result += '</' + tag(node) + '>';
    }

    function render(event) {
      (event.event === 'start' ? open : close)(event.node);
    }

    while (original.length || highlighted.length) {
      var stream = selectStream();
      result += escape(value.substring(processed, stream[0].offset));
      processed = stream[0].offset;
      if (stream === original) {
        /*
        On any opening or closing tag of the original markup we first close
        the entire highlighted node stack, then render the original tag along
        with all the following original tags at the same offset and then
        reopen all the tags on the highlighted stack.
        */
        nodeStack.reverse().forEach(close);
        do {
          render(stream.splice(0, 1)[0]);
          stream = selectStream();
        } while (stream === original && stream.length && stream[0].offset === processed);
        nodeStack.reverse().forEach(open);
      } else {
        if (stream[0].event === 'start') {
          nodeStack.push(stream[0].node);
        } else {
          nodeStack.pop();
        }
        render(stream.splice(0, 1)[0]);
      }
    }
    return result + escape(value.substr(processed));
  }

  /* Initialization */

  function dependencyOnParent(mode) {
    if (!mode) return false;

    return mode.endsWithParent || dependencyOnParent(mode.starts)
  }

  function expand_or_clone_mode(mode) {
    if (mode.variants && !mode.cached_variants) {
      mode.cached_variants = mode.variants.map(function(variant) {
        return inherit(mode, {variants: null}, variant);
      });
    }

    // EXPAND
    // if we have variants then essentually "replace" the mode with the variants
    // this happens in compileMode, where this function is called from
    if (mode.cached_variants)
      return mode.cached_variants;

    // CLONE
    // if we have dependencies on parents then we need a unique
    // instance of ourselves, so we can be reused with many
    // different parents without issue
    if (dependencyOnParent(mode))
      return [inherit(mode, { starts: mode.starts ? inherit(mode.starts) : null })]

    // no special dependency issues, just return ourselves
    return [mode]
  }

  function restoreLanguageApi(obj) {
    if(API_REPLACES && !obj.langApiRestored) {
      obj.langApiRestored = true;
      for(var key in API_REPLACES)
        obj[key] && (obj[API_REPLACES[key]] = obj[key]);
      (obj.contains || []).concat(obj.variants || []).forEach(restoreLanguageApi);
    }
  }

  function compileKeywords(rawKeywords, case_insensitive) {
      var compiled_keywords = {};

      if (typeof rawKeywords === 'string') { // string
        splitAndCompile('keyword', rawKeywords);
      } else {
        objectKeys(rawKeywords).forEach(function (className) {
          splitAndCompile(className, rawKeywords[className]);
        });
      }
    return compiled_keywords;

    // ---

    function splitAndCompile(className, str) {
      if (case_insensitive) {
        str = str.toLowerCase();
      }
      str.split(' ').forEach(function(keyword) {
        var pair = keyword.split('|');
        compiled_keywords[pair[0]] = [className, scoreForKeyword(pair[0], pair[1])];
      });
    };
  }

  function scoreForKeyword(keyword, providedScore) {
    // manual scores always win over common keywords
    // so you can force a score of 1 if you really insist
    if (providedScore)
      return Number(providedScore)

    return commonKeyword(keyword) ? 0 : 1;
  }

  function commonKeyword(word) {
    return COMMON_KEYWORDS.indexOf(word.toLowerCase()) != -1
  }

  function compileLanguage(language) {

    function reStr(re) {
        return (re && re.source) || re;
    }

    function langRe(value, global) {
      return new RegExp(
        reStr(value),
        'm' + (language.case_insensitive ? 'i' : '') + (global ? 'g' : '')
      );
    }

    function reCountMatchGroups(re) {
      return (new RegExp(re.toString() + '|')).exec('').length - 1;
    }

    // joinRe logically computes regexps.join(separator), but fixes the
    // backreferences so they continue to match.
    // it also places each individual regular expression into it's own
    // match group, keeping track of the sequencing of those match groups
    // is currently an exercise for the caller. :-)
    function joinRe(regexps, separator) {
      // backreferenceRe matches an open parenthesis or backreference. To avoid
      // an incorrect parse, it additionally matches the following:
      // - [...] elements, where the meaning of parentheses and escapes change
      // - other escape sequences, so we do not misparse escape sequences as
      //   interesting elements
      // - non-matching or lookahead parentheses, which do not capture. These
      //   follow the '(' with a '?'.
      var backreferenceRe = /\[(?:[^\\\]]|\\.)*\]|\(\??|\\([1-9][0-9]*)|\\./;
      var numCaptures = 0;
      var ret = '';
      for (var i = 0; i < regexps.length; i++) {
        numCaptures += 1;
        var offset = numCaptures;
        var re = reStr(regexps[i]);
        if (i > 0) {
          ret += separator;
        }
        ret += "(";
        while (re.length > 0) {
          var match = backreferenceRe.exec(re);
          if (match == null) {
            ret += re;
            break;
          }
          ret += re.substring(0, match.index);
          re = re.substring(match.index + match[0].length);
          if (match[0][0] == '\\' && match[1]) {
            // Adjust the backreference.
            ret += '\\' + String(Number(match[1]) + offset);
          } else {
            ret += match[0];
            if (match[0] == '(') {
              numCaptures++;
            }
          }
        }
        ret += ")";
      }
      return ret;
    }

    function buildModeRegex(mode) {

      var matchIndexes = {};
      var matcherRe;
      var regexes = [];
      var matcher = {};
      var matchAt = 1;

      function addRule(rule, regex) {
        matchIndexes[matchAt] = rule;
        regexes.push([rule, regex]);
        matchAt += reCountMatchGroups(regex) + 1;
      }

      var term;
      for (var i=0; i < mode.contains.length; i++) {
        var re;
        term = mode.contains[i];
        if (term.beginKeywords) {
          re = '\\.?(?:' + term.begin + ')\\.?';
        } else {
          re = term.begin;
        }
        addRule(term, re);
      }
      if (mode.terminator_end)
        addRule("end", mode.terminator_end);
      if (mode.illegal)
        addRule("illegal", mode.illegal);

      var terminators = regexes.map(function(el) { return el[1] });
      matcherRe = langRe(joinRe(terminators, '|'), true);

      matcher.lastIndex = 0;
      matcher.exec = function(s) {
        var rule;

        if( regexes.length === 0) return null;

        matcherRe.lastIndex = matcher.lastIndex;
        var match = matcherRe.exec(s);
        if (!match) { return null; }

        for(var i = 0; i<match.length; i++) {
          if (match[i] != undefined && matchIndexes["" +i] != undefined ) {
            rule = matchIndexes[""+i];
            break;
          }
        }

        // illegal or end match
        if (typeof rule === "string") {
          match.type = rule;
          match.extra = [mode.illegal, mode.terminator_end];
        } else {
          match.type = "begin";
          match.rule = rule;
        }
        return match;
      }

      return matcher;
    }

    function compileMode(mode, parent) {
      if (mode.compiled)
        return;
      mode.compiled = true;

      mode.keywords = mode.keywords || mode.beginKeywords;
      if (mode.keywords)
        mode.keywords = compileKeywords(mode.keywords, language.case_insensitive)

      mode.lexemesRe = langRe(mode.lexemes || /\w+/, true);

      if (parent) {
        if (mode.beginKeywords) {
          mode.begin = '\\b(' + mode.beginKeywords.split(' ').join('|') + ')\\b';
        }
        if (!mode.begin)
          mode.begin = /\B|\b/;
        mode.beginRe = langRe(mode.begin);
        if (mode.endSameAsBegin)
          mode.end = mode.begin;
        if (!mode.end && !mode.endsWithParent)
          mode.end = /\B|\b/;
        if (mode.end)
          mode.endRe = langRe(mode.end);
        mode.terminator_end = reStr(mode.end) || '';
        if (mode.endsWithParent && parent.terminator_end)
          mode.terminator_end += (mode.end ? '|' : '') + parent.terminator_end;
      }
      if (mode.illegal)
        mode.illegalRe = langRe(mode.illegal);
      if (mode.relevance == null)
        mode.relevance = 1;
      if (!mode.contains) {
        mode.contains = [];
      }
      mode.contains = Array.prototype.concat.apply([], mode.contains.map(function(c) {
        return expand_or_clone_mode(c === 'self' ? mode : c);
      }));
      mode.contains.forEach(function(c) {compileMode(c, mode);});

      if (mode.starts) {
        compileMode(mode.starts, parent);
      }

      mode.terminators = buildModeRegex(mode);
    }

    compileMode(language);
  }

  /*
  Core highlighting function. Accepts a language name, or an alias, and a
  string with the code to highlight. Returns an object with the following
  properties:

  - relevance (int)
  - value (an HTML string with highlighting markup)

  */
  function highlight(name, value, ignore_illegals, continuation) {

    function escapeRe(value) {
      return new RegExp(value.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&'), 'm');
    }

    function endOfMode(mode, lexeme) {
      if (testRe(mode.endRe, lexeme)) {
        while (mode.endsParent && mode.parent) {
          mode = mode.parent;
        }
        return mode;
      }
      if (mode.endsWithParent) {
        return endOfMode(mode.parent, lexeme);
      }
    }

    function keywordMatch(mode, match) {
      var match_str = language.case_insensitive ? match[0].toLowerCase() : match[0];
      return mode.keywords.hasOwnProperty(match_str) && mode.keywords[match_str];
    }

    function buildSpan(classname, insideSpan, leaveOpen, noPrefix) {
      if (!leaveOpen && insideSpan === '') return '';
      if (!classname) return insideSpan;

      var classPrefix = noPrefix ? '' : options.classPrefix,
          openSpan    = '<span class="' + classPrefix,
          closeSpan   = leaveOpen ? '' : spanEndTag;

      openSpan += classname + '">';

      return openSpan + insideSpan + closeSpan;
    }

    function processKeywords() {
      var keyword_match, last_index, match, result;

      if (!top.keywords)
        return escape(mode_buffer);

      result = '';
      last_index = 0;
      top.lexemesRe.lastIndex = 0;
      match = top.lexemesRe.exec(mode_buffer);

      while (match) {
        result += escape(mode_buffer.substring(last_index, match.index));
        keyword_match = keywordMatch(top, match);
        if (keyword_match) {
          relevance += keyword_match[1];
          result += buildSpan(keyword_match[0], escape(match[0]));
        } else {
          result += escape(match[0]);
        }
        last_index = top.lexemesRe.lastIndex;
        match = top.lexemesRe.exec(mode_buffer);
      }
      return result + escape(mode_buffer.substr(last_index));
    }

    function processSubLanguage() {
      var explicit = typeof top.subLanguage === 'string';
      if (explicit && !languages[top.subLanguage]) {
        return escape(mode_buffer);
      }

      var result = explicit ?
                   highlight(top.subLanguage, mode_buffer, true, continuations[top.subLanguage]) :
                   highlightAuto(mode_buffer, top.subLanguage.length ? top.subLanguage : undefined);

      // Counting embedded language score towards the host language may be disabled
      // with zeroing the containing mode relevance. Usecase in point is Markdown that
      // allows XML everywhere and makes every XML snippet to have a much larger Markdown
      // score.
      if (top.relevance > 0) {
        relevance += result.relevance;
      }
      if (explicit) {
        continuations[top.subLanguage] = result.top;
      }
      return buildSpan(result.language, result.value, false, true);
    }

    function processBuffer() {
      result += (top.subLanguage != null ? processSubLanguage() : processKeywords());
      mode_buffer = '';
    }

    function startNewMode(mode) {
      result += mode.className? buildSpan(mode.className, '', true): '';
      top = Object.create(mode, {parent: {value: top}});
    }


    function doBeginMatch(match) {
      var lexeme = match[0];
      var new_mode = match.rule;

      if (new_mode && new_mode.endSameAsBegin) {
        new_mode.endRe = escapeRe( lexeme );
      }

      if (new_mode.skip) {
        mode_buffer += lexeme;
      } else {
        if (new_mode.excludeBegin) {
          mode_buffer += lexeme;
        }
        processBuffer();
        if (!new_mode.returnBegin && !new_mode.excludeBegin) {
          mode_buffer = lexeme;
        }
      }
      startNewMode(new_mode, lexeme);
      return new_mode.returnBegin ? 0 : lexeme.length;
    }

    function doEndMatch(match) {
      var lexeme = match[0];
      var end_mode = endOfMode(top, lexeme);
      if (!end_mode) { return; }

      var origin = top;
      if (origin.skip) {
        mode_buffer += lexeme;
      } else {
        if (!(origin.returnEnd || origin.excludeEnd)) {
          mode_buffer += lexeme;
        }
        processBuffer();
        if (origin.excludeEnd) {
          mode_buffer = lexeme;
        }
      }
      do {
        if (top.className) {
          result += spanEndTag;
        }
        if (!top.skip && !top.subLanguage) {
          relevance += top.relevance;
        }
        top = top.parent;
      } while (top !== end_mode.parent);
      if (end_mode.starts) {
        if (end_mode.endSameAsBegin) {
          end_mode.starts.endRe = end_mode.endRe;
        }
        startNewMode(end_mode.starts, '');
      }
      return origin.returnEnd ? 0 : lexeme.length;
    }

    var lastMatch = {};
    function processLexeme(text_before_match, match) {

      var lexeme = match && match[0];

      // add non-matched text to the current mode buffer
      mode_buffer += text_before_match;

      if (lexeme == null) {
        processBuffer();
        return 0;
      }

      // we've found a 0 width match and we're stuck, so we need to advance
      // this happens when we have badly behaved rules that have optional matchers to the degree that
      // sometimes they can end up matching nothing at all
      // Ref: https://github.com/highlightjs/highlight.js/issues/2140
      if (lastMatch.type=="begin" && match.type=="end" && lastMatch.index == match.index && lexeme === "") {
        // spit the "skipped" character that our regex choked on back into the output sequence
        mode_buffer += value.slice(match.index, match.index + 1)
        return 1;
      }
      lastMatch = match;

      if (match.type==="begin") {
        return doBeginMatch(match);
      } else if (match.type==="illegal" && !ignore_illegals) {
        // illegal match, we do not continue processing
        throw new Error('Illegal lexeme "' + lexeme + '" for mode "' + (top.className || '<unnamed>') + '"');
      } else if (match.type==="end") {
        var processed = doEndMatch(match);
        if (processed != undefined)
          return processed;
      }

      /*
      Why might be find ourselves here?  Only one occasion now.  An end match that was
      triggered but could not be completed.  When might this happen?  When an `endSameasBegin`
      rule sets the end rule to a specific match.  Since the overall mode termination rule that's
      being used to scan the text isn't recompiled that means that any match that LOOKS like
      the end (but is not, because it is not an exact match to the beginning) will
      end up here.  A definite end match, but when `doEndMatch` tries to "reapply"
      the end rule and fails to match, we wind up here, and just silently ignore the end.

      This causes no real harm other than stopping a few times too many.
      */

      mode_buffer += lexeme;
      return lexeme.length;
    }

    var language = getLanguage(name);
    if (!language) {
      throw new Error('Unknown language: "' + name + '"');
    }

    compileLanguage(language);
    var top = continuation || language;
    var continuations = {}; // keep continuations for sub-languages
    var result = '', current;
    for(current = top; current !== language; current = current.parent) {
      if (current.className) {
        result = buildSpan(current.className, '', true) + result;
      }
    }
    var mode_buffer = '';
    var relevance = 0;
    try {
      var match, count, index = 0;
      while (true) {
        top.terminators.lastIndex = index;
        match = top.terminators.exec(value);
        if (!match)
          break;
        count = processLexeme(value.substring(index, match.index), match);
        index = match.index + count;
      }
      processLexeme(value.substr(index));
      for(current = top; current.parent; current = current.parent) { // close dangling modes
        if (current.className) {
          result += spanEndTag;
        }
      }
      return {
        relevance: relevance,
        value: result,
        illegal:false,
        language: name,
        top: top
      };
    } catch (e) {
      if (e.message && e.message.indexOf('Illegal') !== -1) {
        return {
          illegal: true,
          relevance: 0,
          value: escape(value)
        };
      } else {
        throw e;
      }
    }
  }

  /*
  Highlighting with language detection. Accepts a string with the code to
  highlight. Returns an object with the following properties:

  - language (detected language)
  - relevance (int)
  - value (an HTML string with highlighting markup)
  - second_best (object with the same structure for second-best heuristically
    detected language, may be absent)

  */
  function highlightAuto(text, languageSubset) {
    languageSubset = languageSubset || options.languages || objectKeys(languages);
    var result = {
      relevance: 0,
      value: escape(text)
    };
    var second_best = result;
    languageSubset.filter(getLanguage).filter(autoDetection).forEach(function(name) {
      var current = highlight(name, text, false);
      current.language = name;
      if (current.relevance > second_best.relevance) {
        second_best = current;
      }
      if (current.relevance > result.relevance) {
        second_best = result;
        result = current;
      }
    });
    if (second_best.language) {
      result.second_best = second_best;
    }
    return result;
  }

  /*
  Post-processing of the highlighted markup:

  - replace TABs with something more useful
  - replace real line-breaks with '<br>' for non-pre containers

  */
  function fixMarkup(value) {
    return !(options.tabReplace || options.useBR)
      ? value
      : value.replace(fixMarkupRe, function(match, p1) {
          if (options.useBR && match === '\n') {
            return '<br>';
          } else if (options.tabReplace) {
            return p1.replace(/\t/g, options.tabReplace);
          }
          return '';
      });
  }

  function buildClassName(prevClassName, currentLang, resultLang) {
    var language = currentLang ? aliases[currentLang] : resultLang,
        result   = [prevClassName.trim()];

    if (!prevClassName.match(/\bhljs\b/)) {
      result.push('hljs');
    }

    if (prevClassName.indexOf(language) === -1) {
      result.push(language);
    }

    return result.join(' ').trim();
  }

  /*
  Applies highlighting to a DOM node containing code. Accepts a DOM node and
  two optional parameters for fixMarkup.
  */
  function highlightBlock(block) {
    var node, originalStream, result, resultNode, text;
    var language = blockLanguage(block);

    if (isNotHighlighted(language))
        return;

    if (options.useBR) {
      node = document.createElementNS('http://www.w3.org/1999/xhtml', 'div');
      node.innerHTML = block.innerHTML.replace(/\n/g, '').replace(/<br[ \/]*>/g, '\n');
    } else {
      node = block;
    }
    text = node.textContent;
    result = language ? highlight(language, text, true) : highlightAuto(text);

    originalStream = nodeStream(node);
    if (originalStream.length) {
      resultNode = document.createElementNS('http://www.w3.org/1999/xhtml', 'div');
      resultNode.innerHTML = result.value;
      result.value = mergeStreams(originalStream, nodeStream(resultNode), text);
    }
    result.value = fixMarkup(result.value);

    block.innerHTML = result.value;
    block.className = buildClassName(block.className, language, result.language);
    block.result = {
      language: result.language,
      re: result.relevance
    };
    if (result.second_best) {
      block.second_best = {
        language: result.second_best.language,
        re: result.second_best.relevance
      };
    }
  }

  /*
  Updates highlight.js global options with values passed in the form of an object.
  */
  function configure(user_options) {
    options = inherit(options, user_options);
  }

  /*
  Applies highlighting to all <pre><code>..</code></pre> blocks on a page.
  */
  function initHighlighting() {
    if (initHighlighting.called)
      return;
    initHighlighting.called = true;

    var blocks = document.querySelectorAll('pre code');
    ArrayProto.forEach.call(blocks, highlightBlock);
  }

  /*
  Attaches highlighting to the page load event.
  */
  function initHighlightingOnLoad() {
    addEventListener('DOMContentLoaded', initHighlighting, false);
    addEventListener('load', initHighlighting, false);
  }

  function registerLanguage(name, language) {
    var lang = languages[name] = language(hljs);
    restoreLanguageApi(lang);
    lang.rawDefinition = language.bind(null,hljs);

    if (lang.aliases) {
      lang.aliases.forEach(function(alias) {aliases[alias] = name;});
    }
  }

  function listLanguages() {
    return objectKeys(languages);
  }

  function getLanguage(name) {
    name = (name || '').toLowerCase();
    return languages[name] || languages[aliases[name]];
  }

  function autoDetection(name) {
    var lang = getLanguage(name);
    return lang && !lang.disableAutodetect;
  }

  /* Interface definition */

  hljs.highlight = highlight;
  hljs.highlightAuto = highlightAuto;
  hljs.fixMarkup = fixMarkup;
  hljs.highlightBlock = highlightBlock;
  hljs.configure = configure;
  hljs.initHighlighting = initHighlighting;
  hljs.initHighlightingOnLoad = initHighlightingOnLoad;
  hljs.registerLanguage = registerLanguage;
  hljs.listLanguages = listLanguages;
  hljs.getLanguage = getLanguage;
  hljs.autoDetection = autoDetection;
  hljs.inherit = inherit;

  // Common regexps
  hljs.IDENT_RE = '[a-zA-Z]\\w*';
  hljs.UNDERSCORE_IDENT_RE = '[a-zA-Z_]\\w*';
  hljs.NUMBER_RE = '\\b\\d+(\\.\\d+)?';
  hljs.C_NUMBER_RE = '(-?)(\\b0[xX][a-fA-F0-9]+|(\\b\\d+(\\.\\d*)?|\\.\\d+)([eE][-+]?\\d+)?)'; // 0x..., 0..., decimal, float
  hljs.BINARY_NUMBER_RE = '\\b(0b[01]+)'; // 0b...
  hljs.RE_STARTERS_RE = '!|!=|!==|%|%=|&|&&|&=|\\*|\\*=|\\+|\\+=|,|-|-=|/=|/|:|;|<<|<<=|<=|<|===|==|=|>>>=|>>=|>=|>>>|>>|>|\\?|\\[|\\{|\\(|\\^|\\^=|\\||\\|=|\\|\\||~';

  // Common modes
  hljs.BACKSLASH_ESCAPE = {
    begin: '\\\\[\\s\\S]', relevance: 0
  };
  hljs.APOS_STRING_MODE = {
    className: 'string',
    begin: '\'', end: '\'',
    illegal: '\\n',
    contains: [hljs.BACKSLASH_ESCAPE]
  };
  hljs.QUOTE_STRING_MODE = {
    className: 'string',
    begin: '"', end: '"',
    illegal: '\\n',
    contains: [hljs.BACKSLASH_ESCAPE]
  };
  hljs.PHRASAL_WORDS_MODE = {
    begin: /\b(a|an|the|are|I'm|isn't|don't|doesn't|won't|but|just|should|pretty|simply|enough|gonna|going|wtf|so|such|will|you|your|they|like|more)\b/
  };
  hljs.COMMENT = function (begin, end, inherits) {
    var mode = hljs.inherit(
      {
        className: 'comment',
        begin: begin, end: end,
        contains: []
      },
      inherits || {}
    );
    mode.contains.push(hljs.PHRASAL_WORDS_MODE);
    mode.contains.push({
      className: 'doctag',
      begin: '(?:TODO|FIXME|NOTE|BUG|XXX):',
      relevance: 0
    });
    return mode;
  };
  hljs.C_LINE_COMMENT_MODE = hljs.COMMENT('//', '$');
  hljs.C_BLOCK_COMMENT_MODE = hljs.COMMENT('/\\*', '\\*/');
  hljs.HASH_COMMENT_MODE = hljs.COMMENT('#', '$');
  hljs.NUMBER_MODE = {
    className: 'number',
    begin: hljs.NUMBER_RE,
    relevance: 0
  };
  hljs.C_NUMBER_MODE = {
    className: 'number',
    begin: hljs.C_NUMBER_RE,
    relevance: 0
  };
  hljs.BINARY_NUMBER_MODE = {
    className: 'number',
    begin: hljs.BINARY_NUMBER_RE,
    relevance: 0
  };
  hljs.CSS_NUMBER_MODE = {
    className: 'number',
    begin: hljs.NUMBER_RE + '(' +
      '%|em|ex|ch|rem'  +
      '|vw|vh|vmin|vmax' +
      '|cm|mm|in|pt|pc|px' +
      '|deg|grad|rad|turn' +
      '|s|ms' +
      '|Hz|kHz' +
      '|dpi|dpcm|dppx' +
      ')?',
    relevance: 0
  };
  hljs.REGEXP_MODE = {
    className: 'regexp',
    begin: /\//, end: /\/[gimuy]*/,
    illegal: /\n/,
    contains: [
      hljs.BACKSLASH_ESCAPE,
      {
        begin: /\[/, end: /\]/,
        relevance: 0,
        contains: [hljs.BACKSLASH_ESCAPE]
      }
    ]
  };
  hljs.TITLE_MODE = {
    className: 'title',
    begin: hljs.IDENT_RE,
    relevance: 0
  };
  hljs.UNDERSCORE_TITLE_MODE = {
    className: 'title',
    begin: hljs.UNDERSCORE_IDENT_RE,
    relevance: 0
  };
  hljs.METHOD_GUARD = {
    // excludes method names from keyword processing
    begin: '\\.\\s*' + hljs.UNDERSCORE_IDENT_RE,
    relevance: 0
  };

  return hljs;
}));

},{}],2:[function(require,module,exports){
module.exports = function(hljs) {
  var IDENT_RE = '[A-Za-z$_][0-9A-Za-z$_]*';
  var KEYWORDS = {
    keyword:
      'in of if for while finally var new function do return void else break catch ' +
      'instanceof with throw case default try this switch continue typeof delete ' +
      'let yield const export super debugger as async await static ' +
      // ECMAScript 6 modules import
      'import from as'
    ,
    literal:
      'true false null undefined NaN Infinity',
    built_in:
      'eval isFinite isNaN parseFloat parseInt decodeURI decodeURIComponent ' +
      'encodeURI encodeURIComponent escape unescape Object Function Boolean Error ' +
      'EvalError InternalError RangeError ReferenceError StopIteration SyntaxError ' +
      'TypeError URIError Number Math Date String RegExp Array Float32Array ' +
      'Float64Array Int16Array Int32Array Int8Array Uint16Array Uint32Array ' +
      'Uint8Array Uint8ClampedArray ArrayBuffer DataView JSON Intl arguments require ' +
      'module console window document Symbol Set Map WeakSet WeakMap Proxy Reflect ' +
      'Promise'
  };
  var NUMBER = {
    className: 'number',
    variants: [
      { begin: '\\b(0[bB][01]+)n?' },
      { begin: '\\b(0[oO][0-7]+)n?' },
      { begin: hljs.C_NUMBER_RE + 'n?' }
    ],
    relevance: 0
  };
  var SUBST = {
    className: 'subst',
    begin: '\\$\\{', end: '\\}',
    keywords: KEYWORDS,
    contains: []  // defined later
  };
  var HTML_TEMPLATE = {
    begin: 'html`', end: '',
    starts: {
      end: '`', returnEnd: false,
      contains: [
        hljs.BACKSLASH_ESCAPE,
        SUBST
      ],
      subLanguage: 'xml',
    }
  };
  var CSS_TEMPLATE = {
    begin: 'css`', end: '',
    starts: {
      end: '`', returnEnd: false,
      contains: [
        hljs.BACKSLASH_ESCAPE,
        SUBST
      ],
      subLanguage: 'css',
    }
  };
  var TEMPLATE_STRING = {
    className: 'string',
    begin: '`', end: '`',
    contains: [
      hljs.BACKSLASH_ESCAPE,
      SUBST
    ]
  };
  SUBST.contains = [
    hljs.APOS_STRING_MODE,
    hljs.QUOTE_STRING_MODE,
    HTML_TEMPLATE,
    CSS_TEMPLATE,
    TEMPLATE_STRING,
    NUMBER,
    hljs.REGEXP_MODE
  ];
  var PARAMS_CONTAINS = SUBST.contains.concat([
    hljs.C_BLOCK_COMMENT_MODE,
    hljs.C_LINE_COMMENT_MODE
  ]);

  return {
    aliases: ['js', 'jsx'],
    keywords: KEYWORDS,
    contains: [
      {
        className: 'meta',
        relevance: 10,
        begin: /^\s*['"]use (strict|asm)['"]/
      },
      {
        className: 'meta',
        begin: /^#!/, end: /$/
      },
      hljs.APOS_STRING_MODE,
      hljs.QUOTE_STRING_MODE,
      HTML_TEMPLATE,
      CSS_TEMPLATE,
      TEMPLATE_STRING,
      hljs.C_LINE_COMMENT_MODE,
      hljs.C_BLOCK_COMMENT_MODE,
      NUMBER,
      { // object attr container
        begin: /[{,\n]\s*/, relevance: 0,
        contains: [
          {
            begin: IDENT_RE + '\\s*:', returnBegin: true,
            relevance: 0,
            contains: [{className: 'attr', begin: IDENT_RE, relevance: 0}]
          }
        ]
      },
      { // "value" container
        begin: '(' + hljs.RE_STARTERS_RE + '|\\b(case|return|throw)\\b)\\s*',
        keywords: 'return throw case',
        contains: [
          hljs.C_LINE_COMMENT_MODE,
          hljs.C_BLOCK_COMMENT_MODE,
          hljs.REGEXP_MODE,
          {
            className: 'function',
            begin: '(\\(.*?\\)|' + IDENT_RE + ')\\s*=>', returnBegin: true,
            end: '\\s*=>',
            contains: [
              {
                className: 'params',
                variants: [
                  {
                    begin: IDENT_RE
                  },
                  {
                    begin: /\(\s*\)/,
                  },
                  {
                    begin: /\(/, end: /\)/,
                    excludeBegin: true, excludeEnd: true,
                    keywords: KEYWORDS,
                    contains: PARAMS_CONTAINS
                  }
                ]
              }
            ]
          },
          {
            className: '',
            begin: /\s/,
            end: /\s*/,
            skip: true,
          },
          { // E4X / JSX
            begin: /</, end: /(\/[A-Za-z0-9\\._:-]+|[A-Za-z0-9\\._:-]+\/)>/,
            subLanguage: 'xml',
            contains: [
              { begin: /<[A-Za-z0-9\\._:-]+\s*\/>/, skip: true },
              {
                begin: /<[A-Za-z0-9\\._:-]+/, end: /(\/[A-Za-z0-9\\._:-]+|[A-Za-z0-9\\._:-]+\/)>/, skip: true,
                contains: [
                  { begin: /<[A-Za-z0-9\\._:-]+\s*\/>/, skip: true },
                  'self'
                ]
              }
            ]
          }
        ],
        relevance: 0
      },
      {
        className: 'function',
        beginKeywords: 'function', end: /\{/, excludeEnd: true,
        contains: [
          hljs.inherit(hljs.TITLE_MODE, {begin: IDENT_RE}),
          {
            className: 'params',
            begin: /\(/, end: /\)/,
            excludeBegin: true,
            excludeEnd: true,
            contains: PARAMS_CONTAINS
          }
        ],
        illegal: /\[|%/
      },
      {
        begin: /\$[(.]/ // relevance booster for a pattern common to JS libs: `$(something)` and `$.something`
      },
      hljs.METHOD_GUARD,
      { // ES6 class
        className: 'class',
        beginKeywords: 'class', end: /[{;=]/, excludeEnd: true,
        illegal: /[:"\[\]]/,
        contains: [
          {beginKeywords: 'extends'},
          hljs.UNDERSCORE_TITLE_MODE
        ]
      },
      {
        beginKeywords: 'constructor get set', end: /\{/, excludeEnd: true
      }
    ],
    illegal: /#(?!!)/
  };
};
},{}],3:[function(require,module,exports){
'use strict';

var _highlight = require('highlight.js/lib/highlight');

var _highlight2 = _interopRequireDefault(_highlight);

var _javascript = require('highlight.js/lib/languages/javascript');

var _javascript2 = _interopRequireDefault(_javascript);

var _pageTransition = require('./modules/pageTransition');

var _pageTransition2 = _interopRequireDefault(_pageTransition);

var _hamburger = require('./modules/hamburger');

var _hamburger2 = _interopRequireDefault(_hamburger);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

// import pageScroll from './modules/pageScroll';

// You can write a call and import your functions in this file.
//
// This file will be compiled into app.js and will not be minified.
// Feel free with using ES6 here.

// import {NAME} from './modules/...';
(function ($) {
  // When DOM is ready
  $(function () {
    _pageTransition2.default.transition();
    $('#currentYear').text('' + new Date().getFullYear());
    // pageScroll.smoothScrolling();
    _hamburger2.default.handler();
    _highlight2.default.registerLanguage('javascript', _javascript2.default);
    _highlight2.default.initHighlightingOnLoad();
  });
})(jQuery);

},{"./modules/hamburger":4,"./modules/pageTransition":5,"highlight.js/lib/highlight":1,"highlight.js/lib/languages/javascript":2}],4:[function(require,module,exports){
'use strict';

Object.defineProperty(exports, "__esModule", {
  value: true
});
var hamburger = {
  handler: function handler() {
    var $body = $('body');
    var $btn = $('.hamburger');
    var $menu = $('.menu');
    var $submenu = $('.submenu');
    var $submenuLink = $('.menu__link--submenu');
    var $submenuClose = $('.submenu__item--static');
    var OPENED_CLASS = 'opened';
    var OVERLAY_CLASS = 'overlay';
    function hamburgerToggle() {
      $btn.on('click', function switcher() {
        $(this).toggleClass(OPENED_CLASS);
        $menu.toggleClass(OPENED_CLASS);
        $body.toggleClass(OVERLAY_CLASS);
        $submenu.removeClass(OPENED_CLASS);
      });
    }
    function submenuToggle() {
      $submenuLink.on('click', function (event) {
        event.preventDefault();
        $submenu.toggleClass(OPENED_CLASS);
      });
      $submenuClose.on('click', function (event) {
        event.preventDefault();
        $submenu.toggleClass(OPENED_CLASS);
      });
    }
    function init() {
      if (!$btn.length) return;
      hamburgerToggle();
      if (!$submenu.length) return;
      submenuToggle();
    }
    return {
      init: init()
    };
  }
};

exports.default = hamburger;

},{}],5:[function(require,module,exports){
'use strict';

Object.defineProperty(exports, "__esModule", {
  value: true
});
var pageTransition = {
  transition: function transition() {
    var $body = $('body');
    var $navLink = $('.menu__link');
    var $blogLink = $('.blog__post a');
    var $backLink = $('.back-to-blog');
    function pageOnLoad() {
      $body.fadeIn(1000);
    }
    function fadeOutOnClick(link) {
      link.on('click', function (event) {
        event.preventDefault();
        var linkLocation = this.href;
        $body.fadeOut(1000, function () {
          window.location = linkLocation;
        });
      });
    }
    function init() {
      if (!$body.length) return;
      $(window).on('load', pageOnLoad());
      fadeOutOnClick($navLink);
      fadeOutOnClick($blogLink);
      fadeOutOnClick($backLink);
    }
    return {
      init: init()
    };
  }
};

exports.default = pageTransition;

},{}]},{},[3])
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIm5vZGVfbW9kdWxlcy9icm93c2VyLXBhY2svX3ByZWx1ZGUuanMiLCJub2RlX21vZHVsZXMvaGlnaGxpZ2h0LmpzL2xpYi9oaWdobGlnaHQuanMiLCJub2RlX21vZHVsZXMvaGlnaGxpZ2h0LmpzL2xpYi9sYW5ndWFnZXMvamF2YXNjcmlwdC5qcyIsInRoZW1lcy9wcm9qZWN0X3RoZW1lL3NyYy9qcy9hcHAuanMiLCJ0aGVtZXMvcHJvamVjdF90aGVtZS9zcmMvanMvbW9kdWxlcy9oYW1idXJnZXIuanMiLCJ0aGVtZXMvcHJvamVjdF90aGVtZS9zcmMvanMvbW9kdWxlcy9wYWdlVHJhbnNpdGlvbi5qcyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTtBQ0FBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDdGdDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7Ozs7QUNsTUE7Ozs7QUFDQTs7OztBQUNBOzs7O0FBQ0E7Ozs7OztBQUNBOztBQVZBO0FBQ0E7QUFDQTtBQUNBOztBQUVBO0FBT0EsQ0FBQyxVQUFDLENBQUQsRUFBTztBQUNOO0FBQ0EsSUFBRSxZQUFNO0FBQ04sNkJBQWUsVUFBZjtBQUNBLE1BQUUsY0FBRixFQUFrQixJQUFsQixNQUEwQixJQUFJLElBQUosR0FBVyxXQUFYLEVBQTFCO0FBQ0E7QUFDQSx3QkFBVSxPQUFWO0FBQ0Esd0JBQUssZ0JBQUwsQ0FBc0IsWUFBdEIsRUFBb0Msb0JBQXBDO0FBQ0Esd0JBQUssc0JBQUw7QUFDRCxHQVBEO0FBUUQsQ0FWRCxFQVVHLE1BVkg7Ozs7Ozs7O0FDWkEsSUFBTSxZQUFZO0FBQ2hCLFNBRGdCLHFCQUNOO0FBQ1IsUUFBTSxRQUFRLEVBQUUsTUFBRixDQUFkO0FBQ0EsUUFBTSxPQUFPLEVBQUUsWUFBRixDQUFiO0FBQ0EsUUFBTSxRQUFRLEVBQUUsT0FBRixDQUFkO0FBQ0EsUUFBTSxXQUFXLEVBQUUsVUFBRixDQUFqQjtBQUNBLFFBQU0sZUFBZSxFQUFFLHNCQUFGLENBQXJCO0FBQ0EsUUFBTSxnQkFBZ0IsRUFBRSx3QkFBRixDQUF0QjtBQUNBLFFBQU0sZUFBZSxRQUFyQjtBQUNBLFFBQU0sZ0JBQWdCLFNBQXRCO0FBQ0EsYUFBUyxlQUFULEdBQTJCO0FBQ3pCLFdBQUssRUFBTCxDQUFRLE9BQVIsRUFBaUIsU0FBUyxRQUFULEdBQW9CO0FBQ25DLFVBQUUsSUFBRixFQUFRLFdBQVIsQ0FBb0IsWUFBcEI7QUFDQSxjQUFNLFdBQU4sQ0FBa0IsWUFBbEI7QUFDQSxjQUFNLFdBQU4sQ0FBa0IsYUFBbEI7QUFDQSxpQkFBUyxXQUFULENBQXFCLFlBQXJCO0FBQ0QsT0FMRDtBQU1EO0FBQ0QsYUFBUyxhQUFULEdBQXlCO0FBQ3ZCLG1CQUFhLEVBQWIsQ0FBZ0IsT0FBaEIsRUFBeUIsVUFBQyxLQUFELEVBQVc7QUFDbEMsY0FBTSxjQUFOO0FBQ0EsaUJBQVMsV0FBVCxDQUFxQixZQUFyQjtBQUNELE9BSEQ7QUFJQSxvQkFBYyxFQUFkLENBQWlCLE9BQWpCLEVBQTBCLFVBQUMsS0FBRCxFQUFXO0FBQ25DLGNBQU0sY0FBTjtBQUNBLGlCQUFTLFdBQVQsQ0FBcUIsWUFBckI7QUFDRCxPQUhEO0FBSUQ7QUFDRCxhQUFTLElBQVQsR0FBZ0I7QUFDZCxVQUFJLENBQUMsS0FBSyxNQUFWLEVBQWtCO0FBQ2xCO0FBQ0EsVUFBSSxDQUFDLFNBQVMsTUFBZCxFQUFzQjtBQUN0QjtBQUNEO0FBQ0QsV0FBTztBQUNMLFlBQU07QUFERCxLQUFQO0FBR0Q7QUFyQ2UsQ0FBbEI7O2tCQXdDZSxTOzs7Ozs7OztBQ3hDZixJQUFNLGlCQUFpQjtBQUNyQixZQURxQix3QkFDUjtBQUNYLFFBQU0sUUFBUSxFQUFFLE1BQUYsQ0FBZDtBQUNBLFFBQU0sV0FBVyxFQUFFLGFBQUYsQ0FBakI7QUFDQSxRQUFNLFlBQVksRUFBRSxlQUFGLENBQWxCO0FBQ0EsUUFBTSxZQUFZLEVBQUUsZUFBRixDQUFsQjtBQUNBLGFBQVMsVUFBVCxHQUFzQjtBQUNwQixZQUFNLE1BQU4sQ0FBYSxJQUFiO0FBQ0Q7QUFDRCxhQUFTLGNBQVQsQ0FBd0IsSUFBeEIsRUFBOEI7QUFDNUIsV0FBSyxFQUFMLENBQVEsT0FBUixFQUFpQixVQUFVLEtBQVYsRUFBaUI7QUFDaEMsY0FBTSxjQUFOO0FBQ0EsWUFBTSxlQUFlLEtBQUssSUFBMUI7QUFDQSxjQUFNLE9BQU4sQ0FBYyxJQUFkLEVBQW9CLFlBQU07QUFDeEIsaUJBQU8sUUFBUCxHQUFrQixZQUFsQjtBQUNELFNBRkQ7QUFHRCxPQU5EO0FBT0Q7QUFDRCxhQUFTLElBQVQsR0FBZ0I7QUFDZCxVQUFJLENBQUMsTUFBTSxNQUFYLEVBQW1CO0FBQ25CLFFBQUUsTUFBRixFQUFVLEVBQVYsQ0FBYSxNQUFiLEVBQXFCLFlBQXJCO0FBQ0EscUJBQWUsUUFBZjtBQUNBLHFCQUFlLFNBQWY7QUFDQSxxQkFBZSxTQUFmO0FBQ0Q7QUFDRCxXQUFPO0FBQ0wsWUFBTTtBQURELEtBQVA7QUFHRDtBQTVCb0IsQ0FBdkI7O2tCQStCZSxjIiwiZmlsZSI6ImdlbmVyYXRlZC5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzQ29udGVudCI6WyIoZnVuY3Rpb24oKXtmdW5jdGlvbiByKGUsbix0KXtmdW5jdGlvbiBvKGksZil7aWYoIW5baV0pe2lmKCFlW2ldKXt2YXIgYz1cImZ1bmN0aW9uXCI9PXR5cGVvZiByZXF1aXJlJiZyZXF1aXJlO2lmKCFmJiZjKXJldHVybiBjKGksITApO2lmKHUpcmV0dXJuIHUoaSwhMCk7dmFyIGE9bmV3IEVycm9yKFwiQ2Fubm90IGZpbmQgbW9kdWxlICdcIitpK1wiJ1wiKTt0aHJvdyBhLmNvZGU9XCJNT0RVTEVfTk9UX0ZPVU5EXCIsYX12YXIgcD1uW2ldPXtleHBvcnRzOnt9fTtlW2ldWzBdLmNhbGwocC5leHBvcnRzLGZ1bmN0aW9uKHIpe3ZhciBuPWVbaV1bMV1bcl07cmV0dXJuIG8obnx8cil9LHAscC5leHBvcnRzLHIsZSxuLHQpfXJldHVybiBuW2ldLmV4cG9ydHN9Zm9yKHZhciB1PVwiZnVuY3Rpb25cIj09dHlwZW9mIHJlcXVpcmUmJnJlcXVpcmUsaT0wO2k8dC5sZW5ndGg7aSsrKW8odFtpXSk7cmV0dXJuIG99cmV0dXJuIHJ9KSgpIiwiLypcblN5bnRheCBoaWdobGlnaHRpbmcgd2l0aCBsYW5ndWFnZSBhdXRvZGV0ZWN0aW9uLlxuaHR0cHM6Ly9oaWdobGlnaHRqcy5vcmcvXG4qL1xuXG4oZnVuY3Rpb24oZmFjdG9yeSkge1xuXG4gIC8vIEZpbmQgdGhlIGdsb2JhbCBvYmplY3QgZm9yIGV4cG9ydCB0byBib3RoIHRoZSBicm93c2VyIGFuZCB3ZWIgd29ya2Vycy5cbiAgdmFyIGdsb2JhbE9iamVjdCA9IHR5cGVvZiB3aW5kb3cgPT09ICdvYmplY3QnICYmIHdpbmRvdyB8fFxuICAgICAgICAgICAgICAgICAgICAgdHlwZW9mIHNlbGYgPT09ICdvYmplY3QnICYmIHNlbGY7XG5cbiAgLy8gU2V0dXAgaGlnaGxpZ2h0LmpzIGZvciBkaWZmZXJlbnQgZW52aXJvbm1lbnRzLiBGaXJzdCBpcyBOb2RlLmpzIG9yXG4gIC8vIENvbW1vbkpTLlxuICAvLyBgbm9kZVR5cGVgIGlzIGNoZWNrZWQgdG8gZW5zdXJlIHRoYXQgYGV4cG9ydHNgIGlzIG5vdCBhIEhUTUwgZWxlbWVudC5cbiAgaWYodHlwZW9mIGV4cG9ydHMgIT09ICd1bmRlZmluZWQnICYmICFleHBvcnRzLm5vZGVUeXBlKSB7XG4gICAgZmFjdG9yeShleHBvcnRzKTtcbiAgfSBlbHNlIGlmKGdsb2JhbE9iamVjdCkge1xuICAgIC8vIEV4cG9ydCBobGpzIGdsb2JhbGx5IGV2ZW4gd2hlbiB1c2luZyBBTUQgZm9yIGNhc2VzIHdoZW4gdGhpcyBzY3JpcHRcbiAgICAvLyBpcyBsb2FkZWQgd2l0aCBvdGhlcnMgdGhhdCBtYXkgc3RpbGwgZXhwZWN0IGEgZ2xvYmFsIGhsanMuXG4gICAgZ2xvYmFsT2JqZWN0LmhsanMgPSBmYWN0b3J5KHt9KTtcblxuICAgIC8vIEZpbmFsbHkgcmVnaXN0ZXIgdGhlIGdsb2JhbCBobGpzIHdpdGggQU1ELlxuICAgIGlmKHR5cGVvZiBkZWZpbmUgPT09ICdmdW5jdGlvbicgJiYgZGVmaW5lLmFtZCkge1xuICAgICAgZGVmaW5lKFtdLCBmdW5jdGlvbigpIHtcbiAgICAgICAgcmV0dXJuIGdsb2JhbE9iamVjdC5obGpzO1xuICAgICAgfSk7XG4gICAgfVxuICB9XG5cbn0oZnVuY3Rpb24oaGxqcykge1xuICAvLyBDb252ZW5pZW5jZSB2YXJpYWJsZXMgZm9yIGJ1aWxkLWluIG9iamVjdHNcbiAgdmFyIEFycmF5UHJvdG8gPSBbXSxcbiAgICAgIG9iamVjdEtleXMgPSBPYmplY3Qua2V5cztcblxuICAvLyBHbG9iYWwgaW50ZXJuYWwgdmFyaWFibGVzIHVzZWQgd2l0aGluIHRoZSBoaWdobGlnaHQuanMgbGlicmFyeS5cbiAgdmFyIGxhbmd1YWdlcyA9IHt9LFxuICAgICAgYWxpYXNlcyAgID0ge307XG5cbiAgLy8gUmVndWxhciBleHByZXNzaW9ucyB1c2VkIHRocm91Z2hvdXQgdGhlIGhpZ2hsaWdodC5qcyBsaWJyYXJ5LlxuICB2YXIgbm9IaWdobGlnaHRSZSAgICA9IC9eKG5vLT9oaWdobGlnaHR8cGxhaW58dGV4dCkkL2ksXG4gICAgICBsYW5ndWFnZVByZWZpeFJlID0gL1xcYmxhbmcoPzp1YWdlKT8tKFtcXHctXSspXFxiL2ksXG4gICAgICBmaXhNYXJrdXBSZSAgICAgID0gLygoXig8W14+XSs+fFxcdHwpK3woPzpcXG4pKSkvZ207XG5cbiAgLy8gVGhlIG9iamVjdCB3aWxsIGJlIGFzc2lnbmVkIGJ5IHRoZSBidWlsZCB0b29sLiBJdCB1c2VkIHRvIHN5bmNocm9uaXplIEFQSVxuICAvLyBvZiBleHRlcm5hbCBsYW5ndWFnZSBmaWxlcyB3aXRoIG1pbmlmaWVkIHZlcnNpb24gb2YgdGhlIGhpZ2hsaWdodC5qcyBsaWJyYXJ5LlxuICB2YXIgQVBJX1JFUExBQ0VTO1xuXG4gIHZhciBzcGFuRW5kVGFnID0gJzwvc3Bhbj4nO1xuXG4gIC8vIEdsb2JhbCBvcHRpb25zIHVzZWQgd2hlbiB3aXRoaW4gZXh0ZXJuYWwgQVBJcy4gVGhpcyBpcyBtb2RpZmllZCB3aGVuXG4gIC8vIGNhbGxpbmcgdGhlIGBobGpzLmNvbmZpZ3VyZWAgZnVuY3Rpb24uXG4gIHZhciBvcHRpb25zID0ge1xuICAgIGNsYXNzUHJlZml4OiAnaGxqcy0nLFxuICAgIHRhYlJlcGxhY2U6IG51bGwsXG4gICAgdXNlQlI6IGZhbHNlLFxuICAgIGxhbmd1YWdlczogdW5kZWZpbmVkXG4gIH07XG5cbiAgLy8ga2V5d29yZHMgdGhhdCBzaG91bGQgaGF2ZSBubyBkZWZhdWx0IHJlbGV2YW5jZSB2YWx1ZVxuICB2YXIgQ09NTU9OX0tFWVdPUkRTID0gJ29mIGFuZCBmb3IgaW4gbm90IG9yIGlmIHRoZW4nLnNwbGl0KCcgJylcblxuXG4gIC8qIFV0aWxpdHkgZnVuY3Rpb25zICovXG5cbiAgZnVuY3Rpb24gZXNjYXBlKHZhbHVlKSB7XG4gICAgcmV0dXJuIHZhbHVlLnJlcGxhY2UoLyYvZywgJyZhbXA7JykucmVwbGFjZSgvPC9nLCAnJmx0OycpLnJlcGxhY2UoLz4vZywgJyZndDsnKTtcbiAgfVxuXG4gIGZ1bmN0aW9uIHRhZyhub2RlKSB7XG4gICAgcmV0dXJuIG5vZGUubm9kZU5hbWUudG9Mb3dlckNhc2UoKTtcbiAgfVxuXG4gIGZ1bmN0aW9uIHRlc3RSZShyZSwgbGV4ZW1lKSB7XG4gICAgdmFyIG1hdGNoID0gcmUgJiYgcmUuZXhlYyhsZXhlbWUpO1xuICAgIHJldHVybiBtYXRjaCAmJiBtYXRjaC5pbmRleCA9PT0gMDtcbiAgfVxuXG4gIGZ1bmN0aW9uIGlzTm90SGlnaGxpZ2h0ZWQobGFuZ3VhZ2UpIHtcbiAgICByZXR1cm4gbm9IaWdobGlnaHRSZS50ZXN0KGxhbmd1YWdlKTtcbiAgfVxuXG4gIGZ1bmN0aW9uIGJsb2NrTGFuZ3VhZ2UoYmxvY2spIHtcbiAgICB2YXIgaSwgbWF0Y2gsIGxlbmd0aCwgX2NsYXNzO1xuICAgIHZhciBjbGFzc2VzID0gYmxvY2suY2xhc3NOYW1lICsgJyAnO1xuXG4gICAgY2xhc3NlcyArPSBibG9jay5wYXJlbnROb2RlID8gYmxvY2sucGFyZW50Tm9kZS5jbGFzc05hbWUgOiAnJztcblxuICAgIC8vIGxhbmd1YWdlLSogdGFrZXMgcHJlY2VkZW5jZSBvdmVyIG5vbi1wcmVmaXhlZCBjbGFzcyBuYW1lcy5cbiAgICBtYXRjaCA9IGxhbmd1YWdlUHJlZml4UmUuZXhlYyhjbGFzc2VzKTtcbiAgICBpZiAobWF0Y2gpIHtcbiAgICAgIHJldHVybiBnZXRMYW5ndWFnZShtYXRjaFsxXSkgPyBtYXRjaFsxXSA6ICduby1oaWdobGlnaHQnO1xuICAgIH1cblxuICAgIGNsYXNzZXMgPSBjbGFzc2VzLnNwbGl0KC9cXHMrLyk7XG5cbiAgICBmb3IgKGkgPSAwLCBsZW5ndGggPSBjbGFzc2VzLmxlbmd0aDsgaSA8IGxlbmd0aDsgaSsrKSB7XG4gICAgICBfY2xhc3MgPSBjbGFzc2VzW2ldO1xuXG4gICAgICBpZiAoaXNOb3RIaWdobGlnaHRlZChfY2xhc3MpIHx8IGdldExhbmd1YWdlKF9jbGFzcykpIHtcbiAgICAgICAgcmV0dXJuIF9jbGFzcztcbiAgICAgIH1cbiAgICB9XG4gIH1cblxuICBmdW5jdGlvbiBpbmhlcml0KHBhcmVudCkgeyAgLy8gaW5oZXJpdChwYXJlbnQsIG92ZXJyaWRlX29iaiwgb3ZlcnJpZGVfb2JqLCAuLi4pXG4gICAgdmFyIGtleTtcbiAgICB2YXIgcmVzdWx0ID0ge307XG4gICAgdmFyIG9iamVjdHMgPSBBcnJheS5wcm90b3R5cGUuc2xpY2UuY2FsbChhcmd1bWVudHMsIDEpO1xuXG4gICAgZm9yIChrZXkgaW4gcGFyZW50KVxuICAgICAgcmVzdWx0W2tleV0gPSBwYXJlbnRba2V5XTtcbiAgICBvYmplY3RzLmZvckVhY2goZnVuY3Rpb24ob2JqKSB7XG4gICAgICBmb3IgKGtleSBpbiBvYmopXG4gICAgICAgIHJlc3VsdFtrZXldID0gb2JqW2tleV07XG4gICAgfSk7XG4gICAgcmV0dXJuIHJlc3VsdDtcbiAgfVxuXG4gIC8qIFN0cmVhbSBtZXJnaW5nICovXG5cbiAgZnVuY3Rpb24gbm9kZVN0cmVhbShub2RlKSB7XG4gICAgdmFyIHJlc3VsdCA9IFtdO1xuICAgIChmdW5jdGlvbiBfbm9kZVN0cmVhbShub2RlLCBvZmZzZXQpIHtcbiAgICAgIGZvciAodmFyIGNoaWxkID0gbm9kZS5maXJzdENoaWxkOyBjaGlsZDsgY2hpbGQgPSBjaGlsZC5uZXh0U2libGluZykge1xuICAgICAgICBpZiAoY2hpbGQubm9kZVR5cGUgPT09IDMpXG4gICAgICAgICAgb2Zmc2V0ICs9IGNoaWxkLm5vZGVWYWx1ZS5sZW5ndGg7XG4gICAgICAgIGVsc2UgaWYgKGNoaWxkLm5vZGVUeXBlID09PSAxKSB7XG4gICAgICAgICAgcmVzdWx0LnB1c2goe1xuICAgICAgICAgICAgZXZlbnQ6ICdzdGFydCcsXG4gICAgICAgICAgICBvZmZzZXQ6IG9mZnNldCxcbiAgICAgICAgICAgIG5vZGU6IGNoaWxkXG4gICAgICAgICAgfSk7XG4gICAgICAgICAgb2Zmc2V0ID0gX25vZGVTdHJlYW0oY2hpbGQsIG9mZnNldCk7XG4gICAgICAgICAgLy8gUHJldmVudCB2b2lkIGVsZW1lbnRzIGZyb20gaGF2aW5nIGFuIGVuZCB0YWcgdGhhdCB3b3VsZCBhY3R1YWxseVxuICAgICAgICAgIC8vIGRvdWJsZSB0aGVtIGluIHRoZSBvdXRwdXQuIFRoZXJlIGFyZSBtb3JlIHZvaWQgZWxlbWVudHMgaW4gSFRNTFxuICAgICAgICAgIC8vIGJ1dCB3ZSBsaXN0IG9ubHkgdGhvc2UgcmVhbGlzdGljYWxseSBleHBlY3RlZCBpbiBjb2RlIGRpc3BsYXkuXG4gICAgICAgICAgaWYgKCF0YWcoY2hpbGQpLm1hdGNoKC9icnxocnxpbWd8aW5wdXQvKSkge1xuICAgICAgICAgICAgcmVzdWx0LnB1c2goe1xuICAgICAgICAgICAgICBldmVudDogJ3N0b3AnLFxuICAgICAgICAgICAgICBvZmZzZXQ6IG9mZnNldCxcbiAgICAgICAgICAgICAgbm9kZTogY2hpbGRcbiAgICAgICAgICAgIH0pO1xuICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgfVxuICAgICAgcmV0dXJuIG9mZnNldDtcbiAgICB9KShub2RlLCAwKTtcbiAgICByZXR1cm4gcmVzdWx0O1xuICB9XG5cbiAgZnVuY3Rpb24gbWVyZ2VTdHJlYW1zKG9yaWdpbmFsLCBoaWdobGlnaHRlZCwgdmFsdWUpIHtcbiAgICB2YXIgcHJvY2Vzc2VkID0gMDtcbiAgICB2YXIgcmVzdWx0ID0gJyc7XG4gICAgdmFyIG5vZGVTdGFjayA9IFtdO1xuXG4gICAgZnVuY3Rpb24gc2VsZWN0U3RyZWFtKCkge1xuICAgICAgaWYgKCFvcmlnaW5hbC5sZW5ndGggfHwgIWhpZ2hsaWdodGVkLmxlbmd0aCkge1xuICAgICAgICByZXR1cm4gb3JpZ2luYWwubGVuZ3RoID8gb3JpZ2luYWwgOiBoaWdobGlnaHRlZDtcbiAgICAgIH1cbiAgICAgIGlmIChvcmlnaW5hbFswXS5vZmZzZXQgIT09IGhpZ2hsaWdodGVkWzBdLm9mZnNldCkge1xuICAgICAgICByZXR1cm4gKG9yaWdpbmFsWzBdLm9mZnNldCA8IGhpZ2hsaWdodGVkWzBdLm9mZnNldCkgPyBvcmlnaW5hbCA6IGhpZ2hsaWdodGVkO1xuICAgICAgfVxuXG4gICAgICAvKlxuICAgICAgVG8gYXZvaWQgc3RhcnRpbmcgdGhlIHN0cmVhbSBqdXN0IGJlZm9yZSBpdCBzaG91bGQgc3RvcCB0aGUgb3JkZXIgaXNcbiAgICAgIGVuc3VyZWQgdGhhdCBvcmlnaW5hbCBhbHdheXMgc3RhcnRzIGZpcnN0IGFuZCBjbG9zZXMgbGFzdDpcblxuICAgICAgaWYgKGV2ZW50MSA9PSAnc3RhcnQnICYmIGV2ZW50MiA9PSAnc3RhcnQnKVxuICAgICAgICByZXR1cm4gb3JpZ2luYWw7XG4gICAgICBpZiAoZXZlbnQxID09ICdzdGFydCcgJiYgZXZlbnQyID09ICdzdG9wJylcbiAgICAgICAgcmV0dXJuIGhpZ2hsaWdodGVkO1xuICAgICAgaWYgKGV2ZW50MSA9PSAnc3RvcCcgJiYgZXZlbnQyID09ICdzdGFydCcpXG4gICAgICAgIHJldHVybiBvcmlnaW5hbDtcbiAgICAgIGlmIChldmVudDEgPT0gJ3N0b3AnICYmIGV2ZW50MiA9PSAnc3RvcCcpXG4gICAgICAgIHJldHVybiBoaWdobGlnaHRlZDtcblxuICAgICAgLi4uIHdoaWNoIGlzIGNvbGxhcHNlZCB0bzpcbiAgICAgICovXG4gICAgICByZXR1cm4gaGlnaGxpZ2h0ZWRbMF0uZXZlbnQgPT09ICdzdGFydCcgPyBvcmlnaW5hbCA6IGhpZ2hsaWdodGVkO1xuICAgIH1cblxuICAgIGZ1bmN0aW9uIG9wZW4obm9kZSkge1xuICAgICAgZnVuY3Rpb24gYXR0cl9zdHIoYSkge3JldHVybiAnICcgKyBhLm5vZGVOYW1lICsgJz1cIicgKyBlc2NhcGUoYS52YWx1ZSkucmVwbGFjZSgnXCInLCAnJnF1b3Q7JykgKyAnXCInO31cbiAgICAgIHJlc3VsdCArPSAnPCcgKyB0YWcobm9kZSkgKyBBcnJheVByb3RvLm1hcC5jYWxsKG5vZGUuYXR0cmlidXRlcywgYXR0cl9zdHIpLmpvaW4oJycpICsgJz4nO1xuICAgIH1cblxuICAgIGZ1bmN0aW9uIGNsb3NlKG5vZGUpIHtcbiAgICAgIHJlc3VsdCArPSAnPC8nICsgdGFnKG5vZGUpICsgJz4nO1xuICAgIH1cblxuICAgIGZ1bmN0aW9uIHJlbmRlcihldmVudCkge1xuICAgICAgKGV2ZW50LmV2ZW50ID09PSAnc3RhcnQnID8gb3BlbiA6IGNsb3NlKShldmVudC5ub2RlKTtcbiAgICB9XG5cbiAgICB3aGlsZSAob3JpZ2luYWwubGVuZ3RoIHx8IGhpZ2hsaWdodGVkLmxlbmd0aCkge1xuICAgICAgdmFyIHN0cmVhbSA9IHNlbGVjdFN0cmVhbSgpO1xuICAgICAgcmVzdWx0ICs9IGVzY2FwZSh2YWx1ZS5zdWJzdHJpbmcocHJvY2Vzc2VkLCBzdHJlYW1bMF0ub2Zmc2V0KSk7XG4gICAgICBwcm9jZXNzZWQgPSBzdHJlYW1bMF0ub2Zmc2V0O1xuICAgICAgaWYgKHN0cmVhbSA9PT0gb3JpZ2luYWwpIHtcbiAgICAgICAgLypcbiAgICAgICAgT24gYW55IG9wZW5pbmcgb3IgY2xvc2luZyB0YWcgb2YgdGhlIG9yaWdpbmFsIG1hcmt1cCB3ZSBmaXJzdCBjbG9zZVxuICAgICAgICB0aGUgZW50aXJlIGhpZ2hsaWdodGVkIG5vZGUgc3RhY2ssIHRoZW4gcmVuZGVyIHRoZSBvcmlnaW5hbCB0YWcgYWxvbmdcbiAgICAgICAgd2l0aCBhbGwgdGhlIGZvbGxvd2luZyBvcmlnaW5hbCB0YWdzIGF0IHRoZSBzYW1lIG9mZnNldCBhbmQgdGhlblxuICAgICAgICByZW9wZW4gYWxsIHRoZSB0YWdzIG9uIHRoZSBoaWdobGlnaHRlZCBzdGFjay5cbiAgICAgICAgKi9cbiAgICAgICAgbm9kZVN0YWNrLnJldmVyc2UoKS5mb3JFYWNoKGNsb3NlKTtcbiAgICAgICAgZG8ge1xuICAgICAgICAgIHJlbmRlcihzdHJlYW0uc3BsaWNlKDAsIDEpWzBdKTtcbiAgICAgICAgICBzdHJlYW0gPSBzZWxlY3RTdHJlYW0oKTtcbiAgICAgICAgfSB3aGlsZSAoc3RyZWFtID09PSBvcmlnaW5hbCAmJiBzdHJlYW0ubGVuZ3RoICYmIHN0cmVhbVswXS5vZmZzZXQgPT09IHByb2Nlc3NlZCk7XG4gICAgICAgIG5vZGVTdGFjay5yZXZlcnNlKCkuZm9yRWFjaChvcGVuKTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIGlmIChzdHJlYW1bMF0uZXZlbnQgPT09ICdzdGFydCcpIHtcbiAgICAgICAgICBub2RlU3RhY2sucHVzaChzdHJlYW1bMF0ubm9kZSk7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgbm9kZVN0YWNrLnBvcCgpO1xuICAgICAgICB9XG4gICAgICAgIHJlbmRlcihzdHJlYW0uc3BsaWNlKDAsIDEpWzBdKTtcbiAgICAgIH1cbiAgICB9XG4gICAgcmV0dXJuIHJlc3VsdCArIGVzY2FwZSh2YWx1ZS5zdWJzdHIocHJvY2Vzc2VkKSk7XG4gIH1cblxuICAvKiBJbml0aWFsaXphdGlvbiAqL1xuXG4gIGZ1bmN0aW9uIGRlcGVuZGVuY3lPblBhcmVudChtb2RlKSB7XG4gICAgaWYgKCFtb2RlKSByZXR1cm4gZmFsc2U7XG5cbiAgICByZXR1cm4gbW9kZS5lbmRzV2l0aFBhcmVudCB8fCBkZXBlbmRlbmN5T25QYXJlbnQobW9kZS5zdGFydHMpXG4gIH1cblxuICBmdW5jdGlvbiBleHBhbmRfb3JfY2xvbmVfbW9kZShtb2RlKSB7XG4gICAgaWYgKG1vZGUudmFyaWFudHMgJiYgIW1vZGUuY2FjaGVkX3ZhcmlhbnRzKSB7XG4gICAgICBtb2RlLmNhY2hlZF92YXJpYW50cyA9IG1vZGUudmFyaWFudHMubWFwKGZ1bmN0aW9uKHZhcmlhbnQpIHtcbiAgICAgICAgcmV0dXJuIGluaGVyaXQobW9kZSwge3ZhcmlhbnRzOiBudWxsfSwgdmFyaWFudCk7XG4gICAgICB9KTtcbiAgICB9XG5cbiAgICAvLyBFWFBBTkRcbiAgICAvLyBpZiB3ZSBoYXZlIHZhcmlhbnRzIHRoZW4gZXNzZW50dWFsbHkgXCJyZXBsYWNlXCIgdGhlIG1vZGUgd2l0aCB0aGUgdmFyaWFudHNcbiAgICAvLyB0aGlzIGhhcHBlbnMgaW4gY29tcGlsZU1vZGUsIHdoZXJlIHRoaXMgZnVuY3Rpb24gaXMgY2FsbGVkIGZyb21cbiAgICBpZiAobW9kZS5jYWNoZWRfdmFyaWFudHMpXG4gICAgICByZXR1cm4gbW9kZS5jYWNoZWRfdmFyaWFudHM7XG5cbiAgICAvLyBDTE9ORVxuICAgIC8vIGlmIHdlIGhhdmUgZGVwZW5kZW5jaWVzIG9uIHBhcmVudHMgdGhlbiB3ZSBuZWVkIGEgdW5pcXVlXG4gICAgLy8gaW5zdGFuY2Ugb2Ygb3Vyc2VsdmVzLCBzbyB3ZSBjYW4gYmUgcmV1c2VkIHdpdGggbWFueVxuICAgIC8vIGRpZmZlcmVudCBwYXJlbnRzIHdpdGhvdXQgaXNzdWVcbiAgICBpZiAoZGVwZW5kZW5jeU9uUGFyZW50KG1vZGUpKVxuICAgICAgcmV0dXJuIFtpbmhlcml0KG1vZGUsIHsgc3RhcnRzOiBtb2RlLnN0YXJ0cyA/IGluaGVyaXQobW9kZS5zdGFydHMpIDogbnVsbCB9KV1cblxuICAgIC8vIG5vIHNwZWNpYWwgZGVwZW5kZW5jeSBpc3N1ZXMsIGp1c3QgcmV0dXJuIG91cnNlbHZlc1xuICAgIHJldHVybiBbbW9kZV1cbiAgfVxuXG4gIGZ1bmN0aW9uIHJlc3RvcmVMYW5ndWFnZUFwaShvYmopIHtcbiAgICBpZihBUElfUkVQTEFDRVMgJiYgIW9iai5sYW5nQXBpUmVzdG9yZWQpIHtcbiAgICAgIG9iai5sYW5nQXBpUmVzdG9yZWQgPSB0cnVlO1xuICAgICAgZm9yKHZhciBrZXkgaW4gQVBJX1JFUExBQ0VTKVxuICAgICAgICBvYmpba2V5XSAmJiAob2JqW0FQSV9SRVBMQUNFU1trZXldXSA9IG9ialtrZXldKTtcbiAgICAgIChvYmouY29udGFpbnMgfHwgW10pLmNvbmNhdChvYmoudmFyaWFudHMgfHwgW10pLmZvckVhY2gocmVzdG9yZUxhbmd1YWdlQXBpKTtcbiAgICB9XG4gIH1cblxuICBmdW5jdGlvbiBjb21waWxlS2V5d29yZHMocmF3S2V5d29yZHMsIGNhc2VfaW5zZW5zaXRpdmUpIHtcbiAgICAgIHZhciBjb21waWxlZF9rZXl3b3JkcyA9IHt9O1xuXG4gICAgICBpZiAodHlwZW9mIHJhd0tleXdvcmRzID09PSAnc3RyaW5nJykgeyAvLyBzdHJpbmdcbiAgICAgICAgc3BsaXRBbmRDb21waWxlKCdrZXl3b3JkJywgcmF3S2V5d29yZHMpO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgb2JqZWN0S2V5cyhyYXdLZXl3b3JkcykuZm9yRWFjaChmdW5jdGlvbiAoY2xhc3NOYW1lKSB7XG4gICAgICAgICAgc3BsaXRBbmRDb21waWxlKGNsYXNzTmFtZSwgcmF3S2V5d29yZHNbY2xhc3NOYW1lXSk7XG4gICAgICAgIH0pO1xuICAgICAgfVxuICAgIHJldHVybiBjb21waWxlZF9rZXl3b3JkcztcblxuICAgIC8vIC0tLVxuXG4gICAgZnVuY3Rpb24gc3BsaXRBbmRDb21waWxlKGNsYXNzTmFtZSwgc3RyKSB7XG4gICAgICBpZiAoY2FzZV9pbnNlbnNpdGl2ZSkge1xuICAgICAgICBzdHIgPSBzdHIudG9Mb3dlckNhc2UoKTtcbiAgICAgIH1cbiAgICAgIHN0ci5zcGxpdCgnICcpLmZvckVhY2goZnVuY3Rpb24oa2V5d29yZCkge1xuICAgICAgICB2YXIgcGFpciA9IGtleXdvcmQuc3BsaXQoJ3wnKTtcbiAgICAgICAgY29tcGlsZWRfa2V5d29yZHNbcGFpclswXV0gPSBbY2xhc3NOYW1lLCBzY29yZUZvcktleXdvcmQocGFpclswXSwgcGFpclsxXSldO1xuICAgICAgfSk7XG4gICAgfTtcbiAgfVxuXG4gIGZ1bmN0aW9uIHNjb3JlRm9yS2V5d29yZChrZXl3b3JkLCBwcm92aWRlZFNjb3JlKSB7XG4gICAgLy8gbWFudWFsIHNjb3JlcyBhbHdheXMgd2luIG92ZXIgY29tbW9uIGtleXdvcmRzXG4gICAgLy8gc28geW91IGNhbiBmb3JjZSBhIHNjb3JlIG9mIDEgaWYgeW91IHJlYWxseSBpbnNpc3RcbiAgICBpZiAocHJvdmlkZWRTY29yZSlcbiAgICAgIHJldHVybiBOdW1iZXIocHJvdmlkZWRTY29yZSlcblxuICAgIHJldHVybiBjb21tb25LZXl3b3JkKGtleXdvcmQpID8gMCA6IDE7XG4gIH1cblxuICBmdW5jdGlvbiBjb21tb25LZXl3b3JkKHdvcmQpIHtcbiAgICByZXR1cm4gQ09NTU9OX0tFWVdPUkRTLmluZGV4T2Yod29yZC50b0xvd2VyQ2FzZSgpKSAhPSAtMVxuICB9XG5cbiAgZnVuY3Rpb24gY29tcGlsZUxhbmd1YWdlKGxhbmd1YWdlKSB7XG5cbiAgICBmdW5jdGlvbiByZVN0cihyZSkge1xuICAgICAgICByZXR1cm4gKHJlICYmIHJlLnNvdXJjZSkgfHwgcmU7XG4gICAgfVxuXG4gICAgZnVuY3Rpb24gbGFuZ1JlKHZhbHVlLCBnbG9iYWwpIHtcbiAgICAgIHJldHVybiBuZXcgUmVnRXhwKFxuICAgICAgICByZVN0cih2YWx1ZSksXG4gICAgICAgICdtJyArIChsYW5ndWFnZS5jYXNlX2luc2Vuc2l0aXZlID8gJ2knIDogJycpICsgKGdsb2JhbCA/ICdnJyA6ICcnKVxuICAgICAgKTtcbiAgICB9XG5cbiAgICBmdW5jdGlvbiByZUNvdW50TWF0Y2hHcm91cHMocmUpIHtcbiAgICAgIHJldHVybiAobmV3IFJlZ0V4cChyZS50b1N0cmluZygpICsgJ3wnKSkuZXhlYygnJykubGVuZ3RoIC0gMTtcbiAgICB9XG5cbiAgICAvLyBqb2luUmUgbG9naWNhbGx5IGNvbXB1dGVzIHJlZ2V4cHMuam9pbihzZXBhcmF0b3IpLCBidXQgZml4ZXMgdGhlXG4gICAgLy8gYmFja3JlZmVyZW5jZXMgc28gdGhleSBjb250aW51ZSB0byBtYXRjaC5cbiAgICAvLyBpdCBhbHNvIHBsYWNlcyBlYWNoIGluZGl2aWR1YWwgcmVndWxhciBleHByZXNzaW9uIGludG8gaXQncyBvd25cbiAgICAvLyBtYXRjaCBncm91cCwga2VlcGluZyB0cmFjayBvZiB0aGUgc2VxdWVuY2luZyBvZiB0aG9zZSBtYXRjaCBncm91cHNcbiAgICAvLyBpcyBjdXJyZW50bHkgYW4gZXhlcmNpc2UgZm9yIHRoZSBjYWxsZXIuIDotKVxuICAgIGZ1bmN0aW9uIGpvaW5SZShyZWdleHBzLCBzZXBhcmF0b3IpIHtcbiAgICAgIC8vIGJhY2tyZWZlcmVuY2VSZSBtYXRjaGVzIGFuIG9wZW4gcGFyZW50aGVzaXMgb3IgYmFja3JlZmVyZW5jZS4gVG8gYXZvaWRcbiAgICAgIC8vIGFuIGluY29ycmVjdCBwYXJzZSwgaXQgYWRkaXRpb25hbGx5IG1hdGNoZXMgdGhlIGZvbGxvd2luZzpcbiAgICAgIC8vIC0gWy4uLl0gZWxlbWVudHMsIHdoZXJlIHRoZSBtZWFuaW5nIG9mIHBhcmVudGhlc2VzIGFuZCBlc2NhcGVzIGNoYW5nZVxuICAgICAgLy8gLSBvdGhlciBlc2NhcGUgc2VxdWVuY2VzLCBzbyB3ZSBkbyBub3QgbWlzcGFyc2UgZXNjYXBlIHNlcXVlbmNlcyBhc1xuICAgICAgLy8gICBpbnRlcmVzdGluZyBlbGVtZW50c1xuICAgICAgLy8gLSBub24tbWF0Y2hpbmcgb3IgbG9va2FoZWFkIHBhcmVudGhlc2VzLCB3aGljaCBkbyBub3QgY2FwdHVyZS4gVGhlc2VcbiAgICAgIC8vICAgZm9sbG93IHRoZSAnKCcgd2l0aCBhICc/Jy5cbiAgICAgIHZhciBiYWNrcmVmZXJlbmNlUmUgPSAvXFxbKD86W15cXFxcXFxdXXxcXFxcLikqXFxdfFxcKFxcPz98XFxcXChbMS05XVswLTldKil8XFxcXC4vO1xuICAgICAgdmFyIG51bUNhcHR1cmVzID0gMDtcbiAgICAgIHZhciByZXQgPSAnJztcbiAgICAgIGZvciAodmFyIGkgPSAwOyBpIDwgcmVnZXhwcy5sZW5ndGg7IGkrKykge1xuICAgICAgICBudW1DYXB0dXJlcyArPSAxO1xuICAgICAgICB2YXIgb2Zmc2V0ID0gbnVtQ2FwdHVyZXM7XG4gICAgICAgIHZhciByZSA9IHJlU3RyKHJlZ2V4cHNbaV0pO1xuICAgICAgICBpZiAoaSA+IDApIHtcbiAgICAgICAgICByZXQgKz0gc2VwYXJhdG9yO1xuICAgICAgICB9XG4gICAgICAgIHJldCArPSBcIihcIjtcbiAgICAgICAgd2hpbGUgKHJlLmxlbmd0aCA+IDApIHtcbiAgICAgICAgICB2YXIgbWF0Y2ggPSBiYWNrcmVmZXJlbmNlUmUuZXhlYyhyZSk7XG4gICAgICAgICAgaWYgKG1hdGNoID09IG51bGwpIHtcbiAgICAgICAgICAgIHJldCArPSByZTtcbiAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgIH1cbiAgICAgICAgICByZXQgKz0gcmUuc3Vic3RyaW5nKDAsIG1hdGNoLmluZGV4KTtcbiAgICAgICAgICByZSA9IHJlLnN1YnN0cmluZyhtYXRjaC5pbmRleCArIG1hdGNoWzBdLmxlbmd0aCk7XG4gICAgICAgICAgaWYgKG1hdGNoWzBdWzBdID09ICdcXFxcJyAmJiBtYXRjaFsxXSkge1xuICAgICAgICAgICAgLy8gQWRqdXN0IHRoZSBiYWNrcmVmZXJlbmNlLlxuICAgICAgICAgICAgcmV0ICs9ICdcXFxcJyArIFN0cmluZyhOdW1iZXIobWF0Y2hbMV0pICsgb2Zmc2V0KTtcbiAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgcmV0ICs9IG1hdGNoWzBdO1xuICAgICAgICAgICAgaWYgKG1hdGNoWzBdID09ICcoJykge1xuICAgICAgICAgICAgICBudW1DYXB0dXJlcysrO1xuICAgICAgICAgICAgfVxuICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICByZXQgKz0gXCIpXCI7XG4gICAgICB9XG4gICAgICByZXR1cm4gcmV0O1xuICAgIH1cblxuICAgIGZ1bmN0aW9uIGJ1aWxkTW9kZVJlZ2V4KG1vZGUpIHtcblxuICAgICAgdmFyIG1hdGNoSW5kZXhlcyA9IHt9O1xuICAgICAgdmFyIG1hdGNoZXJSZTtcbiAgICAgIHZhciByZWdleGVzID0gW107XG4gICAgICB2YXIgbWF0Y2hlciA9IHt9O1xuICAgICAgdmFyIG1hdGNoQXQgPSAxO1xuXG4gICAgICBmdW5jdGlvbiBhZGRSdWxlKHJ1bGUsIHJlZ2V4KSB7XG4gICAgICAgIG1hdGNoSW5kZXhlc1ttYXRjaEF0XSA9IHJ1bGU7XG4gICAgICAgIHJlZ2V4ZXMucHVzaChbcnVsZSwgcmVnZXhdKTtcbiAgICAgICAgbWF0Y2hBdCArPSByZUNvdW50TWF0Y2hHcm91cHMocmVnZXgpICsgMTtcbiAgICAgIH1cblxuICAgICAgdmFyIHRlcm07XG4gICAgICBmb3IgKHZhciBpPTA7IGkgPCBtb2RlLmNvbnRhaW5zLmxlbmd0aDsgaSsrKSB7XG4gICAgICAgIHZhciByZTtcbiAgICAgICAgdGVybSA9IG1vZGUuY29udGFpbnNbaV07XG4gICAgICAgIGlmICh0ZXJtLmJlZ2luS2V5d29yZHMpIHtcbiAgICAgICAgICByZSA9ICdcXFxcLj8oPzonICsgdGVybS5iZWdpbiArICcpXFxcXC4/JztcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICByZSA9IHRlcm0uYmVnaW47XG4gICAgICAgIH1cbiAgICAgICAgYWRkUnVsZSh0ZXJtLCByZSk7XG4gICAgICB9XG4gICAgICBpZiAobW9kZS50ZXJtaW5hdG9yX2VuZClcbiAgICAgICAgYWRkUnVsZShcImVuZFwiLCBtb2RlLnRlcm1pbmF0b3JfZW5kKTtcbiAgICAgIGlmIChtb2RlLmlsbGVnYWwpXG4gICAgICAgIGFkZFJ1bGUoXCJpbGxlZ2FsXCIsIG1vZGUuaWxsZWdhbCk7XG5cbiAgICAgIHZhciB0ZXJtaW5hdG9ycyA9IHJlZ2V4ZXMubWFwKGZ1bmN0aW9uKGVsKSB7IHJldHVybiBlbFsxXSB9KTtcbiAgICAgIG1hdGNoZXJSZSA9IGxhbmdSZShqb2luUmUodGVybWluYXRvcnMsICd8JyksIHRydWUpO1xuXG4gICAgICBtYXRjaGVyLmxhc3RJbmRleCA9IDA7XG4gICAgICBtYXRjaGVyLmV4ZWMgPSBmdW5jdGlvbihzKSB7XG4gICAgICAgIHZhciBydWxlO1xuXG4gICAgICAgIGlmKCByZWdleGVzLmxlbmd0aCA9PT0gMCkgcmV0dXJuIG51bGw7XG5cbiAgICAgICAgbWF0Y2hlclJlLmxhc3RJbmRleCA9IG1hdGNoZXIubGFzdEluZGV4O1xuICAgICAgICB2YXIgbWF0Y2ggPSBtYXRjaGVyUmUuZXhlYyhzKTtcbiAgICAgICAgaWYgKCFtYXRjaCkgeyByZXR1cm4gbnVsbDsgfVxuXG4gICAgICAgIGZvcih2YXIgaSA9IDA7IGk8bWF0Y2gubGVuZ3RoOyBpKyspIHtcbiAgICAgICAgICBpZiAobWF0Y2hbaV0gIT0gdW5kZWZpbmVkICYmIG1hdGNoSW5kZXhlc1tcIlwiICtpXSAhPSB1bmRlZmluZWQgKSB7XG4gICAgICAgICAgICBydWxlID0gbWF0Y2hJbmRleGVzW1wiXCIraV07XG4gICAgICAgICAgICBicmVhaztcbiAgICAgICAgICB9XG4gICAgICAgIH1cblxuICAgICAgICAvLyBpbGxlZ2FsIG9yIGVuZCBtYXRjaFxuICAgICAgICBpZiAodHlwZW9mIHJ1bGUgPT09IFwic3RyaW5nXCIpIHtcbiAgICAgICAgICBtYXRjaC50eXBlID0gcnVsZTtcbiAgICAgICAgICBtYXRjaC5leHRyYSA9IFttb2RlLmlsbGVnYWwsIG1vZGUudGVybWluYXRvcl9lbmRdO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIG1hdGNoLnR5cGUgPSBcImJlZ2luXCI7XG4gICAgICAgICAgbWF0Y2gucnVsZSA9IHJ1bGU7XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIG1hdGNoO1xuICAgICAgfVxuXG4gICAgICByZXR1cm4gbWF0Y2hlcjtcbiAgICB9XG5cbiAgICBmdW5jdGlvbiBjb21waWxlTW9kZShtb2RlLCBwYXJlbnQpIHtcbiAgICAgIGlmIChtb2RlLmNvbXBpbGVkKVxuICAgICAgICByZXR1cm47XG4gICAgICBtb2RlLmNvbXBpbGVkID0gdHJ1ZTtcblxuICAgICAgbW9kZS5rZXl3b3JkcyA9IG1vZGUua2V5d29yZHMgfHwgbW9kZS5iZWdpbktleXdvcmRzO1xuICAgICAgaWYgKG1vZGUua2V5d29yZHMpXG4gICAgICAgIG1vZGUua2V5d29yZHMgPSBjb21waWxlS2V5d29yZHMobW9kZS5rZXl3b3JkcywgbGFuZ3VhZ2UuY2FzZV9pbnNlbnNpdGl2ZSlcblxuICAgICAgbW9kZS5sZXhlbWVzUmUgPSBsYW5nUmUobW9kZS5sZXhlbWVzIHx8IC9cXHcrLywgdHJ1ZSk7XG5cbiAgICAgIGlmIChwYXJlbnQpIHtcbiAgICAgICAgaWYgKG1vZGUuYmVnaW5LZXl3b3Jkcykge1xuICAgICAgICAgIG1vZGUuYmVnaW4gPSAnXFxcXGIoJyArIG1vZGUuYmVnaW5LZXl3b3Jkcy5zcGxpdCgnICcpLmpvaW4oJ3wnKSArICcpXFxcXGInO1xuICAgICAgICB9XG4gICAgICAgIGlmICghbW9kZS5iZWdpbilcbiAgICAgICAgICBtb2RlLmJlZ2luID0gL1xcQnxcXGIvO1xuICAgICAgICBtb2RlLmJlZ2luUmUgPSBsYW5nUmUobW9kZS5iZWdpbik7XG4gICAgICAgIGlmIChtb2RlLmVuZFNhbWVBc0JlZ2luKVxuICAgICAgICAgIG1vZGUuZW5kID0gbW9kZS5iZWdpbjtcbiAgICAgICAgaWYgKCFtb2RlLmVuZCAmJiAhbW9kZS5lbmRzV2l0aFBhcmVudClcbiAgICAgICAgICBtb2RlLmVuZCA9IC9cXEJ8XFxiLztcbiAgICAgICAgaWYgKG1vZGUuZW5kKVxuICAgICAgICAgIG1vZGUuZW5kUmUgPSBsYW5nUmUobW9kZS5lbmQpO1xuICAgICAgICBtb2RlLnRlcm1pbmF0b3JfZW5kID0gcmVTdHIobW9kZS5lbmQpIHx8ICcnO1xuICAgICAgICBpZiAobW9kZS5lbmRzV2l0aFBhcmVudCAmJiBwYXJlbnQudGVybWluYXRvcl9lbmQpXG4gICAgICAgICAgbW9kZS50ZXJtaW5hdG9yX2VuZCArPSAobW9kZS5lbmQgPyAnfCcgOiAnJykgKyBwYXJlbnQudGVybWluYXRvcl9lbmQ7XG4gICAgICB9XG4gICAgICBpZiAobW9kZS5pbGxlZ2FsKVxuICAgICAgICBtb2RlLmlsbGVnYWxSZSA9IGxhbmdSZShtb2RlLmlsbGVnYWwpO1xuICAgICAgaWYgKG1vZGUucmVsZXZhbmNlID09IG51bGwpXG4gICAgICAgIG1vZGUucmVsZXZhbmNlID0gMTtcbiAgICAgIGlmICghbW9kZS5jb250YWlucykge1xuICAgICAgICBtb2RlLmNvbnRhaW5zID0gW107XG4gICAgICB9XG4gICAgICBtb2RlLmNvbnRhaW5zID0gQXJyYXkucHJvdG90eXBlLmNvbmNhdC5hcHBseShbXSwgbW9kZS5jb250YWlucy5tYXAoZnVuY3Rpb24oYykge1xuICAgICAgICByZXR1cm4gZXhwYW5kX29yX2Nsb25lX21vZGUoYyA9PT0gJ3NlbGYnID8gbW9kZSA6IGMpO1xuICAgICAgfSkpO1xuICAgICAgbW9kZS5jb250YWlucy5mb3JFYWNoKGZ1bmN0aW9uKGMpIHtjb21waWxlTW9kZShjLCBtb2RlKTt9KTtcblxuICAgICAgaWYgKG1vZGUuc3RhcnRzKSB7XG4gICAgICAgIGNvbXBpbGVNb2RlKG1vZGUuc3RhcnRzLCBwYXJlbnQpO1xuICAgICAgfVxuXG4gICAgICBtb2RlLnRlcm1pbmF0b3JzID0gYnVpbGRNb2RlUmVnZXgobW9kZSk7XG4gICAgfVxuXG4gICAgY29tcGlsZU1vZGUobGFuZ3VhZ2UpO1xuICB9XG5cbiAgLypcbiAgQ29yZSBoaWdobGlnaHRpbmcgZnVuY3Rpb24uIEFjY2VwdHMgYSBsYW5ndWFnZSBuYW1lLCBvciBhbiBhbGlhcywgYW5kIGFcbiAgc3RyaW5nIHdpdGggdGhlIGNvZGUgdG8gaGlnaGxpZ2h0LiBSZXR1cm5zIGFuIG9iamVjdCB3aXRoIHRoZSBmb2xsb3dpbmdcbiAgcHJvcGVydGllczpcblxuICAtIHJlbGV2YW5jZSAoaW50KVxuICAtIHZhbHVlIChhbiBIVE1MIHN0cmluZyB3aXRoIGhpZ2hsaWdodGluZyBtYXJrdXApXG5cbiAgKi9cbiAgZnVuY3Rpb24gaGlnaGxpZ2h0KG5hbWUsIHZhbHVlLCBpZ25vcmVfaWxsZWdhbHMsIGNvbnRpbnVhdGlvbikge1xuXG4gICAgZnVuY3Rpb24gZXNjYXBlUmUodmFsdWUpIHtcbiAgICAgIHJldHVybiBuZXcgUmVnRXhwKHZhbHVlLnJlcGxhY2UoL1stXFwvXFxcXF4kKis/LigpfFtcXF17fV0vZywgJ1xcXFwkJicpLCAnbScpO1xuICAgIH1cblxuICAgIGZ1bmN0aW9uIGVuZE9mTW9kZShtb2RlLCBsZXhlbWUpIHtcbiAgICAgIGlmICh0ZXN0UmUobW9kZS5lbmRSZSwgbGV4ZW1lKSkge1xuICAgICAgICB3aGlsZSAobW9kZS5lbmRzUGFyZW50ICYmIG1vZGUucGFyZW50KSB7XG4gICAgICAgICAgbW9kZSA9IG1vZGUucGFyZW50O1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiBtb2RlO1xuICAgICAgfVxuICAgICAgaWYgKG1vZGUuZW5kc1dpdGhQYXJlbnQpIHtcbiAgICAgICAgcmV0dXJuIGVuZE9mTW9kZShtb2RlLnBhcmVudCwgbGV4ZW1lKTtcbiAgICAgIH1cbiAgICB9XG5cbiAgICBmdW5jdGlvbiBrZXl3b3JkTWF0Y2gobW9kZSwgbWF0Y2gpIHtcbiAgICAgIHZhciBtYXRjaF9zdHIgPSBsYW5ndWFnZS5jYXNlX2luc2Vuc2l0aXZlID8gbWF0Y2hbMF0udG9Mb3dlckNhc2UoKSA6IG1hdGNoWzBdO1xuICAgICAgcmV0dXJuIG1vZGUua2V5d29yZHMuaGFzT3duUHJvcGVydHkobWF0Y2hfc3RyKSAmJiBtb2RlLmtleXdvcmRzW21hdGNoX3N0cl07XG4gICAgfVxuXG4gICAgZnVuY3Rpb24gYnVpbGRTcGFuKGNsYXNzbmFtZSwgaW5zaWRlU3BhbiwgbGVhdmVPcGVuLCBub1ByZWZpeCkge1xuICAgICAgaWYgKCFsZWF2ZU9wZW4gJiYgaW5zaWRlU3BhbiA9PT0gJycpIHJldHVybiAnJztcbiAgICAgIGlmICghY2xhc3NuYW1lKSByZXR1cm4gaW5zaWRlU3BhbjtcblxuICAgICAgdmFyIGNsYXNzUHJlZml4ID0gbm9QcmVmaXggPyAnJyA6IG9wdGlvbnMuY2xhc3NQcmVmaXgsXG4gICAgICAgICAgb3BlblNwYW4gICAgPSAnPHNwYW4gY2xhc3M9XCInICsgY2xhc3NQcmVmaXgsXG4gICAgICAgICAgY2xvc2VTcGFuICAgPSBsZWF2ZU9wZW4gPyAnJyA6IHNwYW5FbmRUYWc7XG5cbiAgICAgIG9wZW5TcGFuICs9IGNsYXNzbmFtZSArICdcIj4nO1xuXG4gICAgICByZXR1cm4gb3BlblNwYW4gKyBpbnNpZGVTcGFuICsgY2xvc2VTcGFuO1xuICAgIH1cblxuICAgIGZ1bmN0aW9uIHByb2Nlc3NLZXl3b3JkcygpIHtcbiAgICAgIHZhciBrZXl3b3JkX21hdGNoLCBsYXN0X2luZGV4LCBtYXRjaCwgcmVzdWx0O1xuXG4gICAgICBpZiAoIXRvcC5rZXl3b3JkcylcbiAgICAgICAgcmV0dXJuIGVzY2FwZShtb2RlX2J1ZmZlcik7XG5cbiAgICAgIHJlc3VsdCA9ICcnO1xuICAgICAgbGFzdF9pbmRleCA9IDA7XG4gICAgICB0b3AubGV4ZW1lc1JlLmxhc3RJbmRleCA9IDA7XG4gICAgICBtYXRjaCA9IHRvcC5sZXhlbWVzUmUuZXhlYyhtb2RlX2J1ZmZlcik7XG5cbiAgICAgIHdoaWxlIChtYXRjaCkge1xuICAgICAgICByZXN1bHQgKz0gZXNjYXBlKG1vZGVfYnVmZmVyLnN1YnN0cmluZyhsYXN0X2luZGV4LCBtYXRjaC5pbmRleCkpO1xuICAgICAgICBrZXl3b3JkX21hdGNoID0ga2V5d29yZE1hdGNoKHRvcCwgbWF0Y2gpO1xuICAgICAgICBpZiAoa2V5d29yZF9tYXRjaCkge1xuICAgICAgICAgIHJlbGV2YW5jZSArPSBrZXl3b3JkX21hdGNoWzFdO1xuICAgICAgICAgIHJlc3VsdCArPSBidWlsZFNwYW4oa2V5d29yZF9tYXRjaFswXSwgZXNjYXBlKG1hdGNoWzBdKSk7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgcmVzdWx0ICs9IGVzY2FwZShtYXRjaFswXSk7XG4gICAgICAgIH1cbiAgICAgICAgbGFzdF9pbmRleCA9IHRvcC5sZXhlbWVzUmUubGFzdEluZGV4O1xuICAgICAgICBtYXRjaCA9IHRvcC5sZXhlbWVzUmUuZXhlYyhtb2RlX2J1ZmZlcik7XG4gICAgICB9XG4gICAgICByZXR1cm4gcmVzdWx0ICsgZXNjYXBlKG1vZGVfYnVmZmVyLnN1YnN0cihsYXN0X2luZGV4KSk7XG4gICAgfVxuXG4gICAgZnVuY3Rpb24gcHJvY2Vzc1N1Ykxhbmd1YWdlKCkge1xuICAgICAgdmFyIGV4cGxpY2l0ID0gdHlwZW9mIHRvcC5zdWJMYW5ndWFnZSA9PT0gJ3N0cmluZyc7XG4gICAgICBpZiAoZXhwbGljaXQgJiYgIWxhbmd1YWdlc1t0b3Auc3ViTGFuZ3VhZ2VdKSB7XG4gICAgICAgIHJldHVybiBlc2NhcGUobW9kZV9idWZmZXIpO1xuICAgICAgfVxuXG4gICAgICB2YXIgcmVzdWx0ID0gZXhwbGljaXQgP1xuICAgICAgICAgICAgICAgICAgIGhpZ2hsaWdodCh0b3Auc3ViTGFuZ3VhZ2UsIG1vZGVfYnVmZmVyLCB0cnVlLCBjb250aW51YXRpb25zW3RvcC5zdWJMYW5ndWFnZV0pIDpcbiAgICAgICAgICAgICAgICAgICBoaWdobGlnaHRBdXRvKG1vZGVfYnVmZmVyLCB0b3Auc3ViTGFuZ3VhZ2UubGVuZ3RoID8gdG9wLnN1Ykxhbmd1YWdlIDogdW5kZWZpbmVkKTtcblxuICAgICAgLy8gQ291bnRpbmcgZW1iZWRkZWQgbGFuZ3VhZ2Ugc2NvcmUgdG93YXJkcyB0aGUgaG9zdCBsYW5ndWFnZSBtYXkgYmUgZGlzYWJsZWRcbiAgICAgIC8vIHdpdGggemVyb2luZyB0aGUgY29udGFpbmluZyBtb2RlIHJlbGV2YW5jZS4gVXNlY2FzZSBpbiBwb2ludCBpcyBNYXJrZG93biB0aGF0XG4gICAgICAvLyBhbGxvd3MgWE1MIGV2ZXJ5d2hlcmUgYW5kIG1ha2VzIGV2ZXJ5IFhNTCBzbmlwcGV0IHRvIGhhdmUgYSBtdWNoIGxhcmdlciBNYXJrZG93blxuICAgICAgLy8gc2NvcmUuXG4gICAgICBpZiAodG9wLnJlbGV2YW5jZSA+IDApIHtcbiAgICAgICAgcmVsZXZhbmNlICs9IHJlc3VsdC5yZWxldmFuY2U7XG4gICAgICB9XG4gICAgICBpZiAoZXhwbGljaXQpIHtcbiAgICAgICAgY29udGludWF0aW9uc1t0b3Auc3ViTGFuZ3VhZ2VdID0gcmVzdWx0LnRvcDtcbiAgICAgIH1cbiAgICAgIHJldHVybiBidWlsZFNwYW4ocmVzdWx0Lmxhbmd1YWdlLCByZXN1bHQudmFsdWUsIGZhbHNlLCB0cnVlKTtcbiAgICB9XG5cbiAgICBmdW5jdGlvbiBwcm9jZXNzQnVmZmVyKCkge1xuICAgICAgcmVzdWx0ICs9ICh0b3Auc3ViTGFuZ3VhZ2UgIT0gbnVsbCA/IHByb2Nlc3NTdWJMYW5ndWFnZSgpIDogcHJvY2Vzc0tleXdvcmRzKCkpO1xuICAgICAgbW9kZV9idWZmZXIgPSAnJztcbiAgICB9XG5cbiAgICBmdW5jdGlvbiBzdGFydE5ld01vZGUobW9kZSkge1xuICAgICAgcmVzdWx0ICs9IG1vZGUuY2xhc3NOYW1lPyBidWlsZFNwYW4obW9kZS5jbGFzc05hbWUsICcnLCB0cnVlKTogJyc7XG4gICAgICB0b3AgPSBPYmplY3QuY3JlYXRlKG1vZGUsIHtwYXJlbnQ6IHt2YWx1ZTogdG9wfX0pO1xuICAgIH1cblxuXG4gICAgZnVuY3Rpb24gZG9CZWdpbk1hdGNoKG1hdGNoKSB7XG4gICAgICB2YXIgbGV4ZW1lID0gbWF0Y2hbMF07XG4gICAgICB2YXIgbmV3X21vZGUgPSBtYXRjaC5ydWxlO1xuXG4gICAgICBpZiAobmV3X21vZGUgJiYgbmV3X21vZGUuZW5kU2FtZUFzQmVnaW4pIHtcbiAgICAgICAgbmV3X21vZGUuZW5kUmUgPSBlc2NhcGVSZSggbGV4ZW1lICk7XG4gICAgICB9XG5cbiAgICAgIGlmIChuZXdfbW9kZS5za2lwKSB7XG4gICAgICAgIG1vZGVfYnVmZmVyICs9IGxleGVtZTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIGlmIChuZXdfbW9kZS5leGNsdWRlQmVnaW4pIHtcbiAgICAgICAgICBtb2RlX2J1ZmZlciArPSBsZXhlbWU7XG4gICAgICAgIH1cbiAgICAgICAgcHJvY2Vzc0J1ZmZlcigpO1xuICAgICAgICBpZiAoIW5ld19tb2RlLnJldHVybkJlZ2luICYmICFuZXdfbW9kZS5leGNsdWRlQmVnaW4pIHtcbiAgICAgICAgICBtb2RlX2J1ZmZlciA9IGxleGVtZTtcbiAgICAgICAgfVxuICAgICAgfVxuICAgICAgc3RhcnROZXdNb2RlKG5ld19tb2RlLCBsZXhlbWUpO1xuICAgICAgcmV0dXJuIG5ld19tb2RlLnJldHVybkJlZ2luID8gMCA6IGxleGVtZS5sZW5ndGg7XG4gICAgfVxuXG4gICAgZnVuY3Rpb24gZG9FbmRNYXRjaChtYXRjaCkge1xuICAgICAgdmFyIGxleGVtZSA9IG1hdGNoWzBdO1xuICAgICAgdmFyIGVuZF9tb2RlID0gZW5kT2ZNb2RlKHRvcCwgbGV4ZW1lKTtcbiAgICAgIGlmICghZW5kX21vZGUpIHsgcmV0dXJuOyB9XG5cbiAgICAgIHZhciBvcmlnaW4gPSB0b3A7XG4gICAgICBpZiAob3JpZ2luLnNraXApIHtcbiAgICAgICAgbW9kZV9idWZmZXIgKz0gbGV4ZW1lO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgaWYgKCEob3JpZ2luLnJldHVybkVuZCB8fCBvcmlnaW4uZXhjbHVkZUVuZCkpIHtcbiAgICAgICAgICBtb2RlX2J1ZmZlciArPSBsZXhlbWU7XG4gICAgICAgIH1cbiAgICAgICAgcHJvY2Vzc0J1ZmZlcigpO1xuICAgICAgICBpZiAob3JpZ2luLmV4Y2x1ZGVFbmQpIHtcbiAgICAgICAgICBtb2RlX2J1ZmZlciA9IGxleGVtZTtcbiAgICAgICAgfVxuICAgICAgfVxuICAgICAgZG8ge1xuICAgICAgICBpZiAodG9wLmNsYXNzTmFtZSkge1xuICAgICAgICAgIHJlc3VsdCArPSBzcGFuRW5kVGFnO1xuICAgICAgICB9XG4gICAgICAgIGlmICghdG9wLnNraXAgJiYgIXRvcC5zdWJMYW5ndWFnZSkge1xuICAgICAgICAgIHJlbGV2YW5jZSArPSB0b3AucmVsZXZhbmNlO1xuICAgICAgICB9XG4gICAgICAgIHRvcCA9IHRvcC5wYXJlbnQ7XG4gICAgICB9IHdoaWxlICh0b3AgIT09IGVuZF9tb2RlLnBhcmVudCk7XG4gICAgICBpZiAoZW5kX21vZGUuc3RhcnRzKSB7XG4gICAgICAgIGlmIChlbmRfbW9kZS5lbmRTYW1lQXNCZWdpbikge1xuICAgICAgICAgIGVuZF9tb2RlLnN0YXJ0cy5lbmRSZSA9IGVuZF9tb2RlLmVuZFJlO1xuICAgICAgICB9XG4gICAgICAgIHN0YXJ0TmV3TW9kZShlbmRfbW9kZS5zdGFydHMsICcnKTtcbiAgICAgIH1cbiAgICAgIHJldHVybiBvcmlnaW4ucmV0dXJuRW5kID8gMCA6IGxleGVtZS5sZW5ndGg7XG4gICAgfVxuXG4gICAgdmFyIGxhc3RNYXRjaCA9IHt9O1xuICAgIGZ1bmN0aW9uIHByb2Nlc3NMZXhlbWUodGV4dF9iZWZvcmVfbWF0Y2gsIG1hdGNoKSB7XG5cbiAgICAgIHZhciBsZXhlbWUgPSBtYXRjaCAmJiBtYXRjaFswXTtcblxuICAgICAgLy8gYWRkIG5vbi1tYXRjaGVkIHRleHQgdG8gdGhlIGN1cnJlbnQgbW9kZSBidWZmZXJcbiAgICAgIG1vZGVfYnVmZmVyICs9IHRleHRfYmVmb3JlX21hdGNoO1xuXG4gICAgICBpZiAobGV4ZW1lID09IG51bGwpIHtcbiAgICAgICAgcHJvY2Vzc0J1ZmZlcigpO1xuICAgICAgICByZXR1cm4gMDtcbiAgICAgIH1cblxuICAgICAgLy8gd2UndmUgZm91bmQgYSAwIHdpZHRoIG1hdGNoIGFuZCB3ZSdyZSBzdHVjaywgc28gd2UgbmVlZCB0byBhZHZhbmNlXG4gICAgICAvLyB0aGlzIGhhcHBlbnMgd2hlbiB3ZSBoYXZlIGJhZGx5IGJlaGF2ZWQgcnVsZXMgdGhhdCBoYXZlIG9wdGlvbmFsIG1hdGNoZXJzIHRvIHRoZSBkZWdyZWUgdGhhdFxuICAgICAgLy8gc29tZXRpbWVzIHRoZXkgY2FuIGVuZCB1cCBtYXRjaGluZyBub3RoaW5nIGF0IGFsbFxuICAgICAgLy8gUmVmOiBodHRwczovL2dpdGh1Yi5jb20vaGlnaGxpZ2h0anMvaGlnaGxpZ2h0LmpzL2lzc3Vlcy8yMTQwXG4gICAgICBpZiAobGFzdE1hdGNoLnR5cGU9PVwiYmVnaW5cIiAmJiBtYXRjaC50eXBlPT1cImVuZFwiICYmIGxhc3RNYXRjaC5pbmRleCA9PSBtYXRjaC5pbmRleCAmJiBsZXhlbWUgPT09IFwiXCIpIHtcbiAgICAgICAgLy8gc3BpdCB0aGUgXCJza2lwcGVkXCIgY2hhcmFjdGVyIHRoYXQgb3VyIHJlZ2V4IGNob2tlZCBvbiBiYWNrIGludG8gdGhlIG91dHB1dCBzZXF1ZW5jZVxuICAgICAgICBtb2RlX2J1ZmZlciArPSB2YWx1ZS5zbGljZShtYXRjaC5pbmRleCwgbWF0Y2guaW5kZXggKyAxKVxuICAgICAgICByZXR1cm4gMTtcbiAgICAgIH1cbiAgICAgIGxhc3RNYXRjaCA9IG1hdGNoO1xuXG4gICAgICBpZiAobWF0Y2gudHlwZT09PVwiYmVnaW5cIikge1xuICAgICAgICByZXR1cm4gZG9CZWdpbk1hdGNoKG1hdGNoKTtcbiAgICAgIH0gZWxzZSBpZiAobWF0Y2gudHlwZT09PVwiaWxsZWdhbFwiICYmICFpZ25vcmVfaWxsZWdhbHMpIHtcbiAgICAgICAgLy8gaWxsZWdhbCBtYXRjaCwgd2UgZG8gbm90IGNvbnRpbnVlIHByb2Nlc3NpbmdcbiAgICAgICAgdGhyb3cgbmV3IEVycm9yKCdJbGxlZ2FsIGxleGVtZSBcIicgKyBsZXhlbWUgKyAnXCIgZm9yIG1vZGUgXCInICsgKHRvcC5jbGFzc05hbWUgfHwgJzx1bm5hbWVkPicpICsgJ1wiJyk7XG4gICAgICB9IGVsc2UgaWYgKG1hdGNoLnR5cGU9PT1cImVuZFwiKSB7XG4gICAgICAgIHZhciBwcm9jZXNzZWQgPSBkb0VuZE1hdGNoKG1hdGNoKTtcbiAgICAgICAgaWYgKHByb2Nlc3NlZCAhPSB1bmRlZmluZWQpXG4gICAgICAgICAgcmV0dXJuIHByb2Nlc3NlZDtcbiAgICAgIH1cblxuICAgICAgLypcbiAgICAgIFdoeSBtaWdodCBiZSBmaW5kIG91cnNlbHZlcyBoZXJlPyAgT25seSBvbmUgb2NjYXNpb24gbm93LiAgQW4gZW5kIG1hdGNoIHRoYXQgd2FzXG4gICAgICB0cmlnZ2VyZWQgYnV0IGNvdWxkIG5vdCBiZSBjb21wbGV0ZWQuICBXaGVuIG1pZ2h0IHRoaXMgaGFwcGVuPyAgV2hlbiBhbiBgZW5kU2FtZWFzQmVnaW5gXG4gICAgICBydWxlIHNldHMgdGhlIGVuZCBydWxlIHRvIGEgc3BlY2lmaWMgbWF0Y2guICBTaW5jZSB0aGUgb3ZlcmFsbCBtb2RlIHRlcm1pbmF0aW9uIHJ1bGUgdGhhdCdzXG4gICAgICBiZWluZyB1c2VkIHRvIHNjYW4gdGhlIHRleHQgaXNuJ3QgcmVjb21waWxlZCB0aGF0IG1lYW5zIHRoYXQgYW55IG1hdGNoIHRoYXQgTE9PS1MgbGlrZVxuICAgICAgdGhlIGVuZCAoYnV0IGlzIG5vdCwgYmVjYXVzZSBpdCBpcyBub3QgYW4gZXhhY3QgbWF0Y2ggdG8gdGhlIGJlZ2lubmluZykgd2lsbFxuICAgICAgZW5kIHVwIGhlcmUuICBBIGRlZmluaXRlIGVuZCBtYXRjaCwgYnV0IHdoZW4gYGRvRW5kTWF0Y2hgIHRyaWVzIHRvIFwicmVhcHBseVwiXG4gICAgICB0aGUgZW5kIHJ1bGUgYW5kIGZhaWxzIHRvIG1hdGNoLCB3ZSB3aW5kIHVwIGhlcmUsIGFuZCBqdXN0IHNpbGVudGx5IGlnbm9yZSB0aGUgZW5kLlxuXG4gICAgICBUaGlzIGNhdXNlcyBubyByZWFsIGhhcm0gb3RoZXIgdGhhbiBzdG9wcGluZyBhIGZldyB0aW1lcyB0b28gbWFueS5cbiAgICAgICovXG5cbiAgICAgIG1vZGVfYnVmZmVyICs9IGxleGVtZTtcbiAgICAgIHJldHVybiBsZXhlbWUubGVuZ3RoO1xuICAgIH1cblxuICAgIHZhciBsYW5ndWFnZSA9IGdldExhbmd1YWdlKG5hbWUpO1xuICAgIGlmICghbGFuZ3VhZ2UpIHtcbiAgICAgIHRocm93IG5ldyBFcnJvcignVW5rbm93biBsYW5ndWFnZTogXCInICsgbmFtZSArICdcIicpO1xuICAgIH1cblxuICAgIGNvbXBpbGVMYW5ndWFnZShsYW5ndWFnZSk7XG4gICAgdmFyIHRvcCA9IGNvbnRpbnVhdGlvbiB8fCBsYW5ndWFnZTtcbiAgICB2YXIgY29udGludWF0aW9ucyA9IHt9OyAvLyBrZWVwIGNvbnRpbnVhdGlvbnMgZm9yIHN1Yi1sYW5ndWFnZXNcbiAgICB2YXIgcmVzdWx0ID0gJycsIGN1cnJlbnQ7XG4gICAgZm9yKGN1cnJlbnQgPSB0b3A7IGN1cnJlbnQgIT09IGxhbmd1YWdlOyBjdXJyZW50ID0gY3VycmVudC5wYXJlbnQpIHtcbiAgICAgIGlmIChjdXJyZW50LmNsYXNzTmFtZSkge1xuICAgICAgICByZXN1bHQgPSBidWlsZFNwYW4oY3VycmVudC5jbGFzc05hbWUsICcnLCB0cnVlKSArIHJlc3VsdDtcbiAgICAgIH1cbiAgICB9XG4gICAgdmFyIG1vZGVfYnVmZmVyID0gJyc7XG4gICAgdmFyIHJlbGV2YW5jZSA9IDA7XG4gICAgdHJ5IHtcbiAgICAgIHZhciBtYXRjaCwgY291bnQsIGluZGV4ID0gMDtcbiAgICAgIHdoaWxlICh0cnVlKSB7XG4gICAgICAgIHRvcC50ZXJtaW5hdG9ycy5sYXN0SW5kZXggPSBpbmRleDtcbiAgICAgICAgbWF0Y2ggPSB0b3AudGVybWluYXRvcnMuZXhlYyh2YWx1ZSk7XG4gICAgICAgIGlmICghbWF0Y2gpXG4gICAgICAgICAgYnJlYWs7XG4gICAgICAgIGNvdW50ID0gcHJvY2Vzc0xleGVtZSh2YWx1ZS5zdWJzdHJpbmcoaW5kZXgsIG1hdGNoLmluZGV4KSwgbWF0Y2gpO1xuICAgICAgICBpbmRleCA9IG1hdGNoLmluZGV4ICsgY291bnQ7XG4gICAgICB9XG4gICAgICBwcm9jZXNzTGV4ZW1lKHZhbHVlLnN1YnN0cihpbmRleCkpO1xuICAgICAgZm9yKGN1cnJlbnQgPSB0b3A7IGN1cnJlbnQucGFyZW50OyBjdXJyZW50ID0gY3VycmVudC5wYXJlbnQpIHsgLy8gY2xvc2UgZGFuZ2xpbmcgbW9kZXNcbiAgICAgICAgaWYgKGN1cnJlbnQuY2xhc3NOYW1lKSB7XG4gICAgICAgICAgcmVzdWx0ICs9IHNwYW5FbmRUYWc7XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICAgIHJldHVybiB7XG4gICAgICAgIHJlbGV2YW5jZTogcmVsZXZhbmNlLFxuICAgICAgICB2YWx1ZTogcmVzdWx0LFxuICAgICAgICBpbGxlZ2FsOmZhbHNlLFxuICAgICAgICBsYW5ndWFnZTogbmFtZSxcbiAgICAgICAgdG9wOiB0b3BcbiAgICAgIH07XG4gICAgfSBjYXRjaCAoZSkge1xuICAgICAgaWYgKGUubWVzc2FnZSAmJiBlLm1lc3NhZ2UuaW5kZXhPZignSWxsZWdhbCcpICE9PSAtMSkge1xuICAgICAgICByZXR1cm4ge1xuICAgICAgICAgIGlsbGVnYWw6IHRydWUsXG4gICAgICAgICAgcmVsZXZhbmNlOiAwLFxuICAgICAgICAgIHZhbHVlOiBlc2NhcGUodmFsdWUpXG4gICAgICAgIH07XG4gICAgICB9IGVsc2Uge1xuICAgICAgICB0aHJvdyBlO1xuICAgICAgfVxuICAgIH1cbiAgfVxuXG4gIC8qXG4gIEhpZ2hsaWdodGluZyB3aXRoIGxhbmd1YWdlIGRldGVjdGlvbi4gQWNjZXB0cyBhIHN0cmluZyB3aXRoIHRoZSBjb2RlIHRvXG4gIGhpZ2hsaWdodC4gUmV0dXJucyBhbiBvYmplY3Qgd2l0aCB0aGUgZm9sbG93aW5nIHByb3BlcnRpZXM6XG5cbiAgLSBsYW5ndWFnZSAoZGV0ZWN0ZWQgbGFuZ3VhZ2UpXG4gIC0gcmVsZXZhbmNlIChpbnQpXG4gIC0gdmFsdWUgKGFuIEhUTUwgc3RyaW5nIHdpdGggaGlnaGxpZ2h0aW5nIG1hcmt1cClcbiAgLSBzZWNvbmRfYmVzdCAob2JqZWN0IHdpdGggdGhlIHNhbWUgc3RydWN0dXJlIGZvciBzZWNvbmQtYmVzdCBoZXVyaXN0aWNhbGx5XG4gICAgZGV0ZWN0ZWQgbGFuZ3VhZ2UsIG1heSBiZSBhYnNlbnQpXG5cbiAgKi9cbiAgZnVuY3Rpb24gaGlnaGxpZ2h0QXV0byh0ZXh0LCBsYW5ndWFnZVN1YnNldCkge1xuICAgIGxhbmd1YWdlU3Vic2V0ID0gbGFuZ3VhZ2VTdWJzZXQgfHwgb3B0aW9ucy5sYW5ndWFnZXMgfHwgb2JqZWN0S2V5cyhsYW5ndWFnZXMpO1xuICAgIHZhciByZXN1bHQgPSB7XG4gICAgICByZWxldmFuY2U6IDAsXG4gICAgICB2YWx1ZTogZXNjYXBlKHRleHQpXG4gICAgfTtcbiAgICB2YXIgc2Vjb25kX2Jlc3QgPSByZXN1bHQ7XG4gICAgbGFuZ3VhZ2VTdWJzZXQuZmlsdGVyKGdldExhbmd1YWdlKS5maWx0ZXIoYXV0b0RldGVjdGlvbikuZm9yRWFjaChmdW5jdGlvbihuYW1lKSB7XG4gICAgICB2YXIgY3VycmVudCA9IGhpZ2hsaWdodChuYW1lLCB0ZXh0LCBmYWxzZSk7XG4gICAgICBjdXJyZW50Lmxhbmd1YWdlID0gbmFtZTtcbiAgICAgIGlmIChjdXJyZW50LnJlbGV2YW5jZSA+IHNlY29uZF9iZXN0LnJlbGV2YW5jZSkge1xuICAgICAgICBzZWNvbmRfYmVzdCA9IGN1cnJlbnQ7XG4gICAgICB9XG4gICAgICBpZiAoY3VycmVudC5yZWxldmFuY2UgPiByZXN1bHQucmVsZXZhbmNlKSB7XG4gICAgICAgIHNlY29uZF9iZXN0ID0gcmVzdWx0O1xuICAgICAgICByZXN1bHQgPSBjdXJyZW50O1xuICAgICAgfVxuICAgIH0pO1xuICAgIGlmIChzZWNvbmRfYmVzdC5sYW5ndWFnZSkge1xuICAgICAgcmVzdWx0LnNlY29uZF9iZXN0ID0gc2Vjb25kX2Jlc3Q7XG4gICAgfVxuICAgIHJldHVybiByZXN1bHQ7XG4gIH1cblxuICAvKlxuICBQb3N0LXByb2Nlc3Npbmcgb2YgdGhlIGhpZ2hsaWdodGVkIG1hcmt1cDpcblxuICAtIHJlcGxhY2UgVEFCcyB3aXRoIHNvbWV0aGluZyBtb3JlIHVzZWZ1bFxuICAtIHJlcGxhY2UgcmVhbCBsaW5lLWJyZWFrcyB3aXRoICc8YnI+JyBmb3Igbm9uLXByZSBjb250YWluZXJzXG5cbiAgKi9cbiAgZnVuY3Rpb24gZml4TWFya3VwKHZhbHVlKSB7XG4gICAgcmV0dXJuICEob3B0aW9ucy50YWJSZXBsYWNlIHx8IG9wdGlvbnMudXNlQlIpXG4gICAgICA/IHZhbHVlXG4gICAgICA6IHZhbHVlLnJlcGxhY2UoZml4TWFya3VwUmUsIGZ1bmN0aW9uKG1hdGNoLCBwMSkge1xuICAgICAgICAgIGlmIChvcHRpb25zLnVzZUJSICYmIG1hdGNoID09PSAnXFxuJykge1xuICAgICAgICAgICAgcmV0dXJuICc8YnI+JztcbiAgICAgICAgICB9IGVsc2UgaWYgKG9wdGlvbnMudGFiUmVwbGFjZSkge1xuICAgICAgICAgICAgcmV0dXJuIHAxLnJlcGxhY2UoL1xcdC9nLCBvcHRpb25zLnRhYlJlcGxhY2UpO1xuICAgICAgICAgIH1cbiAgICAgICAgICByZXR1cm4gJyc7XG4gICAgICB9KTtcbiAgfVxuXG4gIGZ1bmN0aW9uIGJ1aWxkQ2xhc3NOYW1lKHByZXZDbGFzc05hbWUsIGN1cnJlbnRMYW5nLCByZXN1bHRMYW5nKSB7XG4gICAgdmFyIGxhbmd1YWdlID0gY3VycmVudExhbmcgPyBhbGlhc2VzW2N1cnJlbnRMYW5nXSA6IHJlc3VsdExhbmcsXG4gICAgICAgIHJlc3VsdCAgID0gW3ByZXZDbGFzc05hbWUudHJpbSgpXTtcblxuICAgIGlmICghcHJldkNsYXNzTmFtZS5tYXRjaCgvXFxiaGxqc1xcYi8pKSB7XG4gICAgICByZXN1bHQucHVzaCgnaGxqcycpO1xuICAgIH1cblxuICAgIGlmIChwcmV2Q2xhc3NOYW1lLmluZGV4T2YobGFuZ3VhZ2UpID09PSAtMSkge1xuICAgICAgcmVzdWx0LnB1c2gobGFuZ3VhZ2UpO1xuICAgIH1cblxuICAgIHJldHVybiByZXN1bHQuam9pbignICcpLnRyaW0oKTtcbiAgfVxuXG4gIC8qXG4gIEFwcGxpZXMgaGlnaGxpZ2h0aW5nIHRvIGEgRE9NIG5vZGUgY29udGFpbmluZyBjb2RlLiBBY2NlcHRzIGEgRE9NIG5vZGUgYW5kXG4gIHR3byBvcHRpb25hbCBwYXJhbWV0ZXJzIGZvciBmaXhNYXJrdXAuXG4gICovXG4gIGZ1bmN0aW9uIGhpZ2hsaWdodEJsb2NrKGJsb2NrKSB7XG4gICAgdmFyIG5vZGUsIG9yaWdpbmFsU3RyZWFtLCByZXN1bHQsIHJlc3VsdE5vZGUsIHRleHQ7XG4gICAgdmFyIGxhbmd1YWdlID0gYmxvY2tMYW5ndWFnZShibG9jayk7XG5cbiAgICBpZiAoaXNOb3RIaWdobGlnaHRlZChsYW5ndWFnZSkpXG4gICAgICAgIHJldHVybjtcblxuICAgIGlmIChvcHRpb25zLnVzZUJSKSB7XG4gICAgICBub2RlID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudE5TKCdodHRwOi8vd3d3LnczLm9yZy8xOTk5L3hodG1sJywgJ2RpdicpO1xuICAgICAgbm9kZS5pbm5lckhUTUwgPSBibG9jay5pbm5lckhUTUwucmVwbGFjZSgvXFxuL2csICcnKS5yZXBsYWNlKC88YnJbIFxcL10qPi9nLCAnXFxuJyk7XG4gICAgfSBlbHNlIHtcbiAgICAgIG5vZGUgPSBibG9jaztcbiAgICB9XG4gICAgdGV4dCA9IG5vZGUudGV4dENvbnRlbnQ7XG4gICAgcmVzdWx0ID0gbGFuZ3VhZ2UgPyBoaWdobGlnaHQobGFuZ3VhZ2UsIHRleHQsIHRydWUpIDogaGlnaGxpZ2h0QXV0byh0ZXh0KTtcblxuICAgIG9yaWdpbmFsU3RyZWFtID0gbm9kZVN0cmVhbShub2RlKTtcbiAgICBpZiAob3JpZ2luYWxTdHJlYW0ubGVuZ3RoKSB7XG4gICAgICByZXN1bHROb2RlID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudE5TKCdodHRwOi8vd3d3LnczLm9yZy8xOTk5L3hodG1sJywgJ2RpdicpO1xuICAgICAgcmVzdWx0Tm9kZS5pbm5lckhUTUwgPSByZXN1bHQudmFsdWU7XG4gICAgICByZXN1bHQudmFsdWUgPSBtZXJnZVN0cmVhbXMob3JpZ2luYWxTdHJlYW0sIG5vZGVTdHJlYW0ocmVzdWx0Tm9kZSksIHRleHQpO1xuICAgIH1cbiAgICByZXN1bHQudmFsdWUgPSBmaXhNYXJrdXAocmVzdWx0LnZhbHVlKTtcblxuICAgIGJsb2NrLmlubmVySFRNTCA9IHJlc3VsdC52YWx1ZTtcbiAgICBibG9jay5jbGFzc05hbWUgPSBidWlsZENsYXNzTmFtZShibG9jay5jbGFzc05hbWUsIGxhbmd1YWdlLCByZXN1bHQubGFuZ3VhZ2UpO1xuICAgIGJsb2NrLnJlc3VsdCA9IHtcbiAgICAgIGxhbmd1YWdlOiByZXN1bHQubGFuZ3VhZ2UsXG4gICAgICByZTogcmVzdWx0LnJlbGV2YW5jZVxuICAgIH07XG4gICAgaWYgKHJlc3VsdC5zZWNvbmRfYmVzdCkge1xuICAgICAgYmxvY2suc2Vjb25kX2Jlc3QgPSB7XG4gICAgICAgIGxhbmd1YWdlOiByZXN1bHQuc2Vjb25kX2Jlc3QubGFuZ3VhZ2UsXG4gICAgICAgIHJlOiByZXN1bHQuc2Vjb25kX2Jlc3QucmVsZXZhbmNlXG4gICAgICB9O1xuICAgIH1cbiAgfVxuXG4gIC8qXG4gIFVwZGF0ZXMgaGlnaGxpZ2h0LmpzIGdsb2JhbCBvcHRpb25zIHdpdGggdmFsdWVzIHBhc3NlZCBpbiB0aGUgZm9ybSBvZiBhbiBvYmplY3QuXG4gICovXG4gIGZ1bmN0aW9uIGNvbmZpZ3VyZSh1c2VyX29wdGlvbnMpIHtcbiAgICBvcHRpb25zID0gaW5oZXJpdChvcHRpb25zLCB1c2VyX29wdGlvbnMpO1xuICB9XG5cbiAgLypcbiAgQXBwbGllcyBoaWdobGlnaHRpbmcgdG8gYWxsIDxwcmU+PGNvZGU+Li48L2NvZGU+PC9wcmU+IGJsb2NrcyBvbiBhIHBhZ2UuXG4gICovXG4gIGZ1bmN0aW9uIGluaXRIaWdobGlnaHRpbmcoKSB7XG4gICAgaWYgKGluaXRIaWdobGlnaHRpbmcuY2FsbGVkKVxuICAgICAgcmV0dXJuO1xuICAgIGluaXRIaWdobGlnaHRpbmcuY2FsbGVkID0gdHJ1ZTtcblxuICAgIHZhciBibG9ja3MgPSBkb2N1bWVudC5xdWVyeVNlbGVjdG9yQWxsKCdwcmUgY29kZScpO1xuICAgIEFycmF5UHJvdG8uZm9yRWFjaC5jYWxsKGJsb2NrcywgaGlnaGxpZ2h0QmxvY2spO1xuICB9XG5cbiAgLypcbiAgQXR0YWNoZXMgaGlnaGxpZ2h0aW5nIHRvIHRoZSBwYWdlIGxvYWQgZXZlbnQuXG4gICovXG4gIGZ1bmN0aW9uIGluaXRIaWdobGlnaHRpbmdPbkxvYWQoKSB7XG4gICAgYWRkRXZlbnRMaXN0ZW5lcignRE9NQ29udGVudExvYWRlZCcsIGluaXRIaWdobGlnaHRpbmcsIGZhbHNlKTtcbiAgICBhZGRFdmVudExpc3RlbmVyKCdsb2FkJywgaW5pdEhpZ2hsaWdodGluZywgZmFsc2UpO1xuICB9XG5cbiAgZnVuY3Rpb24gcmVnaXN0ZXJMYW5ndWFnZShuYW1lLCBsYW5ndWFnZSkge1xuICAgIHZhciBsYW5nID0gbGFuZ3VhZ2VzW25hbWVdID0gbGFuZ3VhZ2UoaGxqcyk7XG4gICAgcmVzdG9yZUxhbmd1YWdlQXBpKGxhbmcpO1xuICAgIGxhbmcucmF3RGVmaW5pdGlvbiA9IGxhbmd1YWdlLmJpbmQobnVsbCxobGpzKTtcblxuICAgIGlmIChsYW5nLmFsaWFzZXMpIHtcbiAgICAgIGxhbmcuYWxpYXNlcy5mb3JFYWNoKGZ1bmN0aW9uKGFsaWFzKSB7YWxpYXNlc1thbGlhc10gPSBuYW1lO30pO1xuICAgIH1cbiAgfVxuXG4gIGZ1bmN0aW9uIGxpc3RMYW5ndWFnZXMoKSB7XG4gICAgcmV0dXJuIG9iamVjdEtleXMobGFuZ3VhZ2VzKTtcbiAgfVxuXG4gIGZ1bmN0aW9uIGdldExhbmd1YWdlKG5hbWUpIHtcbiAgICBuYW1lID0gKG5hbWUgfHwgJycpLnRvTG93ZXJDYXNlKCk7XG4gICAgcmV0dXJuIGxhbmd1YWdlc1tuYW1lXSB8fCBsYW5ndWFnZXNbYWxpYXNlc1tuYW1lXV07XG4gIH1cblxuICBmdW5jdGlvbiBhdXRvRGV0ZWN0aW9uKG5hbWUpIHtcbiAgICB2YXIgbGFuZyA9IGdldExhbmd1YWdlKG5hbWUpO1xuICAgIHJldHVybiBsYW5nICYmICFsYW5nLmRpc2FibGVBdXRvZGV0ZWN0O1xuICB9XG5cbiAgLyogSW50ZXJmYWNlIGRlZmluaXRpb24gKi9cblxuICBobGpzLmhpZ2hsaWdodCA9IGhpZ2hsaWdodDtcbiAgaGxqcy5oaWdobGlnaHRBdXRvID0gaGlnaGxpZ2h0QXV0bztcbiAgaGxqcy5maXhNYXJrdXAgPSBmaXhNYXJrdXA7XG4gIGhsanMuaGlnaGxpZ2h0QmxvY2sgPSBoaWdobGlnaHRCbG9jaztcbiAgaGxqcy5jb25maWd1cmUgPSBjb25maWd1cmU7XG4gIGhsanMuaW5pdEhpZ2hsaWdodGluZyA9IGluaXRIaWdobGlnaHRpbmc7XG4gIGhsanMuaW5pdEhpZ2hsaWdodGluZ09uTG9hZCA9IGluaXRIaWdobGlnaHRpbmdPbkxvYWQ7XG4gIGhsanMucmVnaXN0ZXJMYW5ndWFnZSA9IHJlZ2lzdGVyTGFuZ3VhZ2U7XG4gIGhsanMubGlzdExhbmd1YWdlcyA9IGxpc3RMYW5ndWFnZXM7XG4gIGhsanMuZ2V0TGFuZ3VhZ2UgPSBnZXRMYW5ndWFnZTtcbiAgaGxqcy5hdXRvRGV0ZWN0aW9uID0gYXV0b0RldGVjdGlvbjtcbiAgaGxqcy5pbmhlcml0ID0gaW5oZXJpdDtcblxuICAvLyBDb21tb24gcmVnZXhwc1xuICBobGpzLklERU5UX1JFID0gJ1thLXpBLVpdXFxcXHcqJztcbiAgaGxqcy5VTkRFUlNDT1JFX0lERU5UX1JFID0gJ1thLXpBLVpfXVxcXFx3Kic7XG4gIGhsanMuTlVNQkVSX1JFID0gJ1xcXFxiXFxcXGQrKFxcXFwuXFxcXGQrKT8nO1xuICBobGpzLkNfTlVNQkVSX1JFID0gJygtPykoXFxcXGIwW3hYXVthLWZBLUYwLTldK3woXFxcXGJcXFxcZCsoXFxcXC5cXFxcZCopP3xcXFxcLlxcXFxkKykoW2VFXVstK10/XFxcXGQrKT8pJzsgLy8gMHguLi4sIDAuLi4sIGRlY2ltYWwsIGZsb2F0XG4gIGhsanMuQklOQVJZX05VTUJFUl9SRSA9ICdcXFxcYigwYlswMV0rKSc7IC8vIDBiLi4uXG4gIGhsanMuUkVfU1RBUlRFUlNfUkUgPSAnIXwhPXwhPT18JXwlPXwmfCYmfCY9fFxcXFwqfFxcXFwqPXxcXFxcK3xcXFxcKz18LHwtfC09fC89fC98Onw7fDw8fDw8PXw8PXw8fD09PXw9PXw9fD4+Pj18Pj49fD49fD4+Pnw+Pnw+fFxcXFw/fFxcXFxbfFxcXFx7fFxcXFwofFxcXFxefFxcXFxePXxcXFxcfHxcXFxcfD18XFxcXHxcXFxcfHx+JztcblxuICAvLyBDb21tb24gbW9kZXNcbiAgaGxqcy5CQUNLU0xBU0hfRVNDQVBFID0ge1xuICAgIGJlZ2luOiAnXFxcXFxcXFxbXFxcXHNcXFxcU10nLCByZWxldmFuY2U6IDBcbiAgfTtcbiAgaGxqcy5BUE9TX1NUUklOR19NT0RFID0ge1xuICAgIGNsYXNzTmFtZTogJ3N0cmluZycsXG4gICAgYmVnaW46ICdcXCcnLCBlbmQ6ICdcXCcnLFxuICAgIGlsbGVnYWw6ICdcXFxcbicsXG4gICAgY29udGFpbnM6IFtobGpzLkJBQ0tTTEFTSF9FU0NBUEVdXG4gIH07XG4gIGhsanMuUVVPVEVfU1RSSU5HX01PREUgPSB7XG4gICAgY2xhc3NOYW1lOiAnc3RyaW5nJyxcbiAgICBiZWdpbjogJ1wiJywgZW5kOiAnXCInLFxuICAgIGlsbGVnYWw6ICdcXFxcbicsXG4gICAgY29udGFpbnM6IFtobGpzLkJBQ0tTTEFTSF9FU0NBUEVdXG4gIH07XG4gIGhsanMuUEhSQVNBTF9XT1JEU19NT0RFID0ge1xuICAgIGJlZ2luOiAvXFxiKGF8YW58dGhlfGFyZXxJJ218aXNuJ3R8ZG9uJ3R8ZG9lc24ndHx3b24ndHxidXR8anVzdHxzaG91bGR8cHJldHR5fHNpbXBseXxlbm91Z2h8Z29ubmF8Z29pbmd8d3RmfHNvfHN1Y2h8d2lsbHx5b3V8eW91cnx0aGV5fGxpa2V8bW9yZSlcXGIvXG4gIH07XG4gIGhsanMuQ09NTUVOVCA9IGZ1bmN0aW9uIChiZWdpbiwgZW5kLCBpbmhlcml0cykge1xuICAgIHZhciBtb2RlID0gaGxqcy5pbmhlcml0KFxuICAgICAge1xuICAgICAgICBjbGFzc05hbWU6ICdjb21tZW50JyxcbiAgICAgICAgYmVnaW46IGJlZ2luLCBlbmQ6IGVuZCxcbiAgICAgICAgY29udGFpbnM6IFtdXG4gICAgICB9LFxuICAgICAgaW5oZXJpdHMgfHwge31cbiAgICApO1xuICAgIG1vZGUuY29udGFpbnMucHVzaChobGpzLlBIUkFTQUxfV09SRFNfTU9ERSk7XG4gICAgbW9kZS5jb250YWlucy5wdXNoKHtcbiAgICAgIGNsYXNzTmFtZTogJ2RvY3RhZycsXG4gICAgICBiZWdpbjogJyg/OlRPRE98RklYTUV8Tk9URXxCVUd8WFhYKTonLFxuICAgICAgcmVsZXZhbmNlOiAwXG4gICAgfSk7XG4gICAgcmV0dXJuIG1vZGU7XG4gIH07XG4gIGhsanMuQ19MSU5FX0NPTU1FTlRfTU9ERSA9IGhsanMuQ09NTUVOVCgnLy8nLCAnJCcpO1xuICBobGpzLkNfQkxPQ0tfQ09NTUVOVF9NT0RFID0gaGxqcy5DT01NRU5UKCcvXFxcXConLCAnXFxcXCovJyk7XG4gIGhsanMuSEFTSF9DT01NRU5UX01PREUgPSBobGpzLkNPTU1FTlQoJyMnLCAnJCcpO1xuICBobGpzLk5VTUJFUl9NT0RFID0ge1xuICAgIGNsYXNzTmFtZTogJ251bWJlcicsXG4gICAgYmVnaW46IGhsanMuTlVNQkVSX1JFLFxuICAgIHJlbGV2YW5jZTogMFxuICB9O1xuICBobGpzLkNfTlVNQkVSX01PREUgPSB7XG4gICAgY2xhc3NOYW1lOiAnbnVtYmVyJyxcbiAgICBiZWdpbjogaGxqcy5DX05VTUJFUl9SRSxcbiAgICByZWxldmFuY2U6IDBcbiAgfTtcbiAgaGxqcy5CSU5BUllfTlVNQkVSX01PREUgPSB7XG4gICAgY2xhc3NOYW1lOiAnbnVtYmVyJyxcbiAgICBiZWdpbjogaGxqcy5CSU5BUllfTlVNQkVSX1JFLFxuICAgIHJlbGV2YW5jZTogMFxuICB9O1xuICBobGpzLkNTU19OVU1CRVJfTU9ERSA9IHtcbiAgICBjbGFzc05hbWU6ICdudW1iZXInLFxuICAgIGJlZ2luOiBobGpzLk5VTUJFUl9SRSArICcoJyArXG4gICAgICAnJXxlbXxleHxjaHxyZW0nICArXG4gICAgICAnfHZ3fHZofHZtaW58dm1heCcgK1xuICAgICAgJ3xjbXxtbXxpbnxwdHxwY3xweCcgK1xuICAgICAgJ3xkZWd8Z3JhZHxyYWR8dHVybicgK1xuICAgICAgJ3xzfG1zJyArXG4gICAgICAnfEh6fGtIeicgK1xuICAgICAgJ3xkcGl8ZHBjbXxkcHB4JyArXG4gICAgICAnKT8nLFxuICAgIHJlbGV2YW5jZTogMFxuICB9O1xuICBobGpzLlJFR0VYUF9NT0RFID0ge1xuICAgIGNsYXNzTmFtZTogJ3JlZ2V4cCcsXG4gICAgYmVnaW46IC9cXC8vLCBlbmQ6IC9cXC9bZ2ltdXldKi8sXG4gICAgaWxsZWdhbDogL1xcbi8sXG4gICAgY29udGFpbnM6IFtcbiAgICAgIGhsanMuQkFDS1NMQVNIX0VTQ0FQRSxcbiAgICAgIHtcbiAgICAgICAgYmVnaW46IC9cXFsvLCBlbmQ6IC9cXF0vLFxuICAgICAgICByZWxldmFuY2U6IDAsXG4gICAgICAgIGNvbnRhaW5zOiBbaGxqcy5CQUNLU0xBU0hfRVNDQVBFXVxuICAgICAgfVxuICAgIF1cbiAgfTtcbiAgaGxqcy5USVRMRV9NT0RFID0ge1xuICAgIGNsYXNzTmFtZTogJ3RpdGxlJyxcbiAgICBiZWdpbjogaGxqcy5JREVOVF9SRSxcbiAgICByZWxldmFuY2U6IDBcbiAgfTtcbiAgaGxqcy5VTkRFUlNDT1JFX1RJVExFX01PREUgPSB7XG4gICAgY2xhc3NOYW1lOiAndGl0bGUnLFxuICAgIGJlZ2luOiBobGpzLlVOREVSU0NPUkVfSURFTlRfUkUsXG4gICAgcmVsZXZhbmNlOiAwXG4gIH07XG4gIGhsanMuTUVUSE9EX0dVQVJEID0ge1xuICAgIC8vIGV4Y2x1ZGVzIG1ldGhvZCBuYW1lcyBmcm9tIGtleXdvcmQgcHJvY2Vzc2luZ1xuICAgIGJlZ2luOiAnXFxcXC5cXFxccyonICsgaGxqcy5VTkRFUlNDT1JFX0lERU5UX1JFLFxuICAgIHJlbGV2YW5jZTogMFxuICB9O1xuXG4gIHJldHVybiBobGpzO1xufSkpO1xuIiwibW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbihobGpzKSB7XG4gIHZhciBJREVOVF9SRSA9ICdbQS1aYS16JF9dWzAtOUEtWmEteiRfXSonO1xuICB2YXIgS0VZV09SRFMgPSB7XG4gICAga2V5d29yZDpcbiAgICAgICdpbiBvZiBpZiBmb3Igd2hpbGUgZmluYWxseSB2YXIgbmV3IGZ1bmN0aW9uIGRvIHJldHVybiB2b2lkIGVsc2UgYnJlYWsgY2F0Y2ggJyArXG4gICAgICAnaW5zdGFuY2VvZiB3aXRoIHRocm93IGNhc2UgZGVmYXVsdCB0cnkgdGhpcyBzd2l0Y2ggY29udGludWUgdHlwZW9mIGRlbGV0ZSAnICtcbiAgICAgICdsZXQgeWllbGQgY29uc3QgZXhwb3J0IHN1cGVyIGRlYnVnZ2VyIGFzIGFzeW5jIGF3YWl0IHN0YXRpYyAnICtcbiAgICAgIC8vIEVDTUFTY3JpcHQgNiBtb2R1bGVzIGltcG9ydFxuICAgICAgJ2ltcG9ydCBmcm9tIGFzJ1xuICAgICxcbiAgICBsaXRlcmFsOlxuICAgICAgJ3RydWUgZmFsc2UgbnVsbCB1bmRlZmluZWQgTmFOIEluZmluaXR5JyxcbiAgICBidWlsdF9pbjpcbiAgICAgICdldmFsIGlzRmluaXRlIGlzTmFOIHBhcnNlRmxvYXQgcGFyc2VJbnQgZGVjb2RlVVJJIGRlY29kZVVSSUNvbXBvbmVudCAnICtcbiAgICAgICdlbmNvZGVVUkkgZW5jb2RlVVJJQ29tcG9uZW50IGVzY2FwZSB1bmVzY2FwZSBPYmplY3QgRnVuY3Rpb24gQm9vbGVhbiBFcnJvciAnICtcbiAgICAgICdFdmFsRXJyb3IgSW50ZXJuYWxFcnJvciBSYW5nZUVycm9yIFJlZmVyZW5jZUVycm9yIFN0b3BJdGVyYXRpb24gU3ludGF4RXJyb3IgJyArXG4gICAgICAnVHlwZUVycm9yIFVSSUVycm9yIE51bWJlciBNYXRoIERhdGUgU3RyaW5nIFJlZ0V4cCBBcnJheSBGbG9hdDMyQXJyYXkgJyArXG4gICAgICAnRmxvYXQ2NEFycmF5IEludDE2QXJyYXkgSW50MzJBcnJheSBJbnQ4QXJyYXkgVWludDE2QXJyYXkgVWludDMyQXJyYXkgJyArXG4gICAgICAnVWludDhBcnJheSBVaW50OENsYW1wZWRBcnJheSBBcnJheUJ1ZmZlciBEYXRhVmlldyBKU09OIEludGwgYXJndW1lbnRzIHJlcXVpcmUgJyArXG4gICAgICAnbW9kdWxlIGNvbnNvbGUgd2luZG93IGRvY3VtZW50IFN5bWJvbCBTZXQgTWFwIFdlYWtTZXQgV2Vha01hcCBQcm94eSBSZWZsZWN0ICcgK1xuICAgICAgJ1Byb21pc2UnXG4gIH07XG4gIHZhciBOVU1CRVIgPSB7XG4gICAgY2xhc3NOYW1lOiAnbnVtYmVyJyxcbiAgICB2YXJpYW50czogW1xuICAgICAgeyBiZWdpbjogJ1xcXFxiKDBbYkJdWzAxXSspbj8nIH0sXG4gICAgICB7IGJlZ2luOiAnXFxcXGIoMFtvT11bMC03XSspbj8nIH0sXG4gICAgICB7IGJlZ2luOiBobGpzLkNfTlVNQkVSX1JFICsgJ24/JyB9XG4gICAgXSxcbiAgICByZWxldmFuY2U6IDBcbiAgfTtcbiAgdmFyIFNVQlNUID0ge1xuICAgIGNsYXNzTmFtZTogJ3N1YnN0JyxcbiAgICBiZWdpbjogJ1xcXFwkXFxcXHsnLCBlbmQ6ICdcXFxcfScsXG4gICAga2V5d29yZHM6IEtFWVdPUkRTLFxuICAgIGNvbnRhaW5zOiBbXSAgLy8gZGVmaW5lZCBsYXRlclxuICB9O1xuICB2YXIgSFRNTF9URU1QTEFURSA9IHtcbiAgICBiZWdpbjogJ2h0bWxgJywgZW5kOiAnJyxcbiAgICBzdGFydHM6IHtcbiAgICAgIGVuZDogJ2AnLCByZXR1cm5FbmQ6IGZhbHNlLFxuICAgICAgY29udGFpbnM6IFtcbiAgICAgICAgaGxqcy5CQUNLU0xBU0hfRVNDQVBFLFxuICAgICAgICBTVUJTVFxuICAgICAgXSxcbiAgICAgIHN1Ykxhbmd1YWdlOiAneG1sJyxcbiAgICB9XG4gIH07XG4gIHZhciBDU1NfVEVNUExBVEUgPSB7XG4gICAgYmVnaW46ICdjc3NgJywgZW5kOiAnJyxcbiAgICBzdGFydHM6IHtcbiAgICAgIGVuZDogJ2AnLCByZXR1cm5FbmQ6IGZhbHNlLFxuICAgICAgY29udGFpbnM6IFtcbiAgICAgICAgaGxqcy5CQUNLU0xBU0hfRVNDQVBFLFxuICAgICAgICBTVUJTVFxuICAgICAgXSxcbiAgICAgIHN1Ykxhbmd1YWdlOiAnY3NzJyxcbiAgICB9XG4gIH07XG4gIHZhciBURU1QTEFURV9TVFJJTkcgPSB7XG4gICAgY2xhc3NOYW1lOiAnc3RyaW5nJyxcbiAgICBiZWdpbjogJ2AnLCBlbmQ6ICdgJyxcbiAgICBjb250YWluczogW1xuICAgICAgaGxqcy5CQUNLU0xBU0hfRVNDQVBFLFxuICAgICAgU1VCU1RcbiAgICBdXG4gIH07XG4gIFNVQlNULmNvbnRhaW5zID0gW1xuICAgIGhsanMuQVBPU19TVFJJTkdfTU9ERSxcbiAgICBobGpzLlFVT1RFX1NUUklOR19NT0RFLFxuICAgIEhUTUxfVEVNUExBVEUsXG4gICAgQ1NTX1RFTVBMQVRFLFxuICAgIFRFTVBMQVRFX1NUUklORyxcbiAgICBOVU1CRVIsXG4gICAgaGxqcy5SRUdFWFBfTU9ERVxuICBdO1xuICB2YXIgUEFSQU1TX0NPTlRBSU5TID0gU1VCU1QuY29udGFpbnMuY29uY2F0KFtcbiAgICBobGpzLkNfQkxPQ0tfQ09NTUVOVF9NT0RFLFxuICAgIGhsanMuQ19MSU5FX0NPTU1FTlRfTU9ERVxuICBdKTtcblxuICByZXR1cm4ge1xuICAgIGFsaWFzZXM6IFsnanMnLCAnanN4J10sXG4gICAga2V5d29yZHM6IEtFWVdPUkRTLFxuICAgIGNvbnRhaW5zOiBbXG4gICAgICB7XG4gICAgICAgIGNsYXNzTmFtZTogJ21ldGEnLFxuICAgICAgICByZWxldmFuY2U6IDEwLFxuICAgICAgICBiZWdpbjogL15cXHMqWydcIl11c2UgKHN0cmljdHxhc20pWydcIl0vXG4gICAgICB9LFxuICAgICAge1xuICAgICAgICBjbGFzc05hbWU6ICdtZXRhJyxcbiAgICAgICAgYmVnaW46IC9eIyEvLCBlbmQ6IC8kL1xuICAgICAgfSxcbiAgICAgIGhsanMuQVBPU19TVFJJTkdfTU9ERSxcbiAgICAgIGhsanMuUVVPVEVfU1RSSU5HX01PREUsXG4gICAgICBIVE1MX1RFTVBMQVRFLFxuICAgICAgQ1NTX1RFTVBMQVRFLFxuICAgICAgVEVNUExBVEVfU1RSSU5HLFxuICAgICAgaGxqcy5DX0xJTkVfQ09NTUVOVF9NT0RFLFxuICAgICAgaGxqcy5DX0JMT0NLX0NPTU1FTlRfTU9ERSxcbiAgICAgIE5VTUJFUixcbiAgICAgIHsgLy8gb2JqZWN0IGF0dHIgY29udGFpbmVyXG4gICAgICAgIGJlZ2luOiAvW3ssXFxuXVxccyovLCByZWxldmFuY2U6IDAsXG4gICAgICAgIGNvbnRhaW5zOiBbXG4gICAgICAgICAge1xuICAgICAgICAgICAgYmVnaW46IElERU5UX1JFICsgJ1xcXFxzKjonLCByZXR1cm5CZWdpbjogdHJ1ZSxcbiAgICAgICAgICAgIHJlbGV2YW5jZTogMCxcbiAgICAgICAgICAgIGNvbnRhaW5zOiBbe2NsYXNzTmFtZTogJ2F0dHInLCBiZWdpbjogSURFTlRfUkUsIHJlbGV2YW5jZTogMH1dXG4gICAgICAgICAgfVxuICAgICAgICBdXG4gICAgICB9LFxuICAgICAgeyAvLyBcInZhbHVlXCIgY29udGFpbmVyXG4gICAgICAgIGJlZ2luOiAnKCcgKyBobGpzLlJFX1NUQVJURVJTX1JFICsgJ3xcXFxcYihjYXNlfHJldHVybnx0aHJvdylcXFxcYilcXFxccyonLFxuICAgICAgICBrZXl3b3JkczogJ3JldHVybiB0aHJvdyBjYXNlJyxcbiAgICAgICAgY29udGFpbnM6IFtcbiAgICAgICAgICBobGpzLkNfTElORV9DT01NRU5UX01PREUsXG4gICAgICAgICAgaGxqcy5DX0JMT0NLX0NPTU1FTlRfTU9ERSxcbiAgICAgICAgICBobGpzLlJFR0VYUF9NT0RFLFxuICAgICAgICAgIHtcbiAgICAgICAgICAgIGNsYXNzTmFtZTogJ2Z1bmN0aW9uJyxcbiAgICAgICAgICAgIGJlZ2luOiAnKFxcXFwoLio/XFxcXCl8JyArIElERU5UX1JFICsgJylcXFxccyo9PicsIHJldHVybkJlZ2luOiB0cnVlLFxuICAgICAgICAgICAgZW5kOiAnXFxcXHMqPT4nLFxuICAgICAgICAgICAgY29udGFpbnM6IFtcbiAgICAgICAgICAgICAge1xuICAgICAgICAgICAgICAgIGNsYXNzTmFtZTogJ3BhcmFtcycsXG4gICAgICAgICAgICAgICAgdmFyaWFudHM6IFtcbiAgICAgICAgICAgICAgICAgIHtcbiAgICAgICAgICAgICAgICAgICAgYmVnaW46IElERU5UX1JFXG4gICAgICAgICAgICAgICAgICB9LFxuICAgICAgICAgICAgICAgICAge1xuICAgICAgICAgICAgICAgICAgICBiZWdpbjogL1xcKFxccypcXCkvLFxuICAgICAgICAgICAgICAgICAgfSxcbiAgICAgICAgICAgICAgICAgIHtcbiAgICAgICAgICAgICAgICAgICAgYmVnaW46IC9cXCgvLCBlbmQ6IC9cXCkvLFxuICAgICAgICAgICAgICAgICAgICBleGNsdWRlQmVnaW46IHRydWUsIGV4Y2x1ZGVFbmQ6IHRydWUsXG4gICAgICAgICAgICAgICAgICAgIGtleXdvcmRzOiBLRVlXT1JEUyxcbiAgICAgICAgICAgICAgICAgICAgY29udGFpbnM6IFBBUkFNU19DT05UQUlOU1xuICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIF1cbiAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgXVxuICAgICAgICAgIH0sXG4gICAgICAgICAge1xuICAgICAgICAgICAgY2xhc3NOYW1lOiAnJyxcbiAgICAgICAgICAgIGJlZ2luOiAvXFxzLyxcbiAgICAgICAgICAgIGVuZDogL1xccyovLFxuICAgICAgICAgICAgc2tpcDogdHJ1ZSxcbiAgICAgICAgICB9LFxuICAgICAgICAgIHsgLy8gRTRYIC8gSlNYXG4gICAgICAgICAgICBiZWdpbjogLzwvLCBlbmQ6IC8oXFwvW0EtWmEtejAtOVxcXFwuXzotXSt8W0EtWmEtejAtOVxcXFwuXzotXStcXC8pPi8sXG4gICAgICAgICAgICBzdWJMYW5ndWFnZTogJ3htbCcsXG4gICAgICAgICAgICBjb250YWluczogW1xuICAgICAgICAgICAgICB7IGJlZ2luOiAvPFtBLVphLXowLTlcXFxcLl86LV0rXFxzKlxcLz4vLCBza2lwOiB0cnVlIH0sXG4gICAgICAgICAgICAgIHtcbiAgICAgICAgICAgICAgICBiZWdpbjogLzxbQS1aYS16MC05XFxcXC5fOi1dKy8sIGVuZDogLyhcXC9bQS1aYS16MC05XFxcXC5fOi1dK3xbQS1aYS16MC05XFxcXC5fOi1dK1xcLyk+Lywgc2tpcDogdHJ1ZSxcbiAgICAgICAgICAgICAgICBjb250YWluczogW1xuICAgICAgICAgICAgICAgICAgeyBiZWdpbjogLzxbQS1aYS16MC05XFxcXC5fOi1dK1xccypcXC8+Lywgc2tpcDogdHJ1ZSB9LFxuICAgICAgICAgICAgICAgICAgJ3NlbGYnXG4gICAgICAgICAgICAgICAgXVxuICAgICAgICAgICAgICB9XG4gICAgICAgICAgICBdXG4gICAgICAgICAgfVxuICAgICAgICBdLFxuICAgICAgICByZWxldmFuY2U6IDBcbiAgICAgIH0sXG4gICAgICB7XG4gICAgICAgIGNsYXNzTmFtZTogJ2Z1bmN0aW9uJyxcbiAgICAgICAgYmVnaW5LZXl3b3JkczogJ2Z1bmN0aW9uJywgZW5kOiAvXFx7LywgZXhjbHVkZUVuZDogdHJ1ZSxcbiAgICAgICAgY29udGFpbnM6IFtcbiAgICAgICAgICBobGpzLmluaGVyaXQoaGxqcy5USVRMRV9NT0RFLCB7YmVnaW46IElERU5UX1JFfSksXG4gICAgICAgICAge1xuICAgICAgICAgICAgY2xhc3NOYW1lOiAncGFyYW1zJyxcbiAgICAgICAgICAgIGJlZ2luOiAvXFwoLywgZW5kOiAvXFwpLyxcbiAgICAgICAgICAgIGV4Y2x1ZGVCZWdpbjogdHJ1ZSxcbiAgICAgICAgICAgIGV4Y2x1ZGVFbmQ6IHRydWUsXG4gICAgICAgICAgICBjb250YWluczogUEFSQU1TX0NPTlRBSU5TXG4gICAgICAgICAgfVxuICAgICAgICBdLFxuICAgICAgICBpbGxlZ2FsOiAvXFxbfCUvXG4gICAgICB9LFxuICAgICAge1xuICAgICAgICBiZWdpbjogL1xcJFsoLl0vIC8vIHJlbGV2YW5jZSBib29zdGVyIGZvciBhIHBhdHRlcm4gY29tbW9uIHRvIEpTIGxpYnM6IGAkKHNvbWV0aGluZylgIGFuZCBgJC5zb21ldGhpbmdgXG4gICAgICB9LFxuICAgICAgaGxqcy5NRVRIT0RfR1VBUkQsXG4gICAgICB7IC8vIEVTNiBjbGFzc1xuICAgICAgICBjbGFzc05hbWU6ICdjbGFzcycsXG4gICAgICAgIGJlZ2luS2V5d29yZHM6ICdjbGFzcycsIGVuZDogL1t7Oz1dLywgZXhjbHVkZUVuZDogdHJ1ZSxcbiAgICAgICAgaWxsZWdhbDogL1s6XCJcXFtcXF1dLyxcbiAgICAgICAgY29udGFpbnM6IFtcbiAgICAgICAgICB7YmVnaW5LZXl3b3JkczogJ2V4dGVuZHMnfSxcbiAgICAgICAgICBobGpzLlVOREVSU0NPUkVfVElUTEVfTU9ERVxuICAgICAgICBdXG4gICAgICB9LFxuICAgICAge1xuICAgICAgICBiZWdpbktleXdvcmRzOiAnY29uc3RydWN0b3IgZ2V0IHNldCcsIGVuZDogL1xcey8sIGV4Y2x1ZGVFbmQ6IHRydWVcbiAgICAgIH1cbiAgICBdLFxuICAgIGlsbGVnYWw6IC8jKD8hISkvXG4gIH07XG59OyIsIi8vIFlvdSBjYW4gd3JpdGUgYSBjYWxsIGFuZCBpbXBvcnQgeW91ciBmdW5jdGlvbnMgaW4gdGhpcyBmaWxlLlxuLy9cbi8vIFRoaXMgZmlsZSB3aWxsIGJlIGNvbXBpbGVkIGludG8gYXBwLmpzIGFuZCB3aWxsIG5vdCBiZSBtaW5pZmllZC5cbi8vIEZlZWwgZnJlZSB3aXRoIHVzaW5nIEVTNiBoZXJlLlxuXG4vLyBpbXBvcnQge05BTUV9IGZyb20gJy4vbW9kdWxlcy8uLi4nO1xuaW1wb3J0IGhsanMgZnJvbSAnaGlnaGxpZ2h0LmpzL2xpYi9oaWdobGlnaHQnO1xuaW1wb3J0IGphdmFzY3JpcHQgZnJvbSAnaGlnaGxpZ2h0LmpzL2xpYi9sYW5ndWFnZXMvamF2YXNjcmlwdCc7XG5pbXBvcnQgcGFnZVRyYW5zaXRpb24gZnJvbSAnLi9tb2R1bGVzL3BhZ2VUcmFuc2l0aW9uJztcbmltcG9ydCBoYW1idXJnZXIgZnJvbSAnLi9tb2R1bGVzL2hhbWJ1cmdlcic7XG4vLyBpbXBvcnQgcGFnZVNjcm9sbCBmcm9tICcuL21vZHVsZXMvcGFnZVNjcm9sbCc7XG5cbigoJCkgPT4ge1xuICAvLyBXaGVuIERPTSBpcyByZWFkeVxuICAkKCgpID0+IHtcbiAgICBwYWdlVHJhbnNpdGlvbi50cmFuc2l0aW9uKCk7XG4gICAgJCgnI2N1cnJlbnRZZWFyJykudGV4dChgJHtuZXcgRGF0ZSgpLmdldEZ1bGxZZWFyKCl9YCk7XG4gICAgLy8gcGFnZVNjcm9sbC5zbW9vdGhTY3JvbGxpbmcoKTtcbiAgICBoYW1idXJnZXIuaGFuZGxlcigpO1xuICAgIGhsanMucmVnaXN0ZXJMYW5ndWFnZSgnamF2YXNjcmlwdCcsIGphdmFzY3JpcHQpO1xuICAgIGhsanMuaW5pdEhpZ2hsaWdodGluZ09uTG9hZCgpO1xuICB9KTtcbn0pKGpRdWVyeSk7XG4iLCJjb25zdCBoYW1idXJnZXIgPSB7XG4gIGhhbmRsZXIoKSB7XG4gICAgY29uc3QgJGJvZHkgPSAkKCdib2R5Jyk7XG4gICAgY29uc3QgJGJ0biA9ICQoJy5oYW1idXJnZXInKTtcbiAgICBjb25zdCAkbWVudSA9ICQoJy5tZW51Jyk7XG4gICAgY29uc3QgJHN1Ym1lbnUgPSAkKCcuc3VibWVudScpO1xuICAgIGNvbnN0ICRzdWJtZW51TGluayA9ICQoJy5tZW51X19saW5rLS1zdWJtZW51Jyk7XG4gICAgY29uc3QgJHN1Ym1lbnVDbG9zZSA9ICQoJy5zdWJtZW51X19pdGVtLS1zdGF0aWMnKTtcbiAgICBjb25zdCBPUEVORURfQ0xBU1MgPSAnb3BlbmVkJztcbiAgICBjb25zdCBPVkVSTEFZX0NMQVNTID0gJ292ZXJsYXknO1xuICAgIGZ1bmN0aW9uIGhhbWJ1cmdlclRvZ2dsZSgpIHtcbiAgICAgICRidG4ub24oJ2NsaWNrJywgZnVuY3Rpb24gc3dpdGNoZXIoKSB7XG4gICAgICAgICQodGhpcykudG9nZ2xlQ2xhc3MoT1BFTkVEX0NMQVNTKTtcbiAgICAgICAgJG1lbnUudG9nZ2xlQ2xhc3MoT1BFTkVEX0NMQVNTKTtcbiAgICAgICAgJGJvZHkudG9nZ2xlQ2xhc3MoT1ZFUkxBWV9DTEFTUyk7XG4gICAgICAgICRzdWJtZW51LnJlbW92ZUNsYXNzKE9QRU5FRF9DTEFTUyk7XG4gICAgICB9KTtcbiAgICB9XG4gICAgZnVuY3Rpb24gc3VibWVudVRvZ2dsZSgpIHtcbiAgICAgICRzdWJtZW51TGluay5vbignY2xpY2snLCAoZXZlbnQpID0+IHtcbiAgICAgICAgZXZlbnQucHJldmVudERlZmF1bHQoKTtcbiAgICAgICAgJHN1Ym1lbnUudG9nZ2xlQ2xhc3MoT1BFTkVEX0NMQVNTKTtcbiAgICAgIH0pO1xuICAgICAgJHN1Ym1lbnVDbG9zZS5vbignY2xpY2snLCAoZXZlbnQpID0+IHtcbiAgICAgICAgZXZlbnQucHJldmVudERlZmF1bHQoKTtcbiAgICAgICAgJHN1Ym1lbnUudG9nZ2xlQ2xhc3MoT1BFTkVEX0NMQVNTKTtcbiAgICAgIH0pO1xuICAgIH1cbiAgICBmdW5jdGlvbiBpbml0KCkge1xuICAgICAgaWYgKCEkYnRuLmxlbmd0aCkgcmV0dXJuO1xuICAgICAgaGFtYnVyZ2VyVG9nZ2xlKCk7XG4gICAgICBpZiAoISRzdWJtZW51Lmxlbmd0aCkgcmV0dXJuO1xuICAgICAgc3VibWVudVRvZ2dsZSgpO1xuICAgIH1cbiAgICByZXR1cm4ge1xuICAgICAgaW5pdDogaW5pdCgpLFxuICAgIH07XG4gIH0sXG59O1xuXG5leHBvcnQgZGVmYXVsdCBoYW1idXJnZXI7XG4iLCJjb25zdCBwYWdlVHJhbnNpdGlvbiA9IHtcbiAgdHJhbnNpdGlvbigpIHtcbiAgICBjb25zdCAkYm9keSA9ICQoJ2JvZHknKTtcbiAgICBjb25zdCAkbmF2TGluayA9ICQoJy5tZW51X19saW5rJyk7XG4gICAgY29uc3QgJGJsb2dMaW5rID0gJCgnLmJsb2dfX3Bvc3QgYScpO1xuICAgIGNvbnN0ICRiYWNrTGluayA9ICQoJy5iYWNrLXRvLWJsb2cnKTtcbiAgICBmdW5jdGlvbiBwYWdlT25Mb2FkKCkge1xuICAgICAgJGJvZHkuZmFkZUluKDEwMDApO1xuICAgIH1cbiAgICBmdW5jdGlvbiBmYWRlT3V0T25DbGljayhsaW5rKSB7XG4gICAgICBsaW5rLm9uKCdjbGljaycsIGZ1bmN0aW9uIChldmVudCkge1xuICAgICAgICBldmVudC5wcmV2ZW50RGVmYXVsdCgpO1xuICAgICAgICBjb25zdCBsaW5rTG9jYXRpb24gPSB0aGlzLmhyZWY7XG4gICAgICAgICRib2R5LmZhZGVPdXQoMTAwMCwgKCkgPT4ge1xuICAgICAgICAgIHdpbmRvdy5sb2NhdGlvbiA9IGxpbmtMb2NhdGlvbjtcbiAgICAgICAgfSk7XG4gICAgICB9KTtcbiAgICB9XG4gICAgZnVuY3Rpb24gaW5pdCgpIHtcbiAgICAgIGlmICghJGJvZHkubGVuZ3RoKSByZXR1cm47XG4gICAgICAkKHdpbmRvdykub24oJ2xvYWQnLCBwYWdlT25Mb2FkKCkpO1xuICAgICAgZmFkZU91dE9uQ2xpY2soJG5hdkxpbmspO1xuICAgICAgZmFkZU91dE9uQ2xpY2soJGJsb2dMaW5rKTtcbiAgICAgIGZhZGVPdXRPbkNsaWNrKCRiYWNrTGluayk7XG4gICAgfVxuICAgIHJldHVybiB7XG4gICAgICBpbml0OiBpbml0KCksXG4gICAgfTtcbiAgfSxcbn07XG5cbmV4cG9ydCBkZWZhdWx0IHBhZ2VUcmFuc2l0aW9uO1xuIl19
