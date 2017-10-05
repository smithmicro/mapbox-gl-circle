'use strict';

const projectVersion = require('../package.json').version;
const _ = require('lodash');
const EventEmitter = require('events');
const turfCircle = require('@turf/circle');
const turfBbox = require('@turf/bbox');
const turfBboxPoly = require('@turf/bbox-polygon');
const turfTruncate = require('@turf/truncate');
const turfDestination = require('@turf/destination');
const turfDistance = require('@turf/distance');
const turfHelpers = require('@turf/helpers');

if (window && typeof window.MapboxCircle === 'function') {
    throw new TypeError('mapbox-gl-circle-' + window.MapboxCircle.VERSION + ' already loaded');
}

/**
 * A `google.maps.Circle` replacement for Mapbox GL JS, rendering a "spherical cap" on top of the world.
 * @class MapboxCircle
 * @example
 * var myCircle = new MapboxCircle({lat: 39.984, lng: -75.343}, 25000, {
 *         editable: true,
 *         minRadius: 1500,
 *         fillColor: '#29AB87'
 *     }).addTo(myMapboxGlMap);
 *
 * myCircle.on('centerchanged', function (circleObj) {
 *         console.log('New center:', circleObj.getCenter());
 *     });
 * myCircle.once('radiuschanged', function (circleObj) {
 *         console.log('New radius (once!):', circleObj.getRadius());
 *     });
 * myCircle.on('click', function (mapMouseEvent) {
 *         console.log('Click:', mapMouseEvent.point);
 *     });
 * myCircle.on('contextmenu', function (mapMouseEvent) {
 *         console.log('Right-click:', mapMouseEvent.lngLat);
 *     });
 * @public
 */
class MapboxCircle {
    /**
     * @return {string} 'mapbox-gl-circle' library version number.
     */
    static get VERSION() {
        return projectVersion;
    }

    /**
     * @return {number} Globally unique instance ID.
     * @private
     */
    get _instanceId() {
        if (this.__instanceId === undefined) {
            this.__instanceId = MapboxCircle.__MONOSTATE.instanceIdCounter++;
        }
        return this.__instanceId;
    }

    /**
     * @return {string} Unique circle source ID.
     * @private
     */
    get _circleSourceId() {
        return 'circle-source-' + this._instanceId;
    }

    /**
     * @return {string} Unique circle line-stroke ID.
     * @private
     */
    get _circleLineId() {
        return 'circle-line-' + this._instanceId;
    }

    /**
     * @return {string} Unique circle fill ID.
     * @private
     */
    get _circleFillId() {
        return 'circle-fill-' + this._instanceId;
    }

    /**
     * @return {string} Unique circle center handle ID.
     * @private
     */
    get _circleCenterHandleId() {
        return 'circle-center-handle-' + this._instanceId;
    }

    /**
     * @return {string} Unique circle radius handles' ID.
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

    /** @param {[number,number]} newCenter Center `[lng, lat]` coordinates. */
    set center(newCenter) {
        this._currentCenterLngLat[0] = newCenter[0];
        this._currentCenterLngLat[1] = newCenter[1];
        this._updateCircle();
        this._animate();
    }

    /** @return {[number,number]} Current center `[lng, lat]` coordinates. */
    get center() {
        return this._currentCenterLngLat;
    }

    /** @param {number} newRadius Meter radius. */
    set radius(newRadius) {
        this._currentRadius = Math.min(Math.max(this.options.minRadius, newRadius), this.options.maxRadius);
        this._updateCircle();
        this._animate();
    }

    /** @return {number} Current circle radius. */
    get radius() {
        return this._currentRadius;
    }

    /** @param {number} newZoom New zoom level. */
    set zoom(newZoom) {
        this._zoom = newZoom;
        if (this.options.refineStroke) {
            this._updateCircle();
            this._animate();
        }
    }

