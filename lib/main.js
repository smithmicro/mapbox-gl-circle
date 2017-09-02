'use strict';

const _ = require('lodash');
const turfCircle = require('@turf/circle');
const turfBbox = require('@turf/bbox');
const turfBboxPoly = require('@turf/bbox-polygon');
const turfTruncate = require('@turf/truncate');
const turfDestination = require('@turf/destination');
const turfDistance = require('@turf/distance');
const turfHelpers = require('@turf/helpers');

/**
 * A `google.maps.Circle` replacement for Mapbox GL JS, rendering a "spherical cap" on top of the world.
 * @class MapboxCircle
 */
class MapboxCircle {
    /** @param {mapboxgl.Map} map Target map. */
    set map(map) {
        if (this._map === undefined) {
            this._map = map;
        } else {
            throw new TypeError('MapboxCircle.map immutable.');
        }
    }

    /** @return {mapboxgl.Map} Mapbox map. */
    get map() {
        return this._map;
    }

    /** @param {Array<Number>} newCenter Center `[lng, lat]` coordinates. */
    set center(newCenter) {
        this._center = newCenter;
        this._updateCircle();
        this._animate();
    }

    /** @return {Array<Number>} Center `[lng, lat]` coordinates. */
    get center() {
        return this._center;
    }

    /** @param {Number} newRadius Meter radius. */
    set radius(newRadius) {
        this._radius = newRadius;
        this._updateCircle();
        this._animate();
    }

    /** @return {Number} Circle radius. */
    get radius() {
        return this._radius;
    }

    /** @param {Number} newZoom New zoom level. */
    set zoom(newZoom) {
        this._zoom = newZoom;
        this._updateCircle();
        this._animate();
    }

    /**
     * @param {Array<Number>} center Center `[lng, lat]` coordinates.
     * @param {Number} radius Meter radius.
     * @param {?Object} options
     * @param {?Boolean} [options.editable=false] Enable handles for changing center and radius.
     * @param {?String} [options.strokeColor='#000000'] Stroke color.
     * @param {?Number} [options.strokeWeight=2] Stroke weight.
     * @param {?Number} [options.strokeOpacity=0.5] Stroke opacity.
     * @param {?String} [options.fillColor='#FB6A4A'] Fill color.
     * @param {?Number} [options.fillOpacity=0.5] Fill opacity.
     * @param {?Object} [options.properties={}] Property metadata for Mapbox GL JS circle object.
     * @param {?HTMLElement} [options.statusEl] HTML element for emitting debug info.
     */
    constructor(center, radius, options) {
        /** @type {Array<Number>} */ this._center = center;
        /** @const {Number} */ this._radius = radius;
        /** @const {Object} */ this.options = _.extend({
            editable: false,
            strokeColor: '#000000',
            strokeWeight: 2,
            strokeOpacity: 0.5,
            fillColor: '#FB6A4A',
            fillOpacity: 0.5,
            properties: {},
            statusEl: null
        }, options);

        /** @const {mapboxgl.Map} */ this._map = undefined;
        /** @const {Number} */ this._zoom = undefined;
        /** @const {Polygon} */ this._circle = undefined;
        /** @const {Array<Point>} */ this._handles = undefined;

        // Bind event handlers.
        this.onMouseMove = this.onMouseMove.bind(this);
        this.onCenterHandleMouseDown = this.onCenterHandleMouseDown.bind(this);
        this.onRadiusHandleMouseDown = this.onRadiusHandleMouseDown.bind(this);
        this.onCenterHandleMouseUp = this.onCenterHandleMouseUp.bind(this);
        this.onRadiusHandleMouseUp = this.onRadiusHandleMouseUp.bind(this);
        this.onCenterHandleMouseMove = this.onCenterHandleMouseMove.bind(this);
        this.onRadiusHandleMouseMove = this.onRadiusHandleMouseMove.bind(this);
        this.onZoomEnd = this.onZoomEnd.bind(this);

        // Initialize circle.
        this._updateCircle();
    }

    /**
     * Re-calculate/update circle polygon and handles.
     * @private
     */
    _updateCircle() {
        const zoom = !this._zoom || this._zoom <= 0.1 ? 0.1 : this._zoom;
        const steps = Math.max((Math.sqrt(Math.trunc(this._radius * 0.25)) * zoom ^ 2), 64);
        const units = 'meters';

        this._circle = turfCircle(this._center, this._radius, steps, units, this.options.properties);
        this._handles = [
            turfDestination(this._center, this._radius, 0, units),
            turfDestination(this._center, this._radius, 90, units),
            turfDestination(this._center, this._radius, 180, units),
            turfDestination(this._center, this._radius, -90, units)
        ];

        if (this.options.statusEl) {
            this.options.statusEl.innerHTML = ('Center: ' + this._center + ' / Radius: ' + Math.trunc(this._radius) +
                                               ' meters / Bounds: ' + this.getBounds() + ' / Steps: ' + steps);
        }
    }

    /**
     * Refresh map with the circle's GeoJSON.
     * @private
     */
    _animate() {
        // map.on('sourcedata', onSourceData)
        this._map.getSource('circle-1').setData(this._asGeoJSON());
    }

    /**
     * Return GeoJSON for circle and handles.
     * @private
     * @return {FeatureCollection}
     */
    _asGeoJSON() {
        let feats = this._handles;
        feats.push(this._circle);
        feats.push(turfHelpers.point(this._center, {'type': 'center'}));
        return turfHelpers.featureCollection(feats);
    }

    /**
     * Get geodesic bounds for the circle.
     * @return {[Number,Number,Number,Number]}
     */
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

    get_handles() {
        return turfHelpers.featureCollection(this._handles);
    }
    */

