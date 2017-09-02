# Spherical-Cap "Native Circle" for Mapbox GL JS

[![Build Status](http://jenkins.smithmicro.io:8080/job/mapbox-gl-circle-multibranch/job/master/lastBuild/badge/icon)](http://jenkins.smithmicro.io:8080/job/mapbox-gl-circle-multibranch/job/master/lastBuild/)
[![NPM Version](https://img.shields.io/npm/v/mapbox-gl-circle.svg)](https://www.npmjs.com/package/mapbox-gl-circle)

This project uses Turf.js to create a `google.maps.Circle` replacement, as a Mapbox GL JS compatible GeoJSON object.
Allowing the developer to define a circle using center coordinates and radius (in meters). And, optionally, enabling
interactive editing via draggable center/radius handles. Just like the Google original!


## Usage

See [API.md](https://github.com/mblomdahl/mapbox-gl-circle/blob/master/API.md).


## Development

### Install Dependencies

    npm install


### Run Locally

    npm start


### Build Development Bundle 

    npm run browserify


### Build Distributable Bundle

    npm run prepare


### Build `API.md` Docs

    npm run docs


## Changelog

### v. 1.2.4

* Bug fixes; passing `editable: false` when creating a circle is now respected, along with any styling options


### v. 1.2.3

* Publishing releases as `@latest` and pre-releases as `@next` to https://www.npmjs.com/package/mapbox-gl-circle

* CI update for Docker image, now publishes releases and pre-releases to SMSI internal Docker registry,
  http://docker.smithmicro.io/repository/mapbox-gl-circle


### v. 1.2.2

* CI updates, now integrates with GitHub and builds reliably (with unique version names) under 
  http://jenkins.smithmicro.io:8080/job/mapbox-gl-circle-multibranch/


### v. 1.2.1

* Added first-draft Jenkinsfile and started including `package-lock.json`
* Revised `package.json` scripts


### v. 1.2.0

* Removed dead code and unused methods
* Restructured library, moving ``circle.js -> lib/main.js`` and ``index.js -> example/index.js``
* Refactored helper functions from ``example/index.js`` into *MapboxCircle* class, obsoleted *index.html* with
  DOM updates in *example/index.js*
* Refactor into *MapboxCircle* into new-style ES6 class
* Made *MapboxCircle.animate()* and a bunch of properties private, added overridable defaults for fillColor/fillOpacity
* Updated ESLint config to respect browser/commonjs built-ins and added docs to *MapboxCircle* in order to
  align with ESLint JSDoc requirements
* Updated project details in package.json and committed first-draft API documentation


### v. 1.1.0

Updated circle from Mapbox [bl.ocks.org sample](https://bl.ocks.org/ryanbaumann/d286190943d6b4eb70e65a9f76eab5a5/d3cd7cea5feed0dfddbf3705b7936ff560f668d1).

Now provides handles for modifying position/radius. Seems to also do better
performance wise.


### v. 1.0.0

The initial 1.0.0 release is a modified version of
the [Draw-Circle.zip](https://www.dropbox.com/s/ya7am28y8eugd72/Draw-Circle.zip?dl=0)
archive we got from Mapbox.

Live demo of the original can be found here:
https://www.mapbox.com/labs/draw-circle/