    /**
     * @param {{lat: number, lng: number}|[number,number]} center Circle center as an object or `[lng, lat]` coordinates
     * @param {number} radius Meter radius
     * @param {?Object} options
     * @param {?boolean} [options.editable=false] Enable handles for changing center and radius
     * @param {?number} [options.minRadius=10] Minimum radius on user interaction
     * @param {?number} [options.maxRadius=1100000] Maximum radius on user interaction
     * @param {?string} [options.strokeColor='#000000'] Stroke color
     * @param {?number} [options.strokeWeight=0.5] Stroke weight
     * @param {?number} [options.strokeOpacity=0.75] Stroke opacity
     * @param {?string} [options.fillColor='#FB6A4A'] Fill color
     * @param {?number} [options.fillOpacity=0.25] Fill opacity
     * @param {?boolean} [options.refineStroke=false] Adjust circle polygon precision based on radius and zoom
     *     (i.e. prettier circles at the expense of performance)
     * @param {?Object} [options.properties={}] Property metadata for Mapbox GL JS circle object
     * @public
     */
    constructor(center, radius, options) {
        /** @const {boolean} */ this.__safariContextMenuEventHackEnabled = false;

        /** @const {EventEmitter} */ this._eventEmitter = new EventEmitter();

        let centerLat = typeof(center.lat) === 'number' ? center.lat : center[1];
        let centerLng = typeof(center.lng) === 'number' ? center.lng : center[0];

        /** @const {[number,number]} */ this._lastCenterLngLat = [centerLng, centerLat];
        /** @const {[number,number]} */ this._currentCenterLngLat = [centerLng, centerLat];
        /** @const {number} */ this._lastRadius = Math.round(radius);
        /** @const {number} */ this._currentRadius = Math.round(radius);
        /** @const {Object} */ this.options = _.extend({
            editable: false,
            strokeColor: '#000000',
            strokeWeight: 0.5,
            strokeOpacity: 0.75,
            fillColor: '#FB6A4A',
            fillOpacity: 0.25,
            refineStroke: false,
            minRadius: 10,
            maxRadius: 1.1e6,
            properties: {},
            debugEl: null
        }, options);

        /** @const {mapboxgl.Map} */ this._map = undefined;
        /** @const {number} */ this._zoom = undefined;
        /** @const {Polygon} */ this._circle = undefined;
        /** @const {Array<Point>} */ this._handles = undefined;
        /** @const {boolean} */ this._centerDragActive = false;
        /** @const {boolean} */ this._radiusDragActive = false;

        [ // Bind all event handlers.
            '_onCenterHandleMouseEnter',
            '_onRadiusHandlesMouseEnter',
            '_onCenterHandleSuspendEvents',
            '_onRadiusHandlesSuspendEvents',
            '_onCenterHandleResumeEvents',
            '_onRadiusHandlesResumeEvents',
            '_onCenterHandleMouseDown',
            '_onRadiusHandlesMouseDown',
            '_onCenterHandleMouseMove',
            '_onRadiusHandlesMouseMove',
            '_onCenterHandleMouseUpOrMapMouseOut',
            '_onRadiusHandlesMouseUpOrMapMouseOut',
            '_onCenterChanged',
            '_onRadiusChanged',
            '_onRadiusHandlesMouseLeave',
            '_onCenterHandleMouseLeave',
            '_onCircleFillContextMenu',
            '_onCircleFillClick',
            '_onZoomEnd',
            '_onMapStyleDataLoading'
        ].forEach((eventHandler) => {
            this[eventHandler] = this[eventHandler].bind(this);
        });

        // Initialize circle.
        this._updateCircle();
    }

    /**
     * Return `true` if current browser seems to be Safari.
     * @return {boolean}
     * @private
     */
    static _checkIfBrowserIsSafari() {
        return window.navigator.userAgent.indexOf('Chrome') === -1 && window.navigator.userAgent.indexOf('Safari') > -1;
    }

