'use strict';

const mapboxgl = require('mapbox-gl');
const MapboxCircle = require('../lib/main.js');

const mapDiv = document.body.appendChild(document.createElement('div'));
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

const editableOpts = {
    editable: true,
    strokeColor: '#29AB87',
    strokeWeight: 1,
    strokeOpacity: 0.85,
    fillColor: '#29AB87',
    fillOpacity: 0.2,
    statusEl: document.body.appendChild(document.createElement('div'))
};

const nonEditableOpts = {
    strokeWeight: 0,
    fillColor: '#000000',
    fillOpacity: 0.2
};

window.editableCircle0 = new MapboxCircle([-75.341, 39.986], 350, editableOpts).addTo(map);

window.plainCircle0 = new MapboxCircle([-75.345, 39.982], 250, nonEditableOpts).addTo(map);

window.plainCircle1 = new MapboxCircle([-75.344, 39.983], 300, nonEditableOpts).addTo(map);

window.editableCircle1 = new MapboxCircle([-75.349, 39.984], 300, editableOpts).addTo(map);
window.editableCircle2 = new MapboxCircle([-75.348, 39.989], 250, editableOpts).addTo(map);
window.editableCircle3 = new MapboxCircle([-75.340, 39.980], 225, editableOpts).addTo(map);

window.plainCircle2 = new MapboxCircle([-75.345, 39.983], 150, nonEditableOpts).addTo(map);
window.plainCircle3 = new MapboxCircle([-75.352, 39.983], 200, nonEditableOpts).addTo(map);

window.setTimeout(function() {
    window.editableCircle1.remove();
    window.editableCircle3.remove();
    window.setTimeout(function() {
        window.editableCircle1.addTo(map);
        window.editableCircle3.addTo(map);
    }, 1250);
}, 2500);


window.editableCircle2.addListener('radiuschanged', function(circleObj) {
    // eslint-disable-next-line
    console.log('editableCircle2', circleObj);
});

window.editableCircle2.addListener('radiuschanged', function(circleObj) {
    // eslint-disable-next-line
    console.log('editableCircle2', circleObj);
});

window.editableCircle3.addListener('radiuschanged', function(circleObj) {
    // eslint-disable-next-line
    console.log('editableCircle3', circleObj);
});
