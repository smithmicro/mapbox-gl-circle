'use strict';

const mapboxgl = require('mapbox-gl');
const Circle = require('./circle.js');
// const turfInside = require('@turf/inside');
const turfHelpers = require('@turf/helpers');
const turfTruncate = require('@turf/truncate');
const turfDistance = require('@turf/distance');
const _ = require('lodash');

// noinspection SpellCheckingInspection
mapboxgl.accessToken = 'pk.eyJ1IjoicnNiYXVtYW5uIiwiYSI6IjdiOWEzZGIyMGNkOGY3NWQ4ZTBhN2Y5ZGU2Mzg2NDY2In0.jycgv7qwF8MMIWt4cT0RaQ';

let mapZoom = 12;

const map = new mapboxgl.Map({
    container: 'map',
    style: 'mapbox://styles/mapbox/streets-v9',
    center: [-75.343, 39.984],
    zoom: mapZoom
});

// Circle Setup

let center = [-75.343, 39.984];
let radius = 3;
let units = 'kilometers';
let properties = {foo: 'bar'};

let myCircle = new Circle(center, radius, {
    units: units,
    zoom: mapZoom,
    properties: properties
});

// DOM elements
let boundsEl = document.getElementById('circleBounds');
// let radiusEl = document.getElementById('selectRadius');
// let dragEl = document.getElementById('selectRadius');
let centerEl = document.getElementById('circleCenter');
let radiusLabelEl = document.getElementById('circleRadiusLabel');
boundsEl.innerHTML = 'Bounds: ' + myCircle.getBounds();
centerEl.innerHTML = 'Center: ' + myCircle.getCenter();
radiusLabelEl.innerHTML = 'Radius: ' + myCircle.getRadius() + ' ' + units;

// Helper functions

let animateCircle = function() {
    // map.on('sourcedata', onSourceData)
    map.getSource('circle-1').setData(myCircle.asGeojson());
    boundsEl.innerHTML = 'Bounds: ' + myCircle.getBounds();
    centerEl.innerHTML = 'Center: ' + myCircle.getCenter();
};

let adjustCirclePrecision = function() {
    let curZoom = map.getZoom();
    myCircle.updateZoom(curZoom);
    animateCircle();
};

let onMoveCircle = function(e) {
    let mousePoint = turfTruncate(turfHelpers.point(map.unproject(e.point).toArray()), 6);
    myCircle.updateCenter(mousePoint.geometry.coordinates);
    animateCircle();
};

let mouseUpCircle = function() {
    map.setPaintProperty('circle-center-point', 'circle-color', '#fb6a4a');
    map.dragPan.enable();
    map.off('mousemove', onMoveCircle);
};

let mouseDownCircle = function() {
    map.dragPan.disable();
    map.setPaintProperty('circle-center-point', 'circle-color', '#a50f15');
    map.on('mousemove', onMoveCircle);
    map.once('mouseup', mouseUpCircle);
};

let onMovePoint = function(event) {
    let clickPoint = map.unproject(event.point).toArray();
    myCircle.updateRadius(turfDistance(myCircle.getCenter(), clickPoint, units));
    radiusLabelEl.innerHTML = 'Radius: ' + Math.trunc(myCircle.getRadius()) + ' ' + units;
    animateCircle();
};

let mouseUpPoint = function() {
    map.setPaintProperty('circle-control-points', 'circle-color', 'white');
    map.dragPan.enable();
    map.off('mousemove', onMovePoint);
};

let mouseDownPoint = function() {
    map.dragPan.disable();
    map.setPaintProperty('circle-control-points', 'circle-color', '#a50f15');
    map.on('mousemove', onMovePoint);
    map.once('mouseup', mouseUpPoint);
};

let onMousemove = function(e) {
    map.off('mousedown', mouseDownCircle);
    map.off('mousedown', mouseDownPoint);

    let pointFeatures = map.queryRenderedFeatures(e.point, {
        layers: ['circle-control-points']
    });

    let circleFeatures = map.queryRenderedFeatures(e.point, {
        layers: ['circle-center-point']
    });

    if ((!pointFeatures.length) && (!circleFeatures.length)) {
        map.getCanvas().style.cursor = '';
    }

    if (pointFeatures.length) {
        map.getCanvas().style.cursor = 'pointer';
        map.once('mousedown', mouseDownPoint);
    } else if (circleFeatures.length) {
        map.getCanvas().style.cursor = 'pointer';
        map.once('mousedown', mouseDownCircle);
    }
};

map.on('load', () => {
    map.addSource('circle-1', {
        type: 'geojson',
        data: myCircle.asGeojson(),
        buffer: 1
    });

    map.addLayer({
        id: 'circle-line',
        type: 'line',
        source: 'circle-1',
        paint: {
            'line-color': '#fb6a4a',
            'line-width': {
                stops: [
                    [0, 0.1],
                    [16, 5]
                ]
            }
        },
        filter: ['==', '$type', 'Polygon']
    }, 'waterway-label');

    map.addLayer({
        id: 'circle-fill',
        type: 'fill',
        source: 'circle-1',
        paint: {
            'fill-color': '#fb6a4a',
            'fill-opacity': 0.5
        },
        filter: ['==', '$type', 'Polygon']
    }, 'waterway-label');

    map.addLayer({
        id: 'circle-control-points',
        type: 'circle',
        source: 'circle-1',
        paint: {
            'circle-color': 'white',
            'circle-radius': {
                stops: [
                    [0, 6],
                    [4, 10],
                    [18, 12]
                ]
            },
            'circle-stroke-color': 'black',
            'circle-stroke-width': {
                stops: [
                    [0, 0.1],
                    [8, 1],
                    [16, 4]
                ]
            }
        },
        filter: ['all', ['==', '$type', 'Point'],
            ['!=', 'type', 'center']
        ]
    });

    map.addLayer({
        id: 'circle-center-point',
        type: 'circle',
        source: 'circle-1',
        paint: {
            'circle-color': '#fb6a4a',
            'circle-radius': {
                stops: [
                    [0, 6],
                    [4, 10],
                    [18, 12]
                ]
            },
            'circle-stroke-color': 'black',
            'circle-stroke-width': {
                stops: [
                    [0, 0.1],
                    [8, 1],
                    [16, 4]
                ]
            }
        },
        filter: ['all', ['==', '$type', 'Point'],
            ['==', 'type', 'center']
        ]
    });

    // Add map event listeners
    map.on('zoomend', adjustCirclePrecision);
    map.on('mousemove', _.debounce(onMousemove, 16));
});