    /**
     * Re-calculate/update circle polygon and handles.
     * @private
     */
    _updateCircle() {
        const center = this._currentCenterLngLat;
        const radius = this._currentRadius;
        const zoom = !this._zoom || this._zoom <= 0.1 ? 0.1 : this._zoom;
        const steps = this.options.refineStroke ? Math.max((Math.sqrt(Math.trunc(radius * 0.25)) * zoom ^ 2), 64) : 64;
        const unit = 'meters';

        this._circle = turfCircle(center, radius, steps, unit, this.options.properties);
        this._handles = [
            turfDestination(center, radius, 0, unit),
            turfDestination(center, radius, 90, unit),
            turfDestination(center, radius, 180, unit),
            turfDestination(center, radius, -90, unit)
        ];

        if (this.options.debugEl) {
            this.options.debugEl.innerHTML = ('Center: ' + JSON.stringify(this.getCenter()) + ' / Radius: ' + radius +
                                              ' / Bounds: ' + JSON.stringify(this.getBounds()) + ' / Steps: ' + steps +
                                              ' / Zoom: ' + zoom.toFixed(2) + ' / ID: ' + this._instanceId);
        }
    }

    /**
     * Refresh map with the circle's GeoJSON.
     * @private
     */
    _animate() {
        // map.on('sourcedata', onSourceData)
        // noinspection JSCheckFunctionSignatures
        this._map.getSource(this._circleSourceId).setData(this._asGeoJSON());
    }

    /**
     * Return GeoJSON for circle and handles.
     * @private
     * @return {FeatureCollection}
     */
    _asGeoJSON() {
        return turfHelpers.featureCollection(
            [...this._handles, this._circle, turfHelpers.point(this._currentCenterLngLat, {'type': 'center'})]);
    }

    /**
     * Broadcast suspend event to other interactive circles, instructing them to stop listening during drag interaction.
     * @param {string} typeOfHandle 'radius' or 'circle'.
     * @private
     */
    _suspendHandleListeners(typeOfHandle) {
        MapboxCircle.__MONOSTATE.broadcast.emit('suspendCenterHandleListeners', this._instanceId, typeOfHandle);
        MapboxCircle.__MONOSTATE.broadcast.emit('suspendRadiusHandlesListeners', this._instanceId, typeOfHandle);
    }

    /**
     * Broadcast resume event to other editable circles, to make them to resume interactivity after a completed drag op.
     * @param {string} typeOfHandle 'radius' or 'circle'.
     * @private
     */
    _resumeHandleListeners(typeOfHandle) {
        MapboxCircle.__MONOSTATE.broadcast.emit('resumeCenterHandleListeners', this._instanceId, typeOfHandle);
        MapboxCircle.__MONOSTATE.broadcast.emit('resumeRadiusHandlesListeners', this._instanceId, typeOfHandle);
    }

    /**
     * Disable map panning, 'click' cursor and highlight handle with new fill color.
     * @param {string} layerId
     * @private
     */
    _highlightHandles(layerId) {
        this.map.dragPan.disable();
        this.map.setPaintProperty(layerId, 'circle-color', this.options.fillColor);

        if (layerId.includes('circle-radius-handles')) {
            this.map.getCanvas().style.cursor = 'all-scroll';
        } else if (layerId.includes('circle-center-handle')) {
            this.map.getCanvas().style.cursor = 'move';
        }
    }

    /**
     * Re-enable map panning, reset cursor icon and restore fill color to white.
     * @param {string} layerId
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
     * Stop listening to center handle events, unless it's what the circle is currently busy with.
     * @param {number} instanceId ID of the circle instance that requested suspension.
     * @param {string} typeOfHandle 'center' or 'radius'.
     * @private
     */
    _onCenterHandleSuspendEvents(instanceId, typeOfHandle) {
        if (instanceId !== this._instanceId || typeOfHandle === 'radius') {
            this._unbindCenterHandleListeners();
        }
    }

    /**
     * Start listening to center handle events again, unless the circle was NOT among those targeted by suspend event.
     * @param {number} instanceId ID of the circle instance that said it's time to resume listening.
     * @param {string} typeOfHandle 'center' or 'radius'.
     * @private
     */
    _onCenterHandleResumeEvents(instanceId, typeOfHandle) {
        if (instanceId !== this._instanceId || typeOfHandle === 'radius') {
            this._bindCenterHandleListeners();
        }
    }

