# Create a Native Circle in GL JS

This demo uses turf.js to create a geojson circle class that works with GL JS to edit
circle features.

The bulk of the code is in `circle.js`, the geojson circle class.  Interactivity with
the circle object and map code is in `index.js`.


## Development

### Install Dependencies

`npm install`


### Run Locally

`npm start`


### Build Development Bundle 

`npm run build`


### Build Distributable Bundle

`npm run dist`


## Changelog

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

