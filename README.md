# Starter Kit for Hugo Framework with Gulp

## Quickstart & Prerequisites

### [Hugo](https://gohugo.io/)

If you are on macOS and using Homebrew, you can install Hugo with the following one-liner:

````
$ brew install hugo
````

For more detailed explanations, read the installation guides that follow for [installing on macOS and Windows](https://gohugo.io/getting-started/installing/).

### [Node.js](https://nodejs.org)

Bring up a terminal and type `$ node -v`.
Node should respond with a version at or above 6.0.x.
If you need to install Node, go to [nodejs.org](https://nodejs.org) and click on the big green Install button.

### [Gulp](http://gulpjs.com)

Bring up a terminal and type `$ gulp -v`.
If Gulp is installed it should return a version number at or above 4.0.x.
If you need to install/upgrade Gulp, open up a terminal and type in the following:

````
$ npm install -g gulp
````

*This will install Gulp globally. Depending on your user account, you may need to [configure your system](https://github.com/sindresorhus/guides/blob/master/npm-global-without-sudo.md) to install packages globally without administrative privileges.*

### Local dependencies

Next, install the local dependencies Starter Kit requires:

````
$ npm install
````

That's it! You should now have everything needed to use the Starter Kit.

## Build

You must work with the source files in the **"src"** folder, using the collector, source files are compiled into **"assets"** folder.

To compile SASS and JS, build Hugo and start watching for changes use for source files:

````
$ gulp
````

To run Hugo server and start watching for changes:

````
$ hugo server -D -w
````

**-D** - include content marked as draft
**-w** - watch filesystem for changes and recreate as needed

If you want to **change the name of your theme**, you need to make changes to

````
gulp-config.js -> theme
````

## Project Structure

````

├── archetypes        #You can create new content files in Hugo using the `hugo new` command
├── content           #All content for your website will live inside this directory.
├── data              #This directory is used to store configuration files
├── gulp-settings     #
   ├── config.js      #Config for gulp
   ├── tasks          #Folder with tasks for gulpfile
├── themes            #Folder with Hugo theme
├── config.toml       #Hugo ships with a large number of configuration directives
├── gulpfile.js       #File with gulp tasks
├── LICENSE
├── package.json      #File with dependencies
└── README.md

````

## Theme Structure

```

├── assets          #Folder with JS and CSS files after compiling
├── layouts         #Stores templates in the form of .html files
├── src             #Folder with sources
└── static          #Stores all the static content: images, CSS, JavaScript, etc.

```

## SRC folder structure

```

├── js                          #Folder for storing js files
   ├── modules                  #Folder for storing js modules
   ├── app.js                   #Main js file
├── scss
   ├── abstracts                #Folder for storing scss files
      ├── _main_.scss           #Main scss file for abstracts
      ├── functions.scss        #Sass functions
      ├── helpers.scss          #Sass helpers
      ├── mixins.scss           #Sass mixins
      ├── variables.scss        #Sass variables that we can use in our scss files
   ├── base                     #Folder for storing base styles
      ├── _main.scss            #Main scss file for base styles      
      ├── forms.scss            #Sass styles for forms      
      ├── reset.scss            #Sass reset
      ├── typography.scss       #Sass styles for text      
   ├── components               #Global Reusable Presentational Components
   ├── layout                   #Global layout
   ├── pages                    #Global styles for pages
   ├── style.scss               #Main scss file (can be used for importing another files)
├── vendor_entries              #Folder for vendor entries(plugins)
  ├── vendor.js                 #File for plugins js 
  ├── vendor.scss               #File for plugins styles

```

Use `vendor_entries` to include plugins into your project.

## JS

You can use ES2015(ES6). ES2015 isn't introducing anything other than improvements to the JavaScript language and a few new features. 

It is not an alternative syntax or language like CoffeeScript or TypeScript. It's good ol' fashioned JavaScript. The reason so many people are excited is that this version introduces a lot of much-needed improvements to the language. 

* All custom **javascript** files are located in `js/` folder;
* Entry point for javascript is `src/js/app.js` you can **import** all your *.js* files from here using [ES6 import](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Statements/import) feature;
* All javascript is **babelified** so yes! You can use all kind of [ES6 features](https://babeljs.io/docs/learn-es2015/) here.
* All **extensions** must be installed by the [NPM](https://docs.npmjs.com/cli/install);
* After installing the extension you must **include its files**:
* **js files** must be included in `src/vendor_entries/vendor.js` by adding new elements to the **array**.

JavaScript code linting is done using esLint - a linter tool for identifying and reporting on patterns in JavaScript (used [airbnb-base rules](https://www.npmjs.com/package/eslint-config-airbnb-base)).

## SCSS

You can use [SASS](http://sass-lang.com/). Sass is the most mature, stable, and powerful professional grade CSS extension language in the world.

Sass is a CSS preprocessor — a layer between the stylesheets you author and the .css files you serve to the browser. Sass (short for Syntactically Awesome Stylesheets) plugs the holes in CSS as a language, allowing you to write DRY code that’ll be faster, more efficient, and easier to maintain. This Starter Kit is following Sass [guidelines](https://sass-guidelin.es/#architecture).

So while normal CSS doesn’t yet allow things like variables, mixins (reusable blocks of styles), and other goodies, Sass provides a syntax that does all of that and more—enabling “super functionality” in addition to your normal CSS.  

* All custom **scss** files locate in `src/scss/` folder;
* Entry point for all scss is `src/scss/style.scss` you can **import** all your *.scss* files from here;
* You **don't need** to write **prefixes** for different browsers like `-webkit` it will be done by the gulp.

The `src` directory above contains MDL's Sass files and the JavaScript sources for all MDL components.

* All **extensions** must be installed by the [NPM](https://docs.npmjs.com/cli/install);
* After installing the extension you must **include its files**:
* **css or sass files** must be included in `src/vendor_entries/vendor.scss` using `@import`.
