'use strict';

const _ = require('lodash');
const mapboxgl = require('mapbox-gl');
const MapboxCircle = require('../lib/main.js');

// eslint-disable-next-line
console.log("Loaded MapboxCircle from 'mapbox-gl-circle-" + MapboxCircle.VERSION + "'");

const mapDiv = document.body.appendChild(document.createElement('div'));
mapDiv.style.position = 'absolute';
mapDiv.style.top = '32px';
mapDiv.style.right = 0;
mapDiv.style.left = 0;
mapDiv.style.bottom = 0;

const defaultStyle = 'streets';

const styleMenuDiv = document.body.appendChild(document.createElement('div'));
styleMenuDiv.id = 'menu';
styleMenuDiv.style.position = 'absolute';
styleMenuDiv.style.left = 0;
styleMenuDiv.style.bottom = 0;
styleMenuDiv.style.backgroundColor = 'rgba(255, 255, 255, 0.5)';

for (let styleOption of ['basic', 'streets', 'bright', 'light', 'dark', 'satellite', 'satellite-streets']) {
    let inputEl = styleMenuDiv.appendChild(document.createElement('input'));
    inputEl.type = 'radio';
    inputEl.name = 'styleSwitcher';
    inputEl.id = inputEl.value = styleOption;
    if (styleOption === defaultStyle) {
        inputEl.checked = true;
    }

    inputEl.onclick = function setStyle(clickEvent) {
        map.setStyle('mapbox://styles/mapbox/' + clickEvent.target.id + '-v9');
    };

    let labelEl = styleMenuDiv.appendChild(document.createElement('label'));
    labelEl.for = labelEl.textContent = styleOption;
    labelEl.style.paddingRight = '10px';
}

// noinspection SpellCheckingInspection
mapboxgl.accessToken = 'pk.eyJ1IjoicnNiYXVtYW5uIiwiYSI6IjdiOWEzZGIyMGNkOGY3NWQ4ZTBhN2Y5ZGU2Mzg2NDY2In0.jycgv7qwF8MMIWt4cT0RaQ';

const center = {lat: 39.984, lng: -75.343};
const map = new mapboxgl.Map({
    container: mapDiv,
    style: 'mapbox://styles/mapbox/' + defaultStyle + '-v9',
    center: [center.lng, center.lat],
    zoom: 14
});

window.map = map;

const markerElement = document.createElement('div');
markerElement.style.backgroundImage = 'url(https://placekitten.com/g/50/)';
markerElement.style.width = '50px';
markerElement.style.height = '50px';
markerElement.style.borderRadius = '50%';
window.marker1 = new mapboxgl.Marker(markerElement)
    .setLngLat([center.lng, center.lat])
    .addTo(map);

// MapboxCircle Setup

const editableOpts = {
    editable: true,
    strokeColor: '#29AB87',
    strokeWeight: 1,
    strokeOpacity: 0.85,
    fillColor: '#29AB87',
    fillOpacity: 0.2,
    minRadius: 100,
    maxRadius: 500000,
    debugEl: document.body.appendChild(document.createElement('div'))
};

const extraPrettyEditableOpts = _.extend({refineStroke: true}, editableOpts);

const nonEditableOpts = {
    strokeWeight: 0,
    fillColor: '#000000',
    fillOpacity: 0.2
};

window.editableCircle0 = new MapboxCircle({lat: 39.986, lng: -75.341}, 350, editableOpts).addTo(map);

window.plainCircle0 = new MapboxCircle({lat: 39.982, lng: -75.345}, 250, nonEditableOpts).addTo(map);

window.plainCircle1 = new MapboxCircle({lat: 39.983, lng: -75.344}, 300, nonEditableOpts).addTo(map);

window.editableCircle1 = new MapboxCircle({lat: 39.984, lng: -75.349}, 300, editableOpts).addTo(map)
    .setCenter({lat: 39.989, lng: -75.348}).setRadius(50);

window.editableCircle2 = new MapboxCircle({lat: 39.974377, lng: -75.639449}, 25000, extraPrettyEditableOpts).addTo(map);
window.editableCircle3 = new MapboxCircle({lat: 39.980, lng: -75.340}, 225, editableOpts).addTo(map);

window.plainCircle2 = new MapboxCircle({lat: 39.983, lng: -75.345}, 150, nonEditableOpts).addTo(map);
window.plainCircle3 = new MapboxCircle([-75.352, 39.983], 200, nonEditableOpts).addTo(map);

window.setTimeout(function () {
    window.editableCircle1.remove();
    window.editableCircle3.remove();
    window.setTimeout(function () {
        window.editableCircle1.addTo(map).setCenter({lat: 39.984, lng: -75.349}).setRadius(300);
        window.editableCircle3.addTo(map);
    }, 1250);
}, 2500);


window.editableCircle2
    .on('radiuschanged', function (circleObj) {
        const newRadius = circleObj.getRadius();
        // eslint-disable-next-line
        console.log('editableCircle2/radiuschanged', circleObj.getBounds());
        window.setTimeout(function () {
            if (newRadius === circleObj.getRadius()) {
                circleObj.setRadius(newRadius * .99);
            }
        }, 1500);
    })
    .on('centerchanged', function (circleObj) {
        // eslint-disable-next-line
        console.log('editableCircle2/centerchanged', circleObj.getCenter());
    })
    .on('radiuschanged', function (circleObj) {
        // eslint-disable-next-line
        console.log('editableCircle2/radiuschanged', circleObj.getRadius());
    })
    .on('click', function (mouseEvent) {
        // eslint-disable-next-line
        console.log('editableCircle2/click', mouseEvent);
    })
    .on('contextmenu', function (mouseEvent) {
        // eslint-disable-next-line
        console.log('editableCircle2/contextmenu', mouseEvent);
    })
    .on('click', function (mouseEvent) {
        // eslint-disable-next-line
        console.log('editableCircle2/click', mouseEvent);
    })
    .on('contextmenu', function (mouseEvent) {
        // eslint-disable-next-line
        console.log('editableCircle2/contextmenu', mouseEvent);
    });

window.editableCircle3
    .on('radiuschanged', function (circleObj) {
        const newRadius = circleObj.getRadius();
        // eslint-disable-next-line
        console.log('editableCircle3/radiuschanged', circleObj.getBounds());
        window.setTimeout(function () {
            if (newRadius === circleObj.getRadius()) {
                circleObj.setRadius(newRadius * 1.01);
            }
        }, 1750);
    })
    .on('centerchanged', function (circleObj) {
        // eslint-disable-next-line
        console.log('editableCircle3/centerchanged', circleObj.getCenter());
    })
    .on('click', function (mouseEvent) {
        // eslint-disable-next-line
        console.log('editableCircle3/click', mouseEvent);
    })
    .on('contextmenu', function (mouseEvent) {
        // eslint-disable-next-line
        console.log('editableCircle3/contextmenu', mouseEvent);
    });

