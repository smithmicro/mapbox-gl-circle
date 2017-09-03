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
     * @return {Number} Globally unique instance ID.
     * @private
     */
    get _instanceId() {
        if (this.__instanceId === undefined) {
            this.__instanceId = MapboxCircle._global_id_counter++;
        }
        return this.__instanceId;
    }

    /**
     * @return {String} Unique circle source ID.
     * @private
     */
    get _circleSourceId() {
        return 'circle-source-' + this._instanceId;
    }

    /**
     * @return {String} Unique circle line-stroke ID.
     * @private
     */
    get _circleLineId() {
        return 'circle-line-' + this._instanceId;
    }

    /**
     * @return {String} Unique circle fill ID.
     * @private
     */
    get _circleFillId() {
        return 'circle-fill-' + this._instanceId;
    }

    /**
     * @return {String} Unique circle center handle ID.
     * @private
     */
    get _circleCenterHandleId() {
        return 'circle-center-handle-' + this._instanceId;
    }

    /**
     * @return {String} Unique circle radius handles' ID.
     * @private
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
        /** @const {Boolean} */ this._dragActive = false;

        // Bind event handlers.
        this._onRadiusHandleMouseEnter = this._onRadiusHandleMouseEnter.bind(this);
        this._onCenterHandleMouseEnter = this._onCenterHandleMouseEnter.bind(this);
        this._onRadiusHandleMouseLeave = this._onRadiusHandleMouseLeave.bind(this);
        this._onCenterHandleMouseLeave = this._onCenterHandleMouseLeave.bind(this);
        this._onCenterHandleMouseDown = this._onCenterHandleMouseDown.bind(this);
        this._onRadiusHandleMouseDown = this._onRadiusHandleMouseDown.bind(this);
        this._onCenterHandleMouseUp = this._onCenterHandleMouseUp.bind(this);
        this._onRadiusHandleMouseUp = this._onRadiusHandleMouseUp.bind(this);
        this._onCenterHandleMouseMove = this._onCenterHandleMouseMove.bind(this);
        this._onRadiusHandleMouseMove = this._onRadiusHandleMouseMove.bind(this);
        this._onZoomEnd = this._onZoomEnd.bind(this);

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
     * Disable map panning, 'click' cursor and highlight handle with new fill color.
     * @param {String} layerId
     * @private
     */
    _highlightHandles(layerId) {
        this.map.dragPan.disable();
        this.map.setPaintProperty(layerId, 'circle-color', this.options.fillColor);
        this.map.getCanvas().style.cursor = 'pointer';
    }

    /**
     * Re-enable map panning, reset cursor icon and restore fill color to white.
     * @param {String} layerId
     * @private
     */
    _resetHandles(layerId) {
        this.map.dragPan.enable();
        this.map.setPaintProperty(layerId, 'circle-color', '#ffffff');
        this.map.getCanvas().style.cursor = '';
    }

    /**
     * Adjust circle precision (steps used to draw the polygon).
     * @private
     */
    _onZoomEnd() {
        this.zoom = this.map.getZoom();
    }

    /**
     * Highlight center handle and disable panning.
     * @private
     */
    _onCenterHandleMouseEnter() {
        this._highlightHandles(this._circleCenterHandleId);
    }

    /**
     * Highlight center handle, disable panning and add mouse-move listener (emulating drag until mouse-up event).
     * @private
     */
    _onCenterHandleMouseDown() {
        this._dragActive = true;
        this.map.on('mousemove', this._onCenterHandleMouseMove);
        this.map.once('mouseup', this._onCenterHandleMouseUp);
        this._highlightHandles(this._circleCenterHandleId);
    }

    /**
     * Animate circle center change after _onCenterHandleMouseDown triggers.
     * @param {MapMouseEvent} event
     * @private
     */
    _onCenterHandleMouseMove(event) {
        const mousePoint = turfTruncate(turfHelpers.point(this.map.unproject(event.point).toArray()), 6);
        this.center = mousePoint.geometry.coordinates;
    }

    /**
     * Reset center handle, re-enable panning and remove mouse-move listener from _onCenterHandleMouseDown.
     * @private
     */
    _onCenterHandleMouseUp() {
        this._dragActive = false;
        this.map.off('mousemove', this._onCenterHandleMouseMove);
        this._resetHandles(this._circleCenterHandleId);
    }

    /**
     * Reset center handle and re-enable panning, unless actively dragging.
     * @private
     */
    _onCenterHandleMouseLeave() {
        if (this._dragActive) {
            setTimeout(() => { // If dragging, wait a bit to see if it just recently stopped.
                if (!this._dragActive) this._resetHandles(this._circleCenterHandleId);
            }, 125);
        } else {
            this._resetHandles(this._circleCenterHandleId);
        }
    }

    /**
     * Highlight radius handles and disable panning.
     * @private
     */
    _onRadiusHandleMouseEnter() {
        this._highlightHandles(this._circleRadiusHandlesId);
    }

    /**
     * Highlight radius handles, disable panning and add mouse-move listener (emulating drag until mouse-up event).
     * @private
     */
    _onRadiusHandleMouseDown() {
        this._dragActive = true;
        this.map.on('mousemove', this._onRadiusHandleMouseMove);
        this.map.once('mouseup', this._onRadiusHandleMouseUp);
        this._highlightHandles(this._circleRadiusHandlesId);
    }

    /**
     * Animate circle radius change after _onRadiusHandleMouseDown triggers.
     * @param {MapMouseEvent} event
     * @private
     */
    _onRadiusHandleMouseMove(event) {
        const mousePoint = this.map.unproject(event.point).toArray();
        this.radius = turfDistance(this.center, mousePoint, 'meters');
    }

    /**
     * Reset radius handles, re-enable panning and remove mouse-move listener from _onRadiusHandleMouseDown.
     * @private
     */
    _onRadiusHandleMouseUp() {
        this._dragActive = false;
        this.map.off('mousemove', this._onRadiusHandleMouseMove);
        this._resetHandles(this._circleRadiusHandlesId);
    }

    /**
     * Reset radius handles and re-enable panning, unless actively dragging.
     * @private
     */
    _onRadiusHandleMouseLeave() {
        if (this._dragActive) {
            setTimeout(() => { // If dragging, wait a bit to see if it just recently stopped.
                if (!this._dragActive) this._resetHandles(this._circleRadiusHandlesId);
            }, 125);
        } else {
            this._resetHandles(this._circleRadiusHandlesId);
        }
    }

    /**
     * Add all static listeners for center handle.
     * @param {mapboxgl.Map} [map]
     * @private
     */
    _bindCenterHandleListeners(map) {
        map = map || this.map;
        const layerId = this._circleCenterHandleId;
        map.on('mouseenter', layerId, this._onCenterHandleMouseEnter);
        map.on('mousedown', layerId, this._onCenterHandleMouseDown);
        map.on('mouseleave', layerId, this._onCenterHandleMouseLeave);
    }

    /**
     * Remove all static listeners for center handle.
     * @param {mapboxgl.Map} [map]
     * @private
     */
    _unbindCenterHandleListeners(map) {
        map = map || this.map;
        const layerId = this._circleCenterHandleId;
        map.off('mouseenter', layerId, this._onCenterHandleMouseEnter);
        map.off('mousedown', layerId, this._onCenterHandleMouseDown);
        map.off('mouseleave', layerId, this._onCenterHandleMouseLeave);
    }

    /**
     * Add all static listeners for radius handles.
     * @param {mapboxgl.Map} [map]
     * @private
     */
    _bindRadiusHandlesListeners(map) {
        map = map || this.map;
        const layerId = this._circleRadiusHandlesId;
        map.on('mouseenter', layerId, this._onRadiusHandleMouseEnter);
        map.on('mousedown', layerId, this._onRadiusHandleMouseDown);
        map.on('mouseleave', layerId, this._onRadiusHandleMouseLeave);
    }

    /**
     * Remove all static listeners for radius handles.
     * @param {mapboxgl.Map} [map]
     * @private
     */
    _unbindRadiusHandlesListeners(map) {
        map = map || this.map;
        const layerId = this._circleRadiusHandlesId;
        map.off('mouseenter', layerId, this._onRadiusHandleMouseEnter);
        map.off('mousedown', layerId, this._onRadiusHandleMouseDown);
        map.off('mouseleave', layerId, this._onRadiusHandleMouseLeave);
    }

    /**
     * @return {Object} The GeoJSON map source, on which all other style layers depend.
     * @private
     */
    _getMapSourceGeoJSON() {
        return {
            type: 'geojson',
            data: this._asGeoJSON(),
            buffer: 1
        };
    }

    /**
     * @return {Object} Style layer for the stroke around the circle.
     * @private
     */
    _getCircleStrokeLayer() {
        return {
            id: this._circleLineId,
            type: 'line',
            source: this._circleSourceId,
            paint: {
                'line-color': this.options.strokeColor,
                'line-width': this.options.strokeWeight,
                'line-opacity': this.options.strokeOpacity
            },
            filter: ['==', '$type', 'Polygon']
        };
    }

    /**
     * @return {Object} Style layer for the circle fill.
     * @private
     */
    _getCircleFillLayer() {
        return {
            id: this._circleFillId,
            type: 'fill',
            source: this._circleSourceId,
            paint: {
                'fill-color': this.options.fillColor,
                'fill-opacity': this.options.fillOpacity
            },
            filter: ['==', '$type', 'Polygon']
        };
    }

    /**
     * @return {Object} Default paint style for edit handles.
     * @private
     */
    _getEditHandleDefaultPaintOptions() {
        return {
            'circle-color': '#ffffff',
            'circle-radius': 3.75,
            'circle-stroke-color': this.options.strokeColor,
            'circle-stroke-opacity': this.options.strokeOpacity,
            'circle-stroke-width': this.options.strokeWeight
        };
    }

    /**
     * @return {Object} Style layer for the circle's center edit handle.
     * @private
     */
    _getCircleCenterHandleLayer() {
        return {
            id: this._circleCenterHandleId,
            type: 'circle',
            source: this._circleSourceId,
            paint: this._getEditHandleDefaultPaintOptions(),
            filter: ['all', ['==', '$type', 'Point'], ['==', 'type', 'center']]
        };
    }

    /**
     * @return {Object} Style layer for the circle's radius edit handles.
     * @private
     */
    _getCircleRadiusHandlesLayer() {
        return {
            id: this._circleRadiusHandlesId,
            type: 'circle',
            source: this._circleSourceId,
            paint: this._getEditHandleDefaultPaintOptions(),
            filter: ['all', ['==', '$type', 'Point'], ['!=', 'type', 'center']]
        };
    }

    /**
     * Set map and initialize it with Mapbox GL layers for the circle artifacts.
     * @param {mapboxgl.Map} map
     * @return {MapboxCircle}
     */
    addTo(map) {
        const addCircleAssetsOnMap = () => {
            map.addSource(this._circleSourceId, this._getMapSourceGeoJSON());

            map.addLayer(this._getCircleStrokeLayer(), 'waterway-label');
            map.addLayer(this._getCircleFillLayer(), 'waterway-label');

            if (this.options.editable) {
                map.addLayer(this._getCircleCenterHandleLayer());
                this._bindCenterHandleListeners(map);

                map.addLayer(this._getCircleRadiusHandlesLayer());
                this._bindRadiusHandlesListeners(map);

                map.on('zoomend', this._onZoomEnd);
            }

            this.map = map;
        };

        if (map._loaded) {
            if (map.isStyleLoaded()) {
                addCircleAssetsOnMap();
            } else {
                map.once('render', addCircleAssetsOnMap);
            }
        } else {
            map.once('load', addCircleAssetsOnMap);
        }

        return this;
    }

    /**
     * Remove source data, layers and listeners from map.
     * @return {MapboxCircle}
     */
    remove() {
        if (this.options.editable) {
            this.map.off('zoomend', this._onZoomEnd);

            this._unbindRadiusHandlesListeners();
            this.map.removeLayer(this._circleRadiusHandlesId);

            this._unbindCenterHandleListeners();
            this.map.removeLayer(this._circleCenterHandleId);
        }

        this.map.removeLayer(this._circleFillId);
        this.map.removeLayer(this._circleLineId);

        this.map.removeSource(this._circleSourceId);

        this.map = null;

        return this;
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
}

MapboxCircle._global_id_counter = 0;

module.exports = exports = MapboxCircle;
