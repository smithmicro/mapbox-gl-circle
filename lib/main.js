'use strict';

const _ = require('lodash');
const turfCircle = require('@turf/circle');
const turfBbox = require('@turf/bbox');
const turfBboxPoly = require('@turf/bbox-polygon');
const turfTruncate = require('@turf/truncate');
const turfDestination = require('@turf/destination');
const turfDistance = require('@turf/distance');
const turfHelpers = require('@turf/helpers');

class MapboxCircle {
    set center(value) {
        this._center = value;
        this._updateCircle();
        this._animate();
    }
    get center() {
        return this._center;
    }
    set radius(value) {
        this._radius = value;
        this._updateCircle();
        this._animate();
    }
    get radius() {
        return this._radius;
    }
    set zoom(value) {
        this._zoom = value;
        this._updateCircle();
        this._animate();
    }
    constructor(map, center, radius, options) {
        this.map = map;
        this._center = center; // Point geojson feature or array of [long,lat].
        this._radius = radius; // Radius of circle.
        this.statusEl = options.statusEl;
        this.properties = options.properties ? options.properties : {}; // JSON Object - property metadata for circle.

        this.units = 'meters';
        this._zoom = this.map.getZoom();

        this.steps = null; // No default steps
        this.circle_gj = null;
        this.controlPoints = null;

        // Bind event handlers.
        this.onMouseMove = this.onMouseMove.bind(this);
        this.onMouseDown = this.onMouseDown.bind(this);
        this.onHandleMouseDown = this.onHandleMouseDown.bind(this);
        this.onMouseUp = this.onMouseUp.bind(this);
        this.onHandleMouseUp = this.onHandleMouseUp.bind(this);
        this.onMove = this.onMove.bind(this);
        this.onHandleMove = this.onHandleMove.bind(this);
        this.onZoomEnd = this.onZoomEnd.bind(this);

        // Initialize circle object.
        this._updateCircle();
        this.addTo(map);
    }

    _updateSteps(zoom) {
        if (!zoom || zoom <= 0.1) zoom = 0.1;
        this.steps = (Math.sqrt(Math.trunc(this._radius * 0.25)) * zoom ^ 2);
    }

    _updateCircle() {
        this._updateSteps(this._zoom);
        this.circle_gj = turfCircle(this._center, this._radius, this.steps, this.units, this.properties);
        this.controlPoints = [
            turfDestination(this._center, this._radius, 0, this.units),
            turfDestination(this._center, this._radius, 90, this.units),
            turfDestination(this._center, this._radius, 180, this.units),
            turfDestination(this._center, this._radius, -90, this.units)
        ];
        if (this.statusEl) {
            this.statusEl.innerHTML = ('Center: ' + this._center + ' / Radius: ' + Math.trunc(this._radius) +
                                       ' meters / Bounds: ' + this.getBounds());
        }
    }

    _animate() {
        // map.on('sourcedata', onSourceData)
        this.map.getSource('circle-1').setData(this.asGeoJSON());
    }

    asGeoJSON() {
        let feats = this.controlPoints;
        feats.push(this.circle_gj);
        feats.push(turfHelpers.point(this._center, {'type': 'center'}));
        return turfHelpers.featureCollection(feats);
    }

    getBounds() {
        let bboxPoly = turfTruncate(turfBboxPoly(turfBbox(this.circle_gj)), 6);
        return [
            bboxPoly.geometry.coordinates[0][0][0],
            bboxPoly.geometry.coordinates[0][0][1],
            bboxPoly.geometry.coordinates[0][2][0],
            bboxPoly.geometry.coordinates[0][2][1]
        ];
    }

    getBboxPoly() {
        return turfTruncate(turfBboxPoly(turfBbox(this.circle_gj)), 6);
    }

    getControlPoints() {
        return turfHelpers.featureCollection(this.controlPoints);
    }

    onZoomEnd() {
        // Adjust circle precision.
        this.zoom = this.map.getZoom();
    }

    onMove(event) {
        let mousePoint = turfTruncate(turfHelpers.point(this.map.unproject(event.point).toArray()), 6);
        this.center = mousePoint.geometry.coordinates;
    }

    onMouseUp() {
        this.map.setPaintProperty('circle-center-point', 'circle-color', '#fb6a4a');
        this.map.dragPan.enable();
        this.map.off('mousemove', this.onMove);
    }

    onMouseDown() {
        this.map.dragPan.disable();
        this.map.setPaintProperty('circle-center-point', 'circle-color', '#a50f15');
        this.map.on('mousemove', this.onMove);
        this.map.once('mouseup', this.onMouseUp);
    }

    onHandleMove(event) {
        let clickPoint = this.map.unproject(event.point).toArray();
        this.radius = turfDistance(this.center, clickPoint, 'meters');
    }

    onHandleMouseUp() {
        this.map.setPaintProperty('circle-control-points', 'circle-color', 'white');
        this.map.dragPan.enable();
        this.map.off('mousemove', this.onHandleMove);
    }

    onHandleMouseDown() {
        this.map.dragPan.disable();
        this.map.setPaintProperty('circle-control-points', 'circle-color', '#a50f15');
        this.map.on('mousemove', this.onHandleMove);
        this.map.once('mouseup', this.onHandleMouseUp);
    }

    onMouseMove(event) {
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
    }

    addTo(targetMap) {
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
            targetMap.on('zoomend', this.onZoomEnd);
            targetMap.on('mousemove', _.debounce(this.onMouseMove, 16));
        });
    }
}

module.exports = exports = MapboxCircle;
