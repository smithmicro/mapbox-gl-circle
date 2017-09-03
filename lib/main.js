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
    /**
     * @private
     * @return {Number} Globally unique instance ID.
     */
    get _instanceId() {
        if (this.__instanceId === undefined) {
            this.__instanceId = MapboxCircle._global_id_counter++;
        }
        return this.__instanceId;
    }

    /**
     * @private
     * @return {String} Unique circle ID.
     */
    get _circleSourceId() {
        return 'circle-source-' + this._instanceId;
    }

    /**
     * @private
     * @return {String} Unique circle line-stroke ID.
     */
    get _circleLineId() {
        return 'circle-line-' + this._instanceId;
    }

    /**
     * @private
     * @return {String} Unique circle fill ID.
     */
    get _circleFillId() {
        return 'circle-fill-' + this._instanceId;
    }

    /**
     * @private
     * @return {String} Unique circle center handle ID.
     */
    get _circleCenterHandleId() {
        return 'circle-center-handle-' + this._instanceId;
    }

    /**
     * @private
     * @return {String} Unique circle radius handles' ID.
     */
    get _circleRadiusHandlesId() {
        return 'circle-radius-handles-' + this._instanceId;
    }

    /** @param {mapboxgl.Map} map Target map. */
    set map(map) {
        if (!this._map || !map) {
            this._map = map;
        } else {
            throw new TypeError('MapboxCircle.map reassignment.');
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
                                               ' meters / Bounds: ' + this.getBounds() + ' / Steps: ' + steps +
                                               ' / Instance ID: ' + this._instanceId);
        }
    }

    /**
     * Refresh map with the circle's GeoJSON.
     * @private
     */
    _animate() {
        // map.on('sourcedata', onSourceData)
        this._map.getSource(this._circleSourceId).setData(this._asGeoJSON());
    }

    /**
     * Return GeoJSON for circle and handles.
     * @private
     * @return {FeatureCollection}
     */
    _asGeoJSON() {
        return turfHelpers.featureCollection(
            [...this._handles, this._circle, turfHelpers.point(this._center, {'type': 'center'})]);
    }

    /**
     * Get geodesic bounds for the circle.
     * @return {[Number,Number,Number,Number]}
     */
    getBounds() {
        const bboxPoly = turfTruncate(turfBboxPoly(turfBbox(this._circle)), 6);
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
        this.map.setPaintProperty(this._circleCenterHandleId, 'circle-color', this.options.fillColor);
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
        this.map.setPaintProperty(this._circleCenterHandleId, 'circle-color', '#ffffff');
        this.map.dragPan.enable();
        this.map.off('mousemove', this.onCenterHandleMouseMove);
    }

    /**
     * Disable panning, set color of radius handles, add mouse-move listener and wait for mouse-up (emulating drag).
     */
    onRadiusHandleMouseDown() {
        this.map.dragPan.disable();
        this.map.setPaintProperty(this._circleRadiusHandlesId, 'circle-color', this.options.fillColor);
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
        this.map.setPaintProperty(this._circleRadiusHandlesId, 'circle-color', '#ffffff');
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

        const centerHandle = this.map.queryRenderedFeatures(event.point, {
            layers: [this._circleCenterHandleId]
        });

        const radiusHandles = this.map.queryRenderedFeatures(event.point, {
            layers: [this._circleRadiusHandlesId]
        });

        if (centerHandle.length || radiusHandles.length) {
            this.map.getCanvas().style.cursor = 'pointer';
            const mouseDownHandler = centerHandle.length ? this.onCenterHandleMouseDown : this.onRadiusHandleMouseDown;
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
        const handlePaintOptions = {
            'circle-color': '#ffffff',
            'circle-radius': 3.75,
            'circle-stroke-color': this.options.strokeColor,
            'circle-stroke-opacity': this.options.strokeOpacity,
            'circle-stroke-width': this.options.strokeWeight
        };
        const attachMapArtifacts = () => {
            map.addSource(this._circleSourceId, {
                type: 'geojson',
                data: this._asGeoJSON(),
                buffer: 1
            });

            map.addLayer({
                id: this._circleLineId,
                type: 'line',
                source: this._circleSourceId,
                paint: {
                    'line-color': this.options.strokeColor,
                    'line-width': this.options.strokeWeight,
                    'line-opacity': this.options.strokeOpacity
                },
                filter: ['==', '$type', 'Polygon']
            }, 'waterway-label');

            map.addLayer({
                id: this._circleFillId,
                type: 'fill',
                source: this._circleSourceId,
                paint: {
                    'fill-color': this.options.fillColor,
                    'fill-opacity': this.options.fillOpacity
                },
                filter: ['==', '$type', 'Polygon']
            }, 'waterway-label');

            if (this.options.editable) {
                map.addLayer({
                    id: this._circleCenterHandleId,
                    type: 'circle',
                    source: this._circleSourceId,
                    paint: handlePaintOptions,
                    filter: ['all', ['==', '$type', 'Point'], ['==', 'type', 'center']]
                });

                map.addLayer({
                    id: this._circleRadiusHandlesId,
                    type: 'circle',
                    source: this._circleSourceId,
                    paint: handlePaintOptions,
                    filter: ['all', ['==', '$type', 'Point'], ['!=', 'type', 'center']]
                });

                map.on('zoomend', this.onZoomEnd);
                map.on('mousemove', this.onMouseMove); // _.debounce(this.onMouseMove, 16));
            }

            this.map = map;
        };

        if (map._loaded) {
            if (map.isStyleLoaded()) {
                attachMapArtifacts();
            } else {
                map.once('render', attachMapArtifacts);
            }
        } else {
            map.once('load', attachMapArtifacts);
        }

        return this;
    }

    /**
     * Remove source data, layers and listeners from map.
     * @return {MapboxCircle}
     */
    remove() {
        if (this.options.editable) {
            this.map.off('mousemove', this.onMouseMove);
            this.map.off('zoomend', this.onZoomEnd);
            this.map.removeLayer(this._circleRadiusHandlesId);
            this.map.removeLayer(this._circleCenterHandleId);
        }

        this.map.removeLayer(this._circleFillId);
        this.map.removeLayer(this._circleLineId);
        this.map.removeSource(this._circleSourceId);

        this.map = null;

        return this;
    }
}

MapboxCircle._global_id_counter = 0;

module.exports = exports = MapboxCircle;
