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
    set map(value) {
        if (this._map === null) {
            this._map = value;
        } else {
            throw new TypeError('MapboxCircle.map immutable once set.');
        }
    }
    get map() {
        return this._map;
    }
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
    constructor(center, radius, options) {
        this._center = center; // Point geojson feature or array of [lng,lat].
        this._radius = radius; // Radius of circle.

        this._options = _.extend({
            strokeColor: '#000000',
            fillColor: '#FB6A4A',
            fillOpacity: 0.5,
            properties: {}, // JSON Object - property metadata for circle.
            statusEl: null
        }, options);

        this._map = null;
        this._zoom = null;
        this._circle = null;
        this._controlPoints = null;

        // Bind event handlers.
        this.onMouseMove = this.onMouseMove.bind(this);
        this.onMouseDown = this.onMouseDown.bind(this);
        this.onHandleMouseDown = this.onHandleMouseDown.bind(this);
        this.onMouseUp = this.onMouseUp.bind(this);
        this.onHandleMouseUp = this.onHandleMouseUp.bind(this);
        this.onMove = this.onMove.bind(this);
        this.onHandleMove = this.onHandleMove.bind(this);
        this.onZoomEnd = this.onZoomEnd.bind(this);

        // Initialize circle.
        this._updateCircle();
    }

    _updateCircle() {
        let zoom = !this._zoom || this._zoom <= 0.1 ? 0.1 : this._zoom;
        let steps = Math.max((Math.sqrt(Math.trunc(this._radius * 0.25)) * zoom ^ 2), 64);
        let units = 'meters';

        this._circle = turfCircle(this._center, this._radius, steps, units, this._options.properties);
        this._controlPoints = [
            turfDestination(this._center, this._radius, 0, units),
            turfDestination(this._center, this._radius, 90, units),
            turfDestination(this._center, this._radius, 180, units),
            turfDestination(this._center, this._radius, -90, units)
        ];

        if (this._options.statusEl) {
            this._options.statusEl.innerHTML = ('Center: ' + this._center + ' / Radius: ' + Math.trunc(this._radius) +
                                                ' meters / Bounds: ' + this.getBounds() + ' / Steps: ' + steps);
        }
    }

    _animate() {
        // map.on('sourcedata', onSourceData)
        this._map.getSource('circle-1').setData(this.asGeoJSON());
    }

    asGeoJSON() {
        let feats = this._controlPoints;
        feats.push(this._circle);
        feats.push(turfHelpers.point(this._center, {'type': 'center'}));
        return turfHelpers.featureCollection(feats);
    }

    getBounds() {
        let bboxPoly = turfTruncate(turfBboxPoly(turfBbox(this._circle)), 6);
        return [
            bboxPoly.geometry.coordinates[0][0][0],
            bboxPoly.geometry.coordinates[0][0][1],
            bboxPoly.geometry.coordinates[0][2][0],
            bboxPoly.geometry.coordinates[0][2][1]
        ];
    }

    /*
    getBboxPoly() {
        return turfTruncate(turfBboxPoly(turfBbox(this._circle)), 6);
    }

    get_controlPoints() {
        return turfHelpers.featureCollection(this._controlPoints);
    }
    */

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

    addTo(map) {
        this.map = map;

        this.map.on('load', () => {
            this.map.addSource('circle-1', {
                type: 'geojson',
                data: this.asGeoJSON(),
                buffer: 1
            });

            this.map.addLayer({
                id: 'circle-line',
                type: 'line',
                source: 'circle-1',
                paint: {
                    'line-color': this._options.strokeColor,
                    'line-width': {
                        stops: [
                            [0, 0.1],
                            [16, 5]
                        ]
                    }
                },
                filter: ['==', '$type', 'Polygon']
            }, 'waterway-label');

            this.map.addLayer({
                id: 'circle-fill',
                type: 'fill',
                source: 'circle-1',
                paint: {
                    'fill-color': this._options.fillColor,
                    'fill-opacity': this._options.fillOpacity
                },
                filter: ['==', '$type', 'Polygon']
            }, 'waterway-label');

            this.map.addLayer({
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

            this.map.addLayer({
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

            this.map.on('zoomend', this.onZoomEnd);
            this.map.on('mousemove', _.debounce(this.onMouseMove, 16));
        });
        return this;
    }
}

module.exports = exports = MapboxCircle;
