'use strict';

const mapboxgl = require('mapbox-gl');
const MapboxCircle = require('../lib/main.js');

let mapDiv = document.body.appendChild(document.createElement('div'));
mapDiv.style.position = 'absolute';
mapDiv.style.top = '100px';
mapDiv.style.right = 0;
mapDiv.style.left = 0;
mapDiv.style.bottom = 0;

// noinspection SpellCheckingInspection
mapboxgl.accessToken = 'pk.eyJ1IjoicnNiYXVtYW5uIiwiYSI6IjdiOWEzZGIyMGNkOGY3NWQ4ZTBhN2Y5ZGU2Mzg2NDY2In0.jycgv7qwF8MMIWt4cT0RaQ';

let center = [-75.343, 39.984];
let map = new mapboxgl.Map({
    container: mapDiv,
    style: 'mapbox://styles/mapbox/streets-v9',
    center: center,
    zoom: 14
});

// MapboxCircle Setup

// DOM elements
let boundsEl = document.body.appendChild(document.createElement('div'));
let centerEl = document.body.appendChild(document.createElement('div'));
let radiusEl = document.body.appendChild(document.createElement('div'));

window.myCircle = new MapboxCircle(map, center, 300, {
    properties: {foo: 'bar'},
    feedbackEls: {
        boundsEl: boundsEl,
        centerEl: centerEl,
        radiusEl: radiusEl
    }
});
