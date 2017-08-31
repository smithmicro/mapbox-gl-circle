'use strict';

const mapboxgl = require('mapbox-gl');
const MapboxCircle = require('../lib/main.js');

let mapDiv = document.body.appendChild(document.createElement('div'));
mapDiv.style.position = 'absolute';
mapDiv.style.top = '32px';
mapDiv.style.right = 0;
mapDiv.style.left = 0;
mapDiv.style.bottom = 0;

// noinspection SpellCheckingInspection
mapboxgl.accessToken = 'pk.eyJ1IjoicnNiYXVtYW5uIiwiYSI6IjdiOWEzZGIyMGNkOGY3NWQ4ZTBhN2Y5ZGU2Mzg2NDY2In0.jycgv7qwF8MMIWt4cT0RaQ';

const center = [-75.343, 39.984];
const map = new mapboxgl.Map({
    container: mapDiv,
    style: 'mapbox://styles/mapbox/streets-v9',
    center: center,
    zoom: 14
});

// MapboxCircle Setup

// DOM elements
const statusEl = document.body.appendChild(document.createElement('div'));

const editable = {
    strokeColor: '#29AB87',
    strokeWeight: 1,
    strokeOpacity: 0.85,
    fillColor: '#29AB87',
    fillOpacity: 0.2
};

/*
const nonEditable = {
    strokeColor: '#000000',
    strokeWeight: 0,
    fillColor: '#000000',
    fillOpacity: 0.2
};
*/

window.editableCircle = new MapboxCircle([-75.341, 39.986], 300, {
    editable: true,
    strokeColor: editable.strokeColor,
    strokeWeight: editable.strokeWeight,
    strokeOpacity: editable.strokeOpacity,
    fillColor: editable.fillColor,
    fillOpacity: editable.fillOpacity,
    statusEl: statusEl
}).addTo(map);

