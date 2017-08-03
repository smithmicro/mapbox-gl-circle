'use strict';

const _ = require('lodash');
const turfCircle = require('@turf/circle');
// const turfLineDistance = require('@turf/line-distance');
const turfBbox = require('@turf/bbox');
const turfBboxPoly = require('@turf/bbox-polygon');
const turfTruncate = require('@turf/truncate');
const turfDestination = require('@turf/destination');
const turfDistance = require('@turf/distance');
const turfHelpers = require('@turf/helpers');

function MapboxCircle(map, center, radius, options) {
    this.map = map;
    this.center = center; // Point geojson feature or array of [long,lat]
    this.radius = radius; // Radius of circle

    // miles, kilometers, degrees, or radians
    this.units = 'meters';
    // Current zoom level detail of circle
    this.zoom = this.map.getZoom();

    if (options.feedbackEls) { // TODO: Remove me!
        this.boundsEl = options.feedbackEls.boundsEl;
        this.centerEl = options.feedbackEls.centerEl;
        this.radiusEl = options.feedbackEls.radiusEl;
    }

    // JSON Object - property metadata for circle
    this.properties = options.properties ? options.properties : {};

    this.steps = 100; // Default steps

    this.circle_gj = turfCircle(this.center, this.radius, this.steps, this.units, this.properties);

    this.controlPoints = [
        turfDestination(this.center, this.radius, 0, this.units),
        turfDestination(this.center, this.radius, 90, this.units),
        turfDestination(this.center, this.radius, 180, this.units),
        turfDestination(this.center, this.radius, -90, this.units)
    ];

    this._updateCircle = function() {
        this.steps = this._calcSteps(this.zoom);

        this.circle_gj = turfCircle(this.center, this.radius, this.steps, this.units, this.properties);

        this.controlPoints = [
            turfDestination(this.center, this.radius, 0, this.units),
            turfDestination(this.center, this.radius, 90, this.units),
            turfDestination(this.center, this.radius, 180, this.units),
            turfDestination(this.center, this.radius, -90, this.units)
        ];
    };

    this._calcSteps = function(zoom) {
        if (zoom <= 0.1) {
            zoom = 0.1;
        }
        let radiusKm = turfHelpers.convertDistance(this.radius, this.units, 'kilometers');
        this.steps = (Math.sqrt(radiusKm * 250) * zoom ^ 2);
    };

    this._calcSteps(this.zoom);
    console.log(this.steps);

    this.asGeoJSON = function() {
        let feats = this.controlPoints;
        feats.push(this.circle_gj);
        feats.push(turfHelpers.point(this.center, {'type': 'center'}));
        return turfHelpers.featureCollection(feats);
    };

    this.updateCenter = function(newCenter) {
        this.center = newCenter;
        this._updateCircle();
    };

    this.updateRadius = function(newRadius) {
        this.radius = newRadius;
        this._updateCircle();
    };

    this.updateZoom = function(newZoom) {
        this.zoom = this._calcSteps(newZoom);
        this._updateCircle();
    };

    this.updateSteps = function(newSteps) {
        this.steps = newSteps;
        this._updateCircle();
    };

    this.updateUnits = function(newUnits) {
        this.units = newUnits;
        this._updateCircle();
    };

    this.getBounds = function() {
        let bboxPoly = turfTruncate(turfBboxPoly(turfBbox(this.circle_gj)), 6);
        return [
            bboxPoly.geometry.coordinates[0][0][0],
            bboxPoly.geometry.coordinates[0][0][1],
            bboxPoly.geometry.coordinates[0][2][0],
            bboxPoly.geometry.coordinates[0][2][1]
        ];
    };

    this.getBboxPoly = function() {
        return turfTruncate(turfBboxPoly(turfBbox(this.circle_gj)), 6);
    };

    this.getCenter = function() {
        return this.center;
    };

    this.getRadius = function() {
        return this.radius;
    };

    this.getControlPoints = function() {
        return turfHelpers.featureCollection(this.controlPoints);
    };

    this.animate = function() {
        // map.on('sourcedata', onSourceData)
        this.map.getSource('circle-1').setData(this.asGeoJSON());
        this.boundsEl.innerHTML = 'Bounds: ' + this.getBounds();
        this.centerEl.innerHTML = 'Center: ' + this.getCenter();
    };

    this.adjustPrecision = function() {
        this.updateZoom(this.map.getZoom());
        this.animate();
    }.bind(this);

    this.onMove = function(event) {
        let mousePoint = turfTruncate(turfHelpers.point(this.map.unproject(event.point).toArray()), 6);
        this.updateCenter(mousePoint.geometry.coordinates);
        this.animate();
    }.bind(this);

    this.onMouseUp = function() {
        this.map.setPaintProperty('circle-center-point', 'circle-color', '#fb6a4a');
        this.map.dragPan.enable();
        this.map.off('mousemove', this.onMove);
    }.bind(this);

    this.onMouseDown = function() {
        this.map.dragPan.disable();
        this.map.setPaintProperty('circle-center-point', 'circle-color', '#a50f15');
        this.map.on('mousemove', this.onMove);
        this.map.once('mouseup', this.onMouseUp);
    }.bind(this);

    this.onHandleMove = function(event) {
        let clickPoint = this.map.unproject(event.point).toArray();
        this.updateRadius(turfDistance(this.getCenter(), clickPoint, 'meters'));
        this.radiusEl.innerHTML = 'Radius: ' + Math.trunc(this.getRadius()) + ' meters';
        this.animate();
    }.bind(this);

    this.onHandleMouseUp = function() {
        this.map.setPaintProperty('circle-control-points', 'circle-color', 'white');
        this.map.dragPan.enable();
        this.map.off('mousemove', this.onHandleMove);
    }.bind(this);

    this.onHandleMouseDown = function() {
        this.map.dragPan.disable();
        this.map.setPaintProperty('circle-control-points', 'circle-color', '#a50f15');
        this.map.on('mousemove', this.onHandleMove);
        this.map.once('mouseup', this.onHandleMouseUp);
    }.bind(this);

    this.onMouseMove = function(event) {
        this.map.off('mousedown', this.onMouseDown);
        this.map.off('mousedown', this.onHandleMouseDown);

        let pointFeatures = this.map.queryRenderedFeatures(event.point, {
            layers: ['circle-control-points']
        });

        let circleFeatures = this.map.queryRenderedFeatures(event.point, {
            layers: ['circle-center-point']
        });

        if ((!pointFeatures.length) && (!circleFeatures.length)) {
            this.map.getCanvas().style.cursor = '';
        }

        if (pointFeatures.length) {
            this.map.getCanvas().style.cursor = 'pointer';
            this.map.once('mousedown', this.onHandleMouseDown);
        } else if (circleFeatures.length) {
            this.map.getCanvas().style.cursor = 'pointer';
            this.map.once('mousedown', this.onMouseDown);
        }
    }.bind(this);

    this.addToMap = function(targetMap) {
        targetMap.on('load', () => {
            targetMap.addSource('circle-1', {
                type: 'geojson',
                data: this.asGeoJSON(),
                buffer: 1
            });

            targetMap.addLayer({
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

            targetMap.addLayer({
                id: 'circle-fill',
                type: 'fill',
                source: 'circle-1',
                paint: {
                    'fill-color': '#fb6a4a',
                    'fill-opacity': 0.5
                },
                filter: ['==', '$type', 'Polygon']
            }, 'waterway-label');

            targetMap.addLayer({
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

            targetMap.addLayer({
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
            targetMap.on('zoomend', this.adjustPrecision);
            targetMap.on('mousemove', _.debounce(this.onMouseMove, 16));
        });
    };

    this.addToMap(map);
}

module.exports = exports = MapboxCircle;
