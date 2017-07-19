'use strict';

const mapboxgl = require('mapbox-gl');
const Circle = require('./circle.js');
// const turfInside = require('turf-inside');
const turfHelpers = require('turf-helpers');
// const debounce = require('lodash.debounce');
const turfTruncate = require('@turf/truncate');

// noinspection SpellCheckingInspection
mapboxgl.accessToken = 'pk.eyJ1IjoicnNiYXVtYW5uIiwiYSI6IjdiOWEzZGIyMGNkOGY3NWQ4ZTBhN2Y5ZGU2Mzg2NDY2In0.jycgv7qwF8MMIWt4cT0RaQ';

const map = new mapboxgl.Map({
    container: 'map',
    style: 'mapbox://styles/mapbox/streets-v9',
    center: [-75.343, 39.984],
    zoom: 12,
});


// Circle Setup

let center = [-75.343, 39.984];
let radius = 3;
let steps = 60;
let units = 'kilometers';
let properties = {foo: 'bar'};

let myCircle = new Circle(center, radius, steps, units, properties);
let isCursorOverPoint;
let isDragging;


// DOM elements

let boundsElem = document.getElementById('circleBounds');
let radiusElem = document.getElementById('selectRadius');
// let dragElem = document.getElementById('selectRadius');
let centerElem = document.getElementById('circleCenter');
let radiusLabelElem = document.getElementById('circleRadiusLabel');

map.on('load', () => {
    map.addSource('circle-1', {
        type: 'geojson',
        data: myCircle.asGeojson(),
    });

    map.addLayer({
        id: 'circle-line',
        type: 'line',
        source: 'circle-1',
        paint: {
            'line-color': 'red',
            'line-width': {
                stops: [[0, 1], [22, 12]],
            },
        },
    }, 'waterway-label');

    map.addLayer({
        id: 'circle-fill',
        type: 'fill',
        source: 'circle-1',
        paint: {
            'fill-color': 'red',
            'fill-opacity': 0.5,
        },
    }, 'waterway-label');

    radiusElem.addEventListener('input', function() {
        let newRadius = parseFloat(radiusElem.value);
        myCircle.updateRadius(newRadius);
        radiusLabelElem.innerHTML = 'Radius: ' + myCircle.getRadius() + ' ' + units;
        map.getSource('circle-1').setData(myCircle.asGeojson());
    });

    boundsElem.innerHTML = 'Bounds: ' + myCircle.getBounds();
    centerElem.innerHTML = 'Center: ' + myCircle.getCenter();
    radiusLabelElem.innerHTML = 'Radius: ' + myCircle.getRadius() + ' ' + units;

    // Add drag and resize to a circle

    function animateCircle() {
        map.getSource('circle-1').setData(myCircle.asGeojson());
        boundsElem.innerHTML = 'Bounds: ' + myCircle.getBounds();
        centerElem.innerHTML = 'Center: ' + myCircle.getCenter();
    }

    let onMove = function(event) {
        if (!isDragging) return;
        let mousePoint = turfTruncate(turfHelpers.point(map.unproject(event.point).toArray()), 4);
        myCircle.updateCenter(mousePoint.geometry.coordinates);
        animateCircle(); // debounce(animateCircle, 60)();
    };

    let mouseDown = function() {
        if (!isCursorOverPoint) return;
        map.setPaintProperty('circle-fill', 'fill-color', 'blue');
        isDragging = true;
        map.on('mousemove', onMove);
        map.once('mouseup', function() {
            map.setPaintProperty('circle-fill', 'fill-color', 'red');
            isDragging = false;
        });
    };

    // let stopMove = function(e) {
    //     map.setPaintProperty('circle-fill', 'fill-color', 'red');
    //     map.dragPan.enable();
    //     // map.off('mousemove', move);
    // };

    map.on('mouseenter', 'circle-fill', function() {
        // let clickPoint = turfHelpers.point(map.unproject(e.point).toArray());
        map.dragPan.disable();
        // Enable dragging when you click inside the circle
        isCursorOverPoint = true;

        map.on('mousedown', mouseDown);
    });

    map.on('mouseleave', 'circle-fill', function() {
        map.dragPan.enable();
        isCursorOverPoint = false;
    });

    map.on('mouseenter', 'circle-line', function() {
        map.setPaintProperty('circle-line', 'line-color', 'orange');
    });

    map.on('mouseleave', 'circle-line', function() {
        map.setPaintProperty('circle-line', 'line-color', 'red');
    });
});