    /**
     * Highlight center handle, disable panning and add mouse-move listener (emulating drag until mouse-up event).
     * @private
     */
    _onCenterHandleMouseDown() {
        this._centerDragActive = true;
        this.map.on('mousemove', this._onCenterHandleMouseMove);
        this._suspendHandleListeners('center');
        this.map.once('mouseup', this._onCenterHandleMouseUpOrMapMouseOut);
        this.map.once('mouseout', this._onCenterHandleMouseUpOrMapMouseOut); // Deactivate drag if mouse leaves canvas.
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
     * Reset center handle, re-enable panning and remove listeners from _onCenterHandleMouseDown.
     * @param {MapMouseEvent} event
     * @private
     */
    _onCenterHandleMouseUpOrMapMouseOut(event) {
        this._centerDragActive = false;
        this.map.off('mousemove', this._onCenterHandleMouseMove);
        switch (event.type) {
            case 'mouseup': this.map.off('mouseout', this._onCenterHandleMouseUpOrMapMouseOut); break;
            case 'mouseout': this.map.off('mouseup', this._onCenterHandleMouseUpOrMapMouseOut); break;
        }
        this._resumeHandleListeners('center');
        this._resetHandles(this._circleCenterHandleId);
        if (this.center[0] !== this._lastCenterLngLat[0] && this.center[1] !== this._lastCenterLngLat[1]) {
            this._eventEmitter.emit('centerchanged', this);
        }
    }

    /**
     * Reset center handle and re-enable panning, unless actively dragging.
     * @private
     */
    _onCenterHandleMouseLeave() {
        if (this._centerDragActive) {
            setTimeout(() => { // If dragging, wait a bit to see if it just recently stopped.
                if (!this._centerDragActive) this._resetHandles(this._circleCenterHandleId);
            }, 125);
        } else {
            this._resetHandles(this._circleCenterHandleId);
        }
    }

    /**
     * Update _lastCenterLngLat on `centerchanged` event.
     * @private
     */
    _onCenterChanged() {
        this._lastCenterLngLat[0] = this.center[0];
        this._lastCenterLngLat[1] = this.center[1];
    }

    /**
     * Highlight radius handles and disable panning.
     * @private
     */
    _onRadiusHandlesMouseEnter() {
        this._highlightHandles(this._circleRadiusHandlesId);
    }

    /**
     * Stop listening to radius handles' events, unless it's what the circle is currently busy with.
     * @param {number} instanceId ID of the circle instance that requested suspension.
     * @param {string} typeOfHandle 'center' or 'radius'.
     * @private
     */
    _onRadiusHandlesSuspendEvents(instanceId, typeOfHandle) {
        if (instanceId !== this._instanceId || typeOfHandle === 'center') {
            this._unbindRadiusHandlesListeners();
        }
    }

    /**
     * Start listening to radius handles' events again, unless the circle was NOT among those targeted by suspend event.
     * @param {number} instanceId ID of the circle instance that said it's time to resume listening.
     * @param {string} typeOfHandle 'center' or 'radius'.
     * @private
     */
    _onRadiusHandlesResumeEvents(instanceId, typeOfHandle) {
        if (instanceId !== this._instanceId || typeOfHandle === 'center') {
            this._bindRadiusHandlesListeners();
        }
    }

    /**
     * Highlight radius handles, disable panning and add mouse-move listener (emulating drag until mouse-up event).
     * @private
     */
    _onRadiusHandlesMouseDown() {
        this._radiusDragActive = true;
        this.map.on('mousemove', this._onRadiusHandlesMouseMove);
        this._suspendHandleListeners('radius');
        this.map.once('mouseup', this._onRadiusHandlesMouseUpOrMapMouseOut);
        this.map.once('mouseout', this._onRadiusHandlesMouseUpOrMapMouseOut); // Deactivate drag if mouse leaves canvas.
        this._highlightHandles(this._circleRadiusHandlesId);
    }

    /**
     * Animate circle radius change after _onRadiusHandlesMouseDown triggers.
     * @param {MapMouseEvent} event
     * @private
     */
    _onRadiusHandlesMouseMove(event) {
        const mousePoint = this.map.unproject(event.point).toArray();
        this.radius = Math.round(turfDistance(this.center, mousePoint, 'meters'));
    }

    /**
     * Reset radius handles, re-enable panning and remove listeners from _onRadiusHandlesMouseDown.
     * @param {MapMouseEvent} event
     * @private
     */
    _onRadiusHandlesMouseUpOrMapMouseOut(event) {
        this._radiusDragActive = false;
        this.map.off('mousemove', this._onRadiusHandlesMouseMove);
        switch (event.type) {
            case 'mouseup': this.map.off('mouseout', this._onRadiusHandlesMouseUpOrMapMouseOut); break;
            case 'mouseout': this.map.off('mouseup', this._onRadiusHandlesMouseUpOrMapMouseOut); break;
        }
        this._resumeHandleListeners('radius');
        this._resetHandles(this._circleRadiusHandlesId);
        if (this.radius !== this._lastRadius) {
            this._eventEmitter.emit('radiuschanged', this);
        }
    }

    /**
     * Reset radius handles and re-enable panning, unless actively dragging.
     * @private
     */
    _onRadiusHandlesMouseLeave() {
        if (this._radiusDragActive) {
            setTimeout(() => { // If dragging, wait a bit to see if it just recently stopped.
                if (!this._radiusDragActive) this._resetHandles(this._circleRadiusHandlesId);
            }, 125);
        } else {
            this._resetHandles(this._circleRadiusHandlesId);
        }
    }

    /**
     * Update _lastRadius on `radiuschanged` event.
     * @private
     */
    _onRadiusChanged() {
        this._lastRadius = this.radius;
    }

    /**
     * Fire 'contextmenu' event.
     * @param {MapMouseEvent} event
     * @private
     */
    _onCircleFillContextMenu(event) {
        if (event.originalEvent.ctrlKey && MapboxCircle._checkIfBrowserIsSafari()) {
            // This hack comes from SPFAM-1090, aimed towards eliminating the extra 'click' event that's
            // emitted by Safari when performing a right-click by holding the ctrl button.
            this.__safariContextMenuEventHackEnabled = true;
        } else {
            this._eventEmitter.emit('contextmenu', event);
        }
    }

    /**
     * Fire 'click' event.
     * @param {MapMouseEvent} event
     * @private
     */
    _onCircleFillClick(event) {
        if (!this.__safariContextMenuEventHackEnabled) {
            this._eventEmitter.emit('click', event);
        } else {
            this._eventEmitter.emit('contextmenu', event);
            this.__safariContextMenuEventHackEnabled = false;
        }
    }

    /**
     * When map style is changed, remove circle assets from map and add it back on next MapboxGL 'styledata' event.
     * @param {MapDataEvent} event
     * @private
     */
    _onMapStyleDataLoading(event) {
        if (this.map) {
            this.map.once('styledata', () => {
                this.addTo(event.target);
            });
            this.remove();
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
        map.on('mouseenter', layerId, this._onRadiusHandlesMouseEnter);
        map.on('mousedown', layerId, this._onRadiusHandlesMouseDown);
        map.on('mouseleave', layerId, this._onRadiusHandlesMouseLeave);
    }

    /**
     * Remove all static listeners for radius handles.
     * @param {mapboxgl.Map} [map]
     * @private
     */
    _unbindRadiusHandlesListeners(map) {
        map = map || this.map;
        const layerId = this._circleRadiusHandlesId;
        map.off('mouseenter', layerId, this._onRadiusHandlesMouseEnter);
        map.off('mousedown', layerId, this._onRadiusHandlesMouseDown);
        map.off('mouseleave', layerId, this._onRadiusHandlesMouseLeave);
    }

    /**
     * Add all click/contextmenu listeners for circle fill layer.
     * @param {mapboxgl.Map} [map]
     * @private
     */
    _bindCircleFillListeners(map) {
        map = map || this.map;
        const layerId = this._circleFillId;
        map.on('click', layerId, this._onCircleFillClick);
        map.on('contextmenu', layerId, this._onCircleFillContextMenu);
    }

    /**
     * Remove all click/contextmenu listeners for circle fill.
     * @param {mapboxgl.Map} [map]
     * @private
     */
    _unbindCircleFillListeners(map) {
        map = map || this.map;
        const layerId = this._circleFillId;
        map.off('click', layerId, this._onCircleFillClick);
        map.off('contextmenu', layerId, this._onCircleFillContextMenu);
    }

    /**
     * Add suspend/resume listeners for `__MONOSTATE.broadcast` event emitter.
     * @private
     */
    _bindBroadcastListeners() {
        MapboxCircle.__MONOSTATE.broadcast.on('suspendCenterHandleListeners', this._onCenterHandleSuspendEvents);
        MapboxCircle.__MONOSTATE.broadcast.on('resumeCenterHandleListeners', this._onCenterHandleResumeEvents);

        MapboxCircle.__MONOSTATE.broadcast.on('suspendRadiusHandlesListeners', this._onRadiusHandlesSuspendEvents);
        MapboxCircle.__MONOSTATE.broadcast.on('resumeRadiusHandlesListeners', this._onRadiusHandlesResumeEvents);
    }

    /**
     * Remove suspend/resume handlers from `__MONOSTATE.broadcast` emitter.
     * @private
     */
    _unbindBroadcastListeners() {
        MapboxCircle.__MONOSTATE.broadcast.removeListener(
            'suspendCenterHandleListeners', this._onCenterHandleSuspendEvents);
        MapboxCircle.__MONOSTATE.broadcast.removeListener(
            'resumeCenterHandleListeners', this._onCenterHandleResumeEvents);

        MapboxCircle.__MONOSTATE.broadcast.removeListener(
            'suspendRadiusHandlesListeners', this._onRadiusHandlesSuspendEvents);
        MapboxCircle.__MONOSTATE.broadcast.removeListener('resumeRadiusHandlesListeners',
            this._onRadiusHandlesResumeEvents);
    }

    /**
     * Add circle to `__MONOSTATE.activeEditableCircles` array and increase max broadcasting listeners by 1.
     * @param {MapboxCircle} circleObject
     * @private
     */
    static _addActiveEditableCircle(circleObject) {
        MapboxCircle.__MONOSTATE.activeEditableCircles.push(circleObject);
        MapboxCircle.__MONOSTATE.broadcast.setMaxListeners(
            MapboxCircle.__MONOSTATE.activeEditableCircles.length);
    }

    /**
     * Remove circle from `__MONOSTATE.activeEditableCircles` array and decrease max broadcasting listeners by 1.
     * @param {MapboxCircle} circleObject
     * @private
     */
    static _removeActiveEditableCircle(circleObject) {
        MapboxCircle.__MONOSTATE.activeEditableCircles.splice(
            MapboxCircle.__MONOSTATE.activeEditableCircles.indexOf(circleObject), 1);
        MapboxCircle.__MONOSTATE.broadcast.setMaxListeners(
            MapboxCircle.__MONOSTATE.activeEditableCircles.length);
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
     * Subscribe to circle event.
     * @param {string} event Event name; `click`, `contextmenu`, `centerchanged` or `radiuschanged`
     * @param {Function} fn Event handler, invoked with the target circle as first argument on
     *     *'centerchanged'* and *'radiuschanged'*, or a *MapMouseEvent* on *'click'* and *'contextmenu'* events
     * @param {?boolean} [onlyOnce=false] Remove handler after first call
     * @return {MapboxCircle}
     * @public
     */
    on(event, fn, onlyOnce) {
        if (onlyOnce) {
            this._eventEmitter.once(event, fn);
        } else {
            this._eventEmitter.addListener(event, fn);
        }
        return this;
    }

    /**
     * Alias for registering event listener with *onlyOnce=true*, see {@link #on}.
     * @param {string} event Event name
     * @param {Function} fn Event handler
     * @return {MapboxCircle}
     * @public
     */
    once(event, fn) {
        return this.on(event, fn, true);
    }

    /**
     * Unsubscribe to circle event.
     * @param {string} event Event name
     * @param {Function} fn Handler to be removed
     * @return {MapboxCircle}
     * @public
     */
    off(event, fn) {
        this._eventEmitter.removeListener(event, fn);
        return this;
    }

    /**
     * @param {mapboxgl.Map} map Target map for adding and initializing circle Mapbox GL layers/data/listeners.
     * @return {MapboxCircle}
     * @public
     */
    addTo(map) {
        const addCircleAssetsOnMap = () => {
            map.addSource(this._circleSourceId, this._getMapSourceGeoJSON());

            map.addLayer(this._getCircleStrokeLayer(), 'waterway-label');
            map.addLayer(this._getCircleFillLayer(), 'waterway-label');
            this._bindCircleFillListeners(map);
            map.on('zoomend', this._onZoomEnd);

            if (this.options.editable) {
                map.addLayer(this._getCircleCenterHandleLayer());
                this._bindCenterHandleListeners(map);

                map.addLayer(this._getCircleRadiusHandlesLayer());
                this._bindRadiusHandlesListeners(map);

                this.on('centerchanged', this._onCenterChanged).on('radiuschanged', this._onRadiusChanged);

                MapboxCircle._addActiveEditableCircle(this);
                this._bindBroadcastListeners();
            }

            map.on('styledataloading', this._onMapStyleDataLoading);

            this.map = map;
            this.zoom = map.getZoom();
            this._eventEmitter.emit('rendered', this);
        };

        // noinspection JSUnresolvedVariable
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
     * @public
     */
    remove() {
        this.map.off('styledataloading', this._onMapStyleDataLoading);

        if (this.options.editable) {
            this._unbindBroadcastListeners();
            MapboxCircle._removeActiveEditableCircle(this);

            this.off('radiuschanged', this._onRadiusChanged).off('centerchanged', this._onCenterChanged);

            this._unbindRadiusHandlesListeners();
            this.map.removeLayer(this._circleRadiusHandlesId);

            this._unbindCenterHandleListeners();
            this.map.removeLayer(this._circleCenterHandleId);
        }

        this.map.off('zoomend', this._onZoomEnd);
        this._unbindCircleFillListeners();
        this.map.removeLayer(this._circleFillId);
        this.map.removeLayer(this._circleLineId);

        this.map.removeSource(this._circleSourceId);

        this.map = null;

        return this;
    }

    /**
     * @return {{lat: number, lng: number}} Circle center position
     * @public
     */
    getCenter() {
        return {lat: this.center[1], lng: this.center[0]};
    }

    /**
     * @param {{lat: number, lng: number}} position
     * @return {MapboxCircle}
     * @public
     */
    setCenter(position) {
        const applyUpdate = () => {
            this.center = [position.lng, position.lat];
            if (this.center[0] !== this._lastCenterLngLat[0] && this.center[1] !== this._lastCenterLngLat[1]) {
                this._eventEmitter.emit('centerchanged', this);
            }
        };

        if (this.map) {
            applyUpdate();
        } else {
            this.on('rendered', applyUpdate, true);
        }

        return this;
    }

    /**
     * @return {number} Current radius, in meters
     * @public
     */
    getRadius() {
        return this.radius;
    }

    /**
     * @param {number} newRadius Meter radius
     * @return {MapboxCircle}
     * @public
     */
    setRadius(newRadius) {
        newRadius = Math.round(newRadius);
        const applyUpdate = () => {
            this.radius = newRadius;
            if (this._lastRadius !== newRadius && this.radius === newRadius) { // `this.radius =` subject to min/max lim
                this._eventEmitter.emit('radiuschanged', this);
            }
        };

        if (this.map) {
            applyUpdate();
        } else {
            this.on('rendered', applyUpdate, true);
        }

        return this;
    }

    /**
     * @return {{sw: {lat: number, lng: number}, ne: {lat: number, lng: number}}} Southwestern/northeastern bounds
     * @public
     */
    getBounds() {
        const bboxPolyCoordinates = turfTruncate(turfBboxPoly(turfBbox(this._circle)), 6).geometry.coordinates[0];
        return {
            sw: {lat: bboxPolyCoordinates[0][1], lng: bboxPolyCoordinates[0][0]},
            ne: {lat: bboxPolyCoordinates[2][1], lng: bboxPolyCoordinates[2][0]}
        };
    }
}

MapboxCircle.__MONOSTATE = {
    instanceIdCounter: 0,
    activeEditableCircles: [],
    broadcast: new EventEmitter()
};

module.exports = exports = MapboxCircle;
