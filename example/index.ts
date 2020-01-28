import { MapboxCircle } from './../dist/mapbox-gl-circle';
import * as mapboxgl from 'mapbox-gl';
import * as turf from '@turf/turf';

document.getElementById('version').textContent = 'mapbox-gl-circle-' + MapboxCircle.VERSION;

function boundsTo5percentRadius(bounds) {
    return Math.round(
        turf.distance(bounds.getSouthWest().toArray(), bounds.getNorthEast().toArray(), { units: 'meters' }) * 0.05,
    );
}

var map = new mapboxgl.Map({
    container: 'map',
    style: 'mapbox://styles/mapbox/streets-v9',
    center: [18.059678, 59.322465],
    zoom: 12.30543,
    accessToken: 'pk.eyJ1IjoiYW5hbmR0aGFra2VyIiwiYSI6ImNqNWptdjU1YjJheWszM256ZWN0MXNrejMifQ.TXnoKtnlam-KBmRSjXQgEw',
}).addControl(new mapboxgl.ScaleControl({ maxWidth: 300 }), 'top-right');

var layerList = document.getElementById('menu');
var inputs = layerList.getElementsByTagName('input');

function switchLayer(clickEvent) {
    var layerId = clickEvent.target.id;
    map.setStyle('mapbox://styles/mapbox/' + layerId + '-v9');
}

for (var i = 0; i < inputs.length; i++) {
    inputs[i].onclick = switchLayer;
}

// Non-editable circles.
var lidingoMunicipality = { position: { lat: 59.379278, lng: 18.17814 }, radius: 4846 };

new MapboxCircle(lidingoMunicipality.position, lidingoMunicipality.radius, {
    strokeColor: '#0000ff',
    strokeOpacity: 0.25,
    strokeWeight: 2,
    refineStroke: true,
    fillColor: '#000000',
    fillOpacity: 0.05,
}).addTo(map);

// Editable circles.
var northPole = { position: { lat: 84.928218, lng: -38.074812 }, radius: 1100000 };
var irelandAndUK = { position: { lat: 54.431637, lng: -4.223538 }, radius: 547293 };
var oldTown = { position: { lat: 59.325017, lng: 18.069263 }, radius: 508 };
var smsiStockholm = { position: { lat: 59.346978, lng: 18.03912 }, radius: 142 };
var kvadratSthlm = { position: { lat: 59.34131, lng: 18.058817 }, radius: 122 };
var stormforsOffice = { position: { lat: 59.337678, lng: 18.083402 }, radius: 85 };
var midsommarkransenSubway = { position: { lat: 59.301857, lng: 18.012292 }, radius: 131 };

var editableCircleOpts = {
    editable: true,
    minRadius: 50,
    debugEl: document.getElementById('debug'),
};

var baseDelay = 500;
[northPole, irelandAndUK, oldTown, smsiStockholm, kvadratSthlm, stormforsOffice, midsommarkransenSubway].forEach(
    function(item) {
        window.setTimeout(function() {
            var newEditable = new MapboxCircle(item.position, item.radius, editableCircleOpts)
                .addTo(map)
                .once('click', function(mapMouseEvent) {
                    // Left-click on circle to remove.
                    console.log('remove circle / mapMouseEvent:', mapMouseEvent);
                    newEditable.remove();
                });
        }, (baseDelay += 500));
    },
);

map.on('contextmenu', function(event) {
    // Right-click on map to add new circle.
    console.log('Add editable circle at ' + event.lngLat);
    var newEditable = new MapboxCircle(event.lngLat, boundsTo5percentRadius(map.getBounds()), editableCircleOpts)
        .once('click', function(mapMouseEvent) {
            console.log('remove circle / mapMouseEvent:', mapMouseEvent);
            newEditable.remove();
        })
        .addTo(map);
});