    /**
     * Adjust circle precision (steps used to draw the polygon).
     */
    onZoomEnd() {
        this.zoom = this.map.getZoom();
    }

    /**
     * Disable panning, set color of center handle, add onCenterHandleMouseMove (drag) listener and wait for mouse-up.
     */
    onCenterHandleMouseDown() {
        this.map.dragPan.disable();
        this.map.setPaintProperty('circle-center-handle', 'circle-color', this.options.fillColor);
        this.map.on('mousemove', this.onCenterHandleMouseMove);
        this.map.once('mouseup', this.onCenterHandleMouseUp);
    }

    /**
     * Mouse-move listener, emulating a drag listener in conjunction with onCenterHandleMouseDown/onCenterHandleMouseUp.
     * @param {MapMouseEvent} event
     */
    onCenterHandleMouseMove(event) {
        const mousePoint = turfTruncate(turfHelpers.point(this.map.unproject(event.point).toArray()), 6);
        this.center = mousePoint.geometry.coordinates;
    }

    /**
     * Restore center handle color, re-enable panning and remove onCenterHandleMouseMove (drag) listener.
     */
    onCenterHandleMouseUp() {
        this.map.setPaintProperty('circle-center-handle', 'circle-color', '#ffffff');
        this.map.dragPan.enable();
        this.map.off('mousemove', this.onCenterHandleMouseMove);
    }

    /**
     * Disable panning, set color of radius handles, add mouse-move listener and wait for mouse-up (emulating drag).
     */
    onRadiusHandleMouseDown() {
        this.map.dragPan.disable();
        this.map.setPaintProperty('circle-radius-handles', 'circle-color', this.options.fillColor);
        this.map.on('mousemove', this.onRadiusHandleMouseMove);
        this.map.once('mouseup', this.onRadiusHandleMouseUp);
    }

    /**
     * Mouse-move listener for the radius handles, emulating a drag event with
     * onRadiusHandleMouseDown/onRadiusHandleMouseUp.
     * @param {MapMouseEvent} event
     */
    onRadiusHandleMouseMove(event) {
        const mousePoint = this.map.unproject(event.point).toArray();
        this.radius = turfDistance(this.center, mousePoint, 'meters');
    }

    /**
     * Restore color of radius handles, re-enable panning and deactivate existing mouse-move listener.
     */
    onRadiusHandleMouseUp() {
        this.map.setPaintProperty('circle-radius-handles', 'circle-color', '#ffffff');
        this.map.dragPan.enable();
        this.map.off('mousemove', this.onRadiusHandleMouseMove);
    }

    /**
     * Deactivate existing mouse-down listeners, check position and add new ones for map or handle as appropriate.
     * @param {MapMouseEvent} event
     */
    onMouseMove(event) {
        this.map.off('mousedown', this.onCenterHandleMouseDown);
        this.map.off('mousedown', this.onRadiusHandleMouseDown);

        let radiusHandle = this.map.queryRenderedFeatures(event.point, {
            layers: ['circle-radius-handles']
        });

        let centerHandle = this.map.queryRenderedFeatures(event.point, {
            layers: ['circle-center-handle']
        });

        if (radiusHandle.length || centerHandle.length) {
            this.map.getCanvas().style.cursor = 'pointer';
            let mouseDownHandler = radiusHandle.length ? this.onRadiusHandleMouseDown : this.onCenterHandleMouseDown;
            this.map.once('mousedown', mouseDownHandler);
        } else {
            this.map.getCanvas().style.cursor = '';
        }
    }

    /**
     * Set map and initialize it with Mapbox GL layers for circle artifacts.
     * @param {mapboxgl.Map} map
     * @return {MapboxCircle}
     */
    addTo(map) {
        this.map = map;

        this.map.on('load', () => {
            this.map.addSource('circle-1', {
                type: 'geojson',
                data: this._asGeoJSON(),
                buffer: 1
            });

            this.map.addLayer({
                id: 'circle-line',
                type: 'line',
                source: 'circle-1',
                paint: {
                    'line-color': this.options.strokeColor,
                    'line-width': this.options.strokeWeight,
                    'line-opacity': this.options.strokeOpacity
                },
                filter: ['==', '$type', 'Polygon']
            }, 'waterway-label');

            this.map.addLayer({
                id: 'circle-fill',
                type: 'fill',
                source: 'circle-1',
                paint: {
                    'fill-color': this.options.fillColor,
                    'fill-opacity': this.options.fillOpacity
                },
                filter: ['==', '$type', 'Polygon']
            }, 'waterway-label');

            this.map.addLayer({
                id: 'circle-radius-handles',
                type: 'circle',
                source: 'circle-1',
                paint: {
                    'circle-color': '#ffffff',
                    'circle-radius': 3.75,
                    'circle-stroke-color': this.options.strokeColor,
                    'circle-stroke-opacity': this.options.strokeOpacity,
                    'circle-stroke-width': this.options.strokeWeight
                },
                filter: ['all', ['==', '$type', 'Point'], ['!=', 'type', 'center']]
            });

            this.map.addLayer({
                id: 'circle-center-handle',
                type: 'circle',
                source: 'circle-1',
                paint: {
                    'circle-color': '#ffffff',
                    'circle-radius': 3.75,
                    'circle-stroke-color': this.options.strokeColor,
                    'circle-stroke-opacity': this.options.strokeOpacity,
                    'circle-stroke-width': this.options.strokeWeight
                },
                filter: ['all', ['==', '$type', 'Point'], ['==', 'type', 'center']]
            });

            this.map.on('zoomend', this.onZoomEnd);
            this.map.on('mousemove', _.debounce(this.onMouseMove, 16));
        });
        return this;
    }
}

module.exports = exports = MapboxCircle;
