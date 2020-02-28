/*
 * Copyright (c) 2020 Smith Micro - www.smithmicro.com
 * All rights reserved
 */
import * as turf from '@turf/turf';
import { EventEmitter } from 'events';
import { Feature, FeatureCollection, Geometry, Point, Polygon } from 'geojson';
import * as _ from 'lodash';
import * as mapboxgl from 'mapbox-gl';

declare global {
    interface Window {
        MapboxCircle: typeof MapboxCircle;
    }
}

if (window && typeof window.MapboxCircle === 'function') {
    throw new TypeError('mapbox-gl-circle-' + window.MapboxCircle.VERSION + ' already loaded');
}

const projectVersion = require('./../package.json').version;

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
// @dynamic
export class MapboxCircle {
    private instance: number;
    private safariContextMenuEventHackEnabled: boolean;
    private lastCenterLngLat: [number, number];
    private editCenterLngLat: [number, number];
    private currentCenterLngLat: [number, number];
    private lastRadius: number;
    private editRadius: number;
    private currentRadius: number;
    private options: Options;
    private zoom: number;
    private circle: Feature<Polygon>;
    private handles: Array<Feature<Point>>;
    private centerDragActive: boolean;
    private radiusDragActive: boolean;
    private debouncedHandlers: object;
    private map: mapboxgl.Map;
    private eventEmitter: EventEmitter;
    private updateCount: number;
    private observer: MutationObserver;

    /**
     * @param center Circle center as an object or `[lng, lat]` coordinates
     * @param radius Meter radius
     * @param options Map options
     * @param options.editable=false Enable handles for changing center and radius
     * @param options.minRadius=10 Minimum radius on user interaction
     * @param options.maxRadius=1100000 Maximum radius on user interaction
     * @param options.strokeColor='#000000' Stroke color
     * @param options.strokeWeight=0.5 Stroke weight
     * @param options.strokeOpacity=0.75 Stroke opacity
     * @param options.fillColor='#FB6A4A' Fill color
     * @param options.fillOpacity=0.25 Fill opacity
     * @param options.refineStroke=false Adjust circle polygon precision based on radius and zoom (i.e. prettier circles at the expense of performance)
     * @param options.properties={} Property metadata for Mapbox GL JS circle object
     */
    constructor(center: { lat: number; lng: number }, radius: number, options: Options) {
        this.safariContextMenuEventHackEnabled = false;

        this.eventEmitter = new EventEmitter();

        const centerLat = typeof center.lat === 'number' ? center.lat : center[1];
        const centerLng = typeof center.lng === 'number' ? center.lng : center[0];

        this.lastCenterLngLat = [centerLng, centerLat];
        this.editCenterLngLat = [centerLng, centerLat];
        this.currentCenterLngLat = [centerLng, centerLat];
        this.lastRadius = Math.round(radius);
        this.editRadius = Math.round(radius);
        this.currentRadius = Math.round(radius);
        this.options = _.extend(
            {
                debugEl: null,
                editable: false,
                fillColor: '#FB6A4A',
                fillOpacity: 0.25,
                maxRadius: 1.1e6,
                minRadius: 10,
                properties: {},
                refineStroke: false,
                strokeColor: '#000000',
                strokeOpacity: 0.75,
                strokeWeight: 0.5,
            },
            options,
        );

        this.map = undefined;
        this.zoom = undefined;
        this.circle = undefined;
        this.handles = undefined;
        this.centerDragActive = false;
        this.radiusDragActive = false;
        this.debouncedHandlers = {};
        this.updateCount = 0;

        [
            // Bind all event handlers.
            'onZoomEnd',
            'onCenterHandleMouseEnter',
            'onCenterHandleResumeEvents',
            'onCenterHandleSuspendEvents',
            'onCenterHandleMouseDown',
            'onCenterHandleMouseMove',
            'onCenterHandleMouseUpOrMapMouseOut',
            'onCenterChanged',
            'onCenterHandleMouseLeave',
            'onRadiusHandlesMouseEnter',
            'onRadiusHandlesSuspendEvents',
            'onRadiusHandlesResumeEvents',
            'onRadiusHandlesMouseDown',
            'onRadiusHandlesMouseMove',
            'onRadiusHandlesMouseUpOrMapMouseOut',
            'onRadiusChanged',
            'onRadiusHandlesMouseLeave',
            'onCircleFillMouseMove',
            'onCircleFillSuspendEvents',
            'onCircleFillResumeEvents',
            'onCircleFillContextMenu',
            'onCircleFillClick',
            'onCircleFillMouseLeave',
            'onMapStyleDataLoading',
        ].forEach(eventHandler => {
            this[eventHandler] = this[eventHandler].bind(this);
        });

        // Initialize circle.
        this.updateCircle();
    }

    /**
     * @return 'mapbox-gl-circle' library version number.
     */
    static get VERSION(): string {
        return projectVersion;
    }

    /**
     * Subscribe to circle event.
     * @param event Event name; `click`, `contextmenu`, `centerchanged` or `radiuschanged`
     * @param fn Event handler, invoked with the target circle as first argument on *'centerchanged'* and *'radiuschanged'*, or a *MapMouseEvent* on *'click'* and *'contextmenu'* events
     * @param [onlyOnce=false] Remove handler after first call
     */
    public on(event: string, fn: EventHandlerNonNull, onlyOnce: boolean): MapboxCircle {
        if (onlyOnce) {
            this.eventEmitter.once(event, fn);
        } else {
            this.eventEmitter.addListener(event, fn);
        }
        return this;
    }

    /**
     * Alias for registering event listener with *onlyOnce=true*, see {@link #on}.
     * @param event Event name
     * @param fn Event handler
     */
    public once(event: string, fn: EventHandlerNonNull): MapboxCircle {
        return this.on(event, fn, true);
    }

    /**
     * Unsubscribe to circle event.
     * @param event Event name
     * @param fn Handler to be removed
     */
    public off(event: string, fn: EventHandlerNonNull): MapboxCircle {
        this.eventEmitter.removeListener(event, fn);
        return this;
    }

    /**
     * @param map Target map for adding and initializing circle Mapbox GL layers/data/listeners.
     * @param [before='waterway-label'] Layer ID to insert the circle layers before; explicitly pass `null` to get the circle assets appended at the end of map-layers array
     */
    public addTo(map: mapboxgl.Map, before?: string): MapboxCircle {
        if (typeof map === 'undefined') {
            throw new TypeError('Map is undefined.');
        }

        this.map = map;

        if (typeof before === 'undefined' && this.map.getLayer('waterway-label')) {
            before = 'waterway-label';
        }

        const addCircleAssetsOnMap = () => {
            this.map.addSource(this.circleSourceId, this.getCircleMapSource());

            this.map.addLayer(this.getCircleStrokeLayer(), before);
            this.map.addLayer(this.getCircleFillLayer(), before);
            this.bindCircleFillListeners();
            this.map.on('zoomend', this.onZoomEnd);

            if (this.options.editable) {
                this.map.addSource(this.circleCenterHandleSourceId, this.getCenterHandleMapSource());
                this.map.addSource(this.circleRadiusHandlesSourceId, this.getRadiusHandlesMapSource());

                this.map.addLayer(this.getCircleCenterHandleLayer());
                this.bindCenterHandleListeners();

                this.map.addLayer(this.getCircleRadiusHandlesLayer());
                this.bindRadiusHandlesListeners();

                this.on('centerchanged', this.onCenterChanged, false).on('radiuschanged', this.onRadiusChanged, false);

                this.addActiveEditableCircle(this);
                this.bindBroadcastListeners();
            }

            this.map.on('styledataloading', this.onMapStyleDataLoading);

            const target = this.map.getContainer();
            this.observer = new MutationObserver(mutations => {
                mutations.forEach(mutation => {
                    const removedNodes = Array.from(mutation.removedNodes);
                    const directMatch = removedNodes.indexOf(target) > -1;
                    const parentMatch = removedNodes.some(parent => parent.contains(target));
                    if (directMatch || parentMatch) {
                        this.remove();
                    }
                });
            });

            const config = {
                childList: true,
                subtree: true,
            };
            this.observer.observe(document.body, config);
            this.setZoom(map.getZoom());
            this.eventEmitter.emit('rendered', this);
        };

        // noinspection JSUnresolvedVariable
        if (map.loaded) {
            if (map.isStyleLoaded()) {
                addCircleAssetsOnMap();
            } else {
                map.once('idle', addCircleAssetsOnMap);
            }
        } else {
            map.once('load', addCircleAssetsOnMap);
        }

        return this;
    }

    /**
     * Remove source data, layers and listeners from map.
     */
    public remove(): MapboxCircle {
        this.map.off('styledataloading', this.onMapStyleDataLoading);

        if (this.observer) {
            this.observer.disconnect();
        }

        if (this.options.editable) {
            this.unbindBroadcastListeners();
            this.removeActiveEditableCircle(this);

            this.off('radiuschanged', this.onRadiusChanged).off('centerchanged', this.onCenterChanged);

            this.unbindRadiusHandlesListeners();
            if (this.map.getLayer(this.circleRadiusHandlesId)) {
                this.map.removeLayer(this.circleRadiusHandlesId);
            }

            this.unbindCenterHandleListeners();
            if (this.map.getLayer(this.circleCenterHandleId)) {
                this.map.removeLayer(this.circleCenterHandleId);
            }

            if (this.map.getSource(this.circleRadiusHandlesSourceId)) {
                this.map.removeSource(this.circleRadiusHandlesSourceId);
            }

            if (this.map.getSource(this.circleCenterHandleSourceId)) {
                this.map.removeSource(this.circleCenterHandleSourceId);
            }
        }

        this.map.off('zoomend', this.onZoomEnd);
        this.unbindCircleFillListeners();
        if (this.map.getLayer(this.circleFillId)) {
            this.map.removeLayer(this.circleFillId);
        }
        if (this.map.getLayer(this.circleStrokeId)) {
            this.map.removeLayer(this.circleStrokeId);
        }

        if (this.map.getSource(this.circleSourceId)) {
            this.map.removeSource(this.circleSourceId);
        }

        this.map = null;

        return this;
    }

    /**
     * @return Circle Options
     */
    public getOptions(): Options {
        return this.options;
    }

    /**
     * @param options Circle Options
     */
    public setOptions(options: Options): MapboxCircle {
        const applyUpdate = () => {
            this.options = _.extend(this.options, options);
            this.updateCircle();
            this.animate();
        };

        if (this.map) {
            applyUpdate();
        } else {
            this.on('rendered', applyUpdate, true);
        }

        return this;
    }

    /**
     * @return Circle center position
     */
    public getCenter(): { lat: number; lng: number } {
        return { lat: this.center[1], lng: this.center[0] };
    }

    /**
     * @param position Map center position
     */
    public setCenter(position: { lat: number; lng: number }): MapboxCircle {
        const applyUpdate = () => {
            this.center = [position.lng, position.lat];
            if (this.center[0] !== this.lastCenterLngLat[0] && this.center[1] !== this.lastCenterLngLat[1]) {
                this.eventEmitter.emit('centerchanged', this);
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
     * @return Current radius, in meters
     */
    public getRadius(): number {
        return this.radius;
    }

    /**
     * @param newRadius Meter radius
     */
    public setRadius(newRadius: number): MapboxCircle {
        newRadius = Math.round(newRadius);
        const applyUpdate = () => {
            this.radius = newRadius;
            if (this.lastRadius !== newRadius && this.radius === newRadius) {
                // `this.radius =` subject to min/max lim
                this.eventEmitter.emit('radiuschanged', this);
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
     * @return Southwestern/northeastern bounds
     */
    public getBounds(): { sw: { lat: number; lng: number }; ne: { lat: number; lng: number } } {
        const bboxPolyCoordinates = turf.truncate(turf.bboxPolygon(turf.bbox(this.circle)), { precision: 6 }).geometry
            .coordinates[0];
        return {
            ne: { lat: bboxPolyCoordinates[2][1], lng: bboxPolyCoordinates[2][0] },
            sw: { lat: bboxPolyCoordinates[0][1], lng: bboxPolyCoordinates[0][0] },
        };
    }

    /** @param newCenter Center `[lng, lat]` coordinates. */
    public set center(newCenter: [number, number]) {
        if (this.centerDragActive) {
            this.editCenterLngLat[0] = newCenter[0];
            this.editCenterLngLat[1] = newCenter[1];
        } else {
            this.currentCenterLngLat[0] = newCenter[0];
            this.currentCenterLngLat[1] = newCenter[1];
        }
        this.updateCircle();
        this.animate();
    }

    /** @return Current center `[lng, lat]` coordinates. */
    public get center(): [number, number] {
        return this.centerDragActive ? this.editCenterLngLat : this.currentCenterLngLat;
    }

    /** @param newRadius Meter radius. */
    public set radius(newRadius: number) {
        if (this.radiusDragActive) {
            this.editRadius = Math.min(Math.max(this.options.minRadius, newRadius), this.options.maxRadius);
        } else {
            this.currentRadius = Math.min(Math.max(this.options.minRadius, newRadius), this.options.maxRadius);
        }
        this.updateCircle();
        this.animate();
    }

    /** @return Current circle radius. */
    public get radius(): number {
        return this.radiusDragActive ? this.editRadius : this.currentRadius;
    }

    /** @param zoom New zoom level. */
    private setZoom(zoom: number) {
        this.zoom = zoom;
        if (this.options.refineStroke) {
            this.updateCircle();
            this.animate();
        }
    }

    /**
     * @return Globally unique instance ID.
     */
    private get instanceId(): number {
        if (this.instance === undefined) {
            this.instance = MapboxCircleMonostate.instanceIdCounter++;
        }
        return this.instance;
    }

    /**
     * @return Unique circle source ID.
     */
    private get circleSourceId(): string {
        return 'circle-source-' + this.instanceId;
    }

    /**
     * @return Unique circle center handle source ID.
     */
    private get circleCenterHandleSourceId(): string {
        return 'circle-center-handle-source-' + this.instanceId;
    }

    /**
     * @return Unique radius handles source ID.
     */
    private get circleRadiusHandlesSourceId(): string {
        return 'circle-radius-handles-source-' + this.instanceId;
    }

    /**
     * @return Unique circle line-stroke ID.
     */
    private get circleStrokeId(): string {
        return 'circle-stroke-' + this.instanceId;
    }

    /**
     * @return Unique circle fill ID.
     */
    private get circleFillId(): string {
        return 'circle-fill-' + this.instanceId;
    }

    /**
     * @return Unique ID for center handle stroke.
     */
    private get circleCenterHandleStrokeId(): string {
        return 'circle-center-handle-stroke-' + this.instanceId;
    }

    /**
     * @return Unique ID for radius handles stroke.
     */
    private get circleRadiusHandlesStrokeId(): string {
        return 'circle-radius-handles-stroke-' + this.instanceId;
    }

    /**
     * @return Unique circle center handle ID.
     */
    private get circleCenterHandleId(): string {
        return 'circle-center-handle-' + this.instanceId;
    }

    /**
     * @return Unique circle radius handles' ID.
     */
    private get circleRadiusHandlesId(): string {
        return 'circle-radius-handles-' + this.instanceId;
    }

    /**
     * Return `true` if current browser seems to be Safari.
     */
    private checkIfBrowserIsSafari(): boolean {
        return window.navigator.userAgent.indexOf('Chrome') === -1 && window.navigator.userAgent.indexOf('Safari') > -1;
    }

    /**
     * Returns the correct implementation for the mapboxgl AnySourceImpl
     */
    private parseMapSource(sourceId: string): mapboxgl.GeoJSONSource {
        if (this.map.getSource(sourceId) !== undefined) {
            if (this.map.getSource(sourceId).type === 'geojson') {
                return this.map.getSource(sourceId) as mapboxgl.GeoJSONSource;
            } else {
                throw new TypeError('Mapboxgl source not valid.');
            }
        } else {
            return undefined;
        }
    }

    /**
     * Add debounced event handler to map.
     */
    private mapOnDebounced(event: string, handler: any): void {
        let ticking = false;
        this.debouncedHandlers[handler] = args => {
            if (!ticking) {
                requestAnimationFrame(() => {
                    handler(args);
                    ticking = false;
                });
            }
            ticking = true;
        };
        this.map.on(event, this.debouncedHandlers[handler]);
    }

    /**
     * Remove debounced event handler from map.
     */
    private mapOffDebounced(event: string, handler: any): void {
        this.map.off(event, this.debouncedHandlers[handler]);
    }

    /**
     * Re-calculate/update circle polygon and handles.
     */
    private updateCircle(): void {
        const center = this.center;
        const radius = this.radius;
        const zoom = !this.zoom || this.zoom <= 0.1 ? 0.1 : this.zoom;
        const steps = this.options.refineStroke ? Math.max((Math.sqrt(Math.trunc(radius * 0.25)) * zoom) ^ 2, 64) : 64;
        const unit = 'meters';

        if (!(this.centerDragActive && radius < 10000)) {
            this.circle = turf.circle(center, radius, { steps, units: unit, properties: this.options.properties });
        }
        if (this.options.editable) {
            this.handles = [
                turf.destination(center, radius, 0, { units: unit }),
                turf.destination(center, radius, 90, { units: unit }),
                turf.destination(center, radius, 180, { units: unit }),
                turf.destination(center, radius, -90, { units: unit }),
            ];
        }

        if (this.options.debugEl) {
            this.updateCount += 1;
            this.options.debugEl.innerHTML =
                'Center: ' +
                JSON.stringify(this.getCenter()) +
                ' / Radius: ' +
                radius +
                ' / Bounds: ' +
                JSON.stringify(this.getBounds()) +
                ' / Steps: ' +
                steps +
                ' / Zoom: ' +
                zoom.toFixed(2) +
                ' / ID: ' +
                this.instanceId +
                ' / #: ' +
                this.updateCount;
        }
    }

    /**
     * Return GeoJSON for circle and handles.
     */
    private getCircleGeoJSON(): FeatureCollection<Geometry> {
        return turf.helpers.featureCollection([this.circle]) as FeatureCollection<Geometry>;
    }

    /**
     * Return GeoJSON for center handle and stroke.
     */
    private getCenterHandleGeoJSON(): FeatureCollection<Geometry> {
        let center: any;

        if (this.centerDragActive && this.radius < 10000) {
            center = turf.helpers.featureCollection([turf.helpers.point(this.center)]);
        } else {
            center = turf.helpers.featureCollection([turf.helpers.point(this.center), this.circle]);
        }

        return center as FeatureCollection<Geometry>;
    }

    /**
     * Return GeoJSON for radius handles and stroke.
     */
    private getRadiusHandlesGeoJSON(): FeatureCollection<Geometry> {
        return turf.helpers.featureCollection([...this.handles, this.circle]) as FeatureCollection<Geometry>;
    }

    /**
     * Refresh map with GeoJSON for circle/handles.
     */
    private animate(): void {
        let mapSource = this.parseMapSource(this.circleSourceId);

        if (mapSource !== undefined) {
            if (!this.centerDragActive && !this.radiusDragActive) {
                mapSource.setData(this.getCircleGeoJSON());
            }

            if (this.options.editable) {
                if (!this.radiusDragActive) {
                    mapSource = this.parseMapSource(this.circleCenterHandleSourceId);
                    mapSource.setData(this.getCenterHandleGeoJSON());
                }
                if (!this.centerDragActive) {
                    mapSource = this.parseMapSource(this.circleRadiusHandlesSourceId);
                    mapSource.setData(this.getRadiusHandlesGeoJSON());
                }
            }
        }
    }

    /**
     * Returns true if cursor point is on a center/radius edit handle.
     * @param point cursor point
     */
    private pointOnHandle(point: mapboxgl.Point): boolean {
        return !MapboxCircleMonostate.activeEditableCircles.every(circleWithHandles => {
            // noinspection JSCheckFunctionSignatures
            const handleLayersAtCursor = this.map.queryRenderedFeatures(point, {
                layers: [circleWithHandles.circleCenterHandleId, circleWithHandles.circleRadiusHandlesId],
            });
            return handleLayersAtCursor.length === 0;
        });
    }

    /**
     * Broadcast suspend event to other interactive circles, instructing them to stop listening during drag interaction.
     * @param typeOfHandle 'radius' or 'circle'.
     */
    private suspendHandleListeners(typeOfHandle: string): void {
        MapboxCircleMonostate.broadcast.emit('suspendCenterHandleListeners', this.instanceId, typeOfHandle);
        MapboxCircleMonostate.broadcast.emit('suspendRadiusHandlesListeners', this.instanceId, typeOfHandle);
        MapboxCircleMonostate.broadcast.emit('suspendCircleFillListeners', this.instanceId, typeOfHandle);
    }

    /**
     * Broadcast resume event to other editable circles, to make them to resume interactivity after a completed drag op.
     * @param typeOfHandle 'radius' or 'circle'.
     */
    private resumeHandleListeners(typeOfHandle: string): void {
        MapboxCircleMonostate.broadcast.emit('resumeCenterHandleListeners', this.instanceId, typeOfHandle);
        MapboxCircleMonostate.broadcast.emit('resumeRadiusHandlesListeners', this.instanceId, typeOfHandle);
        MapboxCircleMonostate.broadcast.emit('resumeCircleFillListeners', this.instanceId, typeOfHandle);
    }

    /**
     * Disable map panning, set cursor style and highlight handle with new fill color.
     * @param layerId map layer Id
     * @param cursor cursor to set style
     */
    private highlightHandles(layerId: string, cursor: string): void {
        this.map.dragPan.disable();
        this.map.setPaintProperty(layerId, 'circle-color', this.options.fillColor);
        this.map.getCanvas().style.cursor = cursor;
    }

    /**
     * Re-enable map panning, reset cursor icon and restore fill color to white.
     * @param  layerId map layer Id
     */
    private resetHandles(layerId: string): void {
        this.map.dragPan.enable();
        this.map.setPaintProperty(layerId, 'circle-color', '#ffffff');
        this.map.getCanvas().style.cursor = '';
    }

    /**
     * Adjust circle precision (steps used to draw the polygon).
     */
    private onZoomEnd(): void {
        this.setZoom(this.map.getZoom());
    }

    /**
     * Highlight center handle and disable panning.
     */
    private onCenterHandleMouseEnter(): void {
        this.highlightHandles(this.circleCenterHandleId, 'move');
    }

    /**
     * Stop listening to center handle events, unless it's what the circle is currently busy with.
     * @param instanceId ID of the circle instance that requested suspension.
     * @param typeOfHandle 'center' or 'radius'.
     */
    private onCenterHandleSuspendEvents(instanceId: number, typeOfHandle: string): void {
        if (instanceId !== this.instanceId || typeOfHandle === 'radius') {
            this.unbindCenterHandleListeners();
        }
    }

    /**
     * Start listening to center handle events again, unless the circle was NOT among those targeted by suspend event.
     * @param instanceId ID of the circle instance that said it's time to resume listening.
     * @param typeOfHandle 'center' or 'radius'.
     */
    private onCenterHandleResumeEvents(instanceId: number, typeOfHandle: string): void {
        if (instanceId !== this.instanceId || typeOfHandle === 'radius') {
            this.bindCenterHandleListeners();
        }
    }

    /**
     * Highlight center handle, disable panning and add mouse-move listener (emulating drag until mouse-up event).
     */
    private onCenterHandleMouseDown(): void {
        this.centerDragActive = true;
        this.mapOnDebounced('mousemove', this.onCenterHandleMouseMove);
        this.map.addLayer(this.getCenterHandleStrokeLayer(), this.circleCenterHandleId);
        this.suspendHandleListeners('center');
        this.map.once('mouseup', this.onCenterHandleMouseUpOrMapMouseOut);
        this.map.once('mouseout', this.onCenterHandleMouseUpOrMapMouseOut); // Deactivate drag if mouse leaves canvas.
        this.highlightHandles(this.circleCenterHandleId, 'move');
    }

    /**
     * Animate circle center change after onCenterHandleMouseDown triggers.
     * @param event Mouse event
     */
    private onCenterHandleMouseMove(event): void {
        const mousePoint = turf.truncate(turf.helpers.point(this.map.unproject(event.point).toArray()), {
            precision: 6,
        });
        this.center = mousePoint.geometry.coordinates as [number, number];
    }

    /**
     * Reset center handle, re-enable panning and remove listeners from onCenterHandleMouseDown.
     * @param event Mouse event
     */
    private onCenterHandleMouseUpOrMapMouseOut(event): void {
        if (event.type === 'mouseout') {
            const toMarker = event.originalEvent.toElement.classList.contains('mapboxgl-marker');
            const fromCanvas = event.originalEvent.fromElement.classList.contains('mapboxgl-canvas');

            const toCanvas = event.originalEvent.toElement.classList.contains('mapboxgl-canvas');
            const fromMarker = event.originalEvent.fromElement.classList.contains('mapboxgl-marker');

            if ((fromCanvas && toMarker) || (fromMarker && toCanvas)) {
                this.map.once('mouseout', this.onCenterHandleMouseUpOrMapMouseOut);
                return;
            }
        }

        const newCenter = this.center;
        this.centerDragActive = false;
        this.mapOffDebounced('mousemove', this.onCenterHandleMouseMove);
        switch (event.type) {
            case 'mouseup':
                this.map.off('mouseout', this.onCenterHandleMouseUpOrMapMouseOut);
                break;
            case 'mouseout':
                this.map.off('mouseup', this.onCenterHandleMouseUpOrMapMouseOut);
                break;
        }
        this.resumeHandleListeners('center');
        this.map.removeLayer(this.circleCenterHandleStrokeId);
        this.resetHandles(this.circleCenterHandleId);
        if (newCenter[0] !== this.lastCenterLngLat[0] || newCenter[1] !== this.lastCenterLngLat[1]) {
            this.center = newCenter;
            this.eventEmitter.emit('centerchanged', this);
        }
    }

    /**
     * Update lastCenterLngLat on `centerchanged` event.
     */
    private onCenterChanged(): void {
        this.lastCenterLngLat[0] = this.center[0];
        this.lastCenterLngLat[1] = this.center[1];
    }

    /**
     * Reset center handle and re-enable panning, unless actively dragging.
     */
    private onCenterHandleMouseLeave(): void {
        if (this.centerDragActive) {
            setTimeout(() => {
                if (!this.centerDragActive) {
                    this.resetHandles(this.circleCenterHandleId);
                }
            }, 125);
        } else {
            this.resetHandles(this.circleCenterHandleId);
        }
    }

    /**
     * Return vertical or horizontal resize arrow depending on if mouse is at left-right or top-bottom edit handles.
     * @param event Mouse click event
     * @return 'ew-resize' or 'ns-resize'
     */
    private getRadiusHandleCursorStyle(event: mapboxgl.MapMouseEvent): string {
        const bearing = turf.bearing(event.lngLat.toArray(), this.currentCenterLngLat, { final: true });

        if (bearing > 270 + 45 || bearing <= 45) {
            // South.
            return 'ns-resize';
        }
        if (bearing > 45 && bearing <= 90 + 45) {
            // West.
            return 'ew-resize';
        }
        if (bearing > 90 + 45 && bearing <= 180 + 45) {
            // North.
            return 'ns-resize';
        }
        if (bearing > 270 - 45 && bearing <= 270 + 45) {
            // East.
            return 'ew-resize';
        }
    }

    /**
     * Highlight radius handles and disable panning.
     * @param event Radius event
     */
    private onRadiusHandlesMouseEnter(event: mapboxgl.MapMouseEvent): void {
        this.highlightHandles(this.circleRadiusHandlesId, this.getRadiusHandleCursorStyle(event));
    }

    /**
     * Stop listening to radius handles' events, unless it's what the circle is currently busy with.
     * @param instanceId ID of the circle instance that requested suspension.
     * @param typeOfHandle 'center' or 'radius'.
     */
    private onRadiusHandlesSuspendEvents(instanceId: number, typeOfHandle: string): void {
        if (instanceId !== this.instanceId || typeOfHandle === 'center') {
            this.unbindRadiusHandlesListeners();
        }
    }

    /**
     * Start listening to radius handles' events again, unless the circle was NOT among those targeted by suspend event.
     * @param instanceId ID of the circle instance that said it's time to resume listening.
     * @param typeOfHandle 'center' or 'radius'.
     */
    private onRadiusHandlesResumeEvents(instanceId: number, typeOfHandle: string): void {
        if (instanceId !== this.instanceId || typeOfHandle === 'center') {
            this.bindRadiusHandlesListeners();
        }
    }

    /**
     * Highlight radius handles, disable panning and add mouse-move listener (emulating drag until mouse-up event).
     * @param event Radius event
     */
    private onRadiusHandlesMouseDown(event: mapboxgl.MapMouseEvent): void {
        this.radiusDragActive = true;
        this.mapOnDebounced('mousemove', this.onRadiusHandlesMouseMove);
        this.map.addLayer(this.getRadiusHandlesStrokeLayer(), this.circleRadiusHandlesId);
        this.suspendHandleListeners('radius');
        this.map.once('mouseup', this.onRadiusHandlesMouseUpOrMapMouseOut);
        this.map.once('mouseout', this.onRadiusHandlesMouseUpOrMapMouseOut); // Deactivate drag if mouse leaves canvas.
        this.highlightHandles(this.circleRadiusHandlesId, this.getRadiusHandleCursorStyle(event));
    }

    /**
     * Animate circle radius change after onRadiusHandlesMouseDown triggers.
     * @param event Radius event
     */
    private onRadiusHandlesMouseMove(event: mapboxgl.MapMouseEvent): void {
        const mousePoint = this.map.unproject(event.point).toArray();
        this.radius = Math.round(turf.distance(this.center, mousePoint, { units: 'meters' }));
    }

    /**
     * Reset radius handles, re-enable panning and remove listeners from onRadiusHandlesMouseDown.
     * @param event Radius event
     */
    private onRadiusHandlesMouseUpOrMapMouseOut(event): void {
        if (event.type === 'mouseout') {
            const toMarker = event.originalEvent.toElement.classList.contains('mapboxgl-marker');
            const fromCanvas = event.originalEvent.fromElement.classList.contains('mapboxgl-canvas');

            const toCanvas = event.originalEvent.toElement.classList.contains('mapboxgl-canvas');
            const fromMarker = event.originalEvent.fromElement.classList.contains('mapboxgl-marker');

            if ((fromCanvas && toMarker) || (fromMarker && toCanvas)) {
                this.map.once('mouseout', this.onRadiusHandlesMouseUpOrMapMouseOut); // Add back 'once' handler.
                return;
            }
        }

        const newRadius = this.radius;
        this.radiusDragActive = false;
        this.mapOffDebounced('mousemove', this.onRadiusHandlesMouseMove);
        this.map.removeLayer(this.circleRadiusHandlesStrokeId);
        switch (event.type) {
            case 'mouseup':
                this.map.off('mouseout', this.onRadiusHandlesMouseUpOrMapMouseOut);
                break;
            case 'mouseout':
                this.map.off('mouseup', this.onRadiusHandlesMouseUpOrMapMouseOut);
                break;
        }
        this.resumeHandleListeners('radius');
        this.resetHandles(this.circleRadiusHandlesId);
        if (newRadius !== this.lastRadius) {
            this.radius = newRadius;
            this.eventEmitter.emit('radiuschanged', this);
        }
    }

    /**
     * Update lastRadius on `radiuschanged` event.
     */
    private onRadiusChanged(): void {
        this.lastRadius = this.radius;
    }

    /**
     * Reset radius handles and re-enable panning, unless actively dragging.
     */
    private onRadiusHandlesMouseLeave(): void {
        if (this.radiusDragActive) {
            setTimeout(() => {
                // If dragging, wait a bit to see if it just recently stopped.
                if (!this.radiusDragActive) {
                    this.resetHandles(this.circleRadiusHandlesId);
                }
            }, 125);
        } else {
            this.resetHandles(this.circleRadiusHandlesId);
        }
    }

    /**
     * Set pointer cursor when moving over circle fill, and it's clickable.
     * @param event Mouse event
     */
    private onCircleFillMouseMove(event: mapboxgl.MapMouseEvent): void {
        if (this.eventEmitter.listeners('click').length > 0 && !this.pointOnHandle(event.point)) {
            event.target.getCanvas().style.cursor = 'pointer';
        }
    }

    /**
     * Stop listening to circle fill events.
     */
    private onCircleFillSuspendEvents(): void {
        this.unbindCircleFillListeners();
    }

    /**
     * Start listening to circle fill events again.
     */
    private onCircleFillResumeEvents(): void {
        this.bindCircleFillListeners();
    }

    /**
     * Fire 'contextmenu' event.
     * @param event Mouse event
     */
    private onCircleFillContextMenu(event: mapboxgl.MapMouseEvent): void {
        if (this.pointOnHandle(event.point)) {
            /* No click events while on a center/radius edit handle. */ return;
        }

        if (event.originalEvent.ctrlKey && this.checkIfBrowserIsSafari()) {
            // This hack comes from SPFAM-1090, aimed towards eliminating the extra 'click' event that's
            // emitted by Safari when performing a right-click by holding the ctrl button.
            this.safariContextMenuEventHackEnabled = true;
        } else {
            this.eventEmitter.emit('contextmenu', event);
        }
    }

    /**
     * Fire 'click' event.
     * @param event Circle click event
     */
    private onCircleFillClick(event): void {
        if (this.pointOnHandle(event.point)) {
            /* No click events while on a center/radius edit handle. */ return;
        }

        if (!this.safariContextMenuEventHackEnabled) {
            this.eventEmitter.emit('click', event);
        } else {
            this.eventEmitter.emit('contextmenu', event);
            this.safariContextMenuEventHackEnabled = false;
        }
    }

    /**
     * Remove pointer cursor when leaving circle fill.
     * @param event Mouse event
     */
    private onCircleFillMouseLeave(event: mapboxgl.MapMouseEvent): void {
        if (this.eventEmitter.listeners('click').length > 0 && !this.pointOnHandle(event.point)) {
            event.target.getCanvas().style.cursor = '';
        }
    }

    /**
     * When map style is changed, remove circle assets from map and add it back on next MapboxGL 'styledata' event.
     * @param  event Map event
     */
    private onMapStyleDataLoading(event: mapboxgl.MapDataEvent): void {
        if (this.map) {
            this.map.once('styledata', () => {
                // noinspection JSUnresolvedVariable
                this.addTo(event.target, undefined);
            });
            this.remove();
        }
    }

    /**
     * Add all static listeners for center handle.
     */
    private bindCenterHandleListeners(): void {
        const layerId = this.circleCenterHandleId;
        this.map.on('mouseenter', layerId, this.onCenterHandleMouseEnter);
        this.map.on('mousedown', layerId, this.onCenterHandleMouseDown);
        this.map.on('mouseleave', layerId, this.onCenterHandleMouseLeave);
    }

    /**
     * Remove all static listeners for center handle.
     */
    private unbindCenterHandleListeners(): void {
        const layerId = this.circleCenterHandleId;
        this.map.off('mouseenter', layerId, this.onCenterHandleMouseEnter);
        this.map.off('mousedown', layerId, this.onCenterHandleMouseDown);
        this.map.off('mouseleave', layerId, this.onCenterHandleMouseLeave);
    }

    /**
     * Add all static listeners for radius handles.
     */
    private bindRadiusHandlesListeners(): void {
        const layerId = this.circleRadiusHandlesId;
        this.map.on('mouseenter', layerId, this.onRadiusHandlesMouseEnter);
        this.map.on('mousedown', layerId, this.onRadiusHandlesMouseDown);
        this.map.on('mouseleave', layerId, this.onRadiusHandlesMouseLeave);
    }

    /**
     * Remove all static listeners for radius handles.
     */
    private unbindRadiusHandlesListeners(): void {
        const layerId = this.circleRadiusHandlesId;
        this.map.off('mouseenter', layerId, this.onRadiusHandlesMouseEnter);
        this.map.off('mousedown', layerId, this.onRadiusHandlesMouseDown);
        this.map.off('mouseleave', layerId, this.onRadiusHandlesMouseLeave);
    }

    /**
     * Add all click/contextmenu listeners for circle fill layer.
     */
    private bindCircleFillListeners(): void {
        const layerId = this.circleFillId;
        this.map.on('click', layerId, this.onCircleFillClick);
        this.map.on('contextmenu', layerId, this.onCircleFillContextMenu);
        this.map.on('mousemove', layerId, this.onCircleFillMouseMove);
        this.map.on('mouseleave', layerId, this.onCircleFillMouseLeave);
    }

    /**
     * Remove all click/contextmenu listeners for circle fill.
     */
    private unbindCircleFillListeners(): void {
        const layerId = this.circleFillId;
        this.map.off('click', layerId, this.onCircleFillClick);
        this.map.off('contextmenu', layerId, this.onCircleFillContextMenu);
        this.map.off('mousemove', layerId, this.onCircleFillMouseMove);
        this.map.off('mouseleave', layerId, this.onCircleFillMouseLeave);
    }

    /**
     * Add suspend/resume listeners for `__MONOSTATE.broadcast` event emitter.
     */
    private bindBroadcastListeners(): void {
        MapboxCircleMonostate.broadcast.on('suspendCenterHandleListeners', this.onCenterHandleSuspendEvents);
        MapboxCircleMonostate.broadcast.on('resumeCenterHandleListeners', this.onCenterHandleResumeEvents);

        MapboxCircleMonostate.broadcast.on('suspendRadiusHandlesListeners', this.onRadiusHandlesSuspendEvents);
        MapboxCircleMonostate.broadcast.on('resumeRadiusHandlesListeners', this.onRadiusHandlesResumeEvents);

        MapboxCircleMonostate.broadcast.on('suspendCircleFillListeners', this.onCircleFillSuspendEvents);
        MapboxCircleMonostate.broadcast.on('resumeCircleFillListeners', this.onCircleFillResumeEvents);
    }

    /**
     * Remove suspend/resume handlers from `__MONOSTATE.broadcast` emitter.
     */
    private unbindBroadcastListeners(): void {
        MapboxCircleMonostate.broadcast.removeListener(
            'suspendCenterHandleListeners',
            this.onCenterHandleSuspendEvents,
        );
        MapboxCircleMonostate.broadcast.removeListener('resumeCenterHandleListeners', this.onCenterHandleResumeEvents);

        MapboxCircleMonostate.broadcast.removeListener(
            'suspendRadiusHandlesListeners',
            this.onRadiusHandlesSuspendEvents,
        );
        MapboxCircleMonostate.broadcast.removeListener(
            'resumeRadiusHandlesListeners',
            this.onRadiusHandlesResumeEvents,
        );

        MapboxCircleMonostate.broadcast.removeListener('suspendCircleFillListeners', this.onCircleFillSuspendEvents);
        MapboxCircleMonostate.broadcast.removeListener('resumeCircleFillListeners', this.onCircleFillResumeEvents);
    }

    /**
     * Add circle to `__MONOSTATE.activeEditableCircles` array and increase max broadcasting listeners by 1.
     * @param circleObject Mapbox circle
     */
    private addActiveEditableCircle(circleObject: MapboxCircle) {
        MapboxCircleMonostate.activeEditableCircles.push(circleObject);
        MapboxCircleMonostate.broadcast.setMaxListeners(MapboxCircleMonostate.activeEditableCircles.length);
    }

    /**
     * Remove circle from `__MONOSTATE.activeEditableCircles` array and decrease max broadcasting listeners by 1.
     * @param circleObject Mapbox circle
     */
    private removeActiveEditableCircle(circleObject: MapboxCircle) {
        MapboxCircleMonostate.activeEditableCircles.splice(
            MapboxCircleMonostate.activeEditableCircles.indexOf(circleObject),
            1,
        );
        MapboxCircleMonostate.broadcast.setMaxListeners(MapboxCircleMonostate.activeEditableCircles.length);
    }

    /**
     * @return GeoJSON map source for the circle.
     */
    private getCircleMapSource(): mapboxgl.AnySourceData {
        return {
            buffer: 1,
            data: this.getCircleGeoJSON(),
            type: 'geojson',
        };
    }

    /**
     * @return GeoJSON map source for center handle.
     */
    private getCenterHandleMapSource(): mapboxgl.AnySourceData {
        return {
            buffer: 1,
            data: this.getCenterHandleGeoJSON(),
            type: 'geojson',
        };
    }

    /**
     * @return GeoJSON map source for radius handles.
     */
    private getRadiusHandlesMapSource(): mapboxgl.AnySourceData {
        return {
            buffer: 1,
            data: this.getRadiusHandlesGeoJSON(),
            type: 'geojson',
        };
    }

    /**
     * @return Style layer for the stroke around the circle.
     */
    private getCircleStrokeLayer(): mapboxgl.Layer {
        return {
            filter: ['==', '$type', 'Polygon'],
            id: this.circleStrokeId,
            paint: {
                'line-color': this.options.strokeColor,
                'line-opacity': this.options.strokeOpacity,
                'line-width': this.options.strokeWeight,
            },
            source: this.circleSourceId,
            type: 'line',
        };
    }

    /**
     * @return Style layer for the circle fill.
     */
    private getCircleFillLayer(): mapboxgl.Layer {
        return {
            filter: ['==', '$type', 'Polygon'],
            id: this.circleFillId,
            paint: {
                'fill-color': this.options.fillColor,
                'fill-opacity': this.options.fillOpacity,
            },
            source: this.circleSourceId,
            type: 'fill',
        };
    }

    /**
     * @return Style layer for the center handle's stroke.
     */
    private getCenterHandleStrokeLayer(): mapboxgl.Layer {
        if (this.centerDragActive && this.radius < 10000) {
            // Inspired by node_modules/mapbox-gl/src/ui/control/scale_control.js:getDistance
            const y = this.map.getContainer().clientHeight / 2;
            const x = this.map.getContainer().clientWidth;
            const horizontalPixelsPerMeter =
                x /
                turf.distance(this.map.unproject([0, y]).toArray(), this.map.unproject([x, y]).toArray(), {
                    units: 'meters',
                });
            return {
                filter: ['==', '$type', 'Point'],
                id: this.circleCenterHandleStrokeId,
                paint: {
                    'circle-opacity': 0,
                    'circle-radius': horizontalPixelsPerMeter * this.radius,
                    'circle-stroke-color': this.options.strokeColor,
                    'circle-stroke-opacity': this.options.strokeOpacity * 0.5,
                    'circle-stroke-width': this.options.strokeWeight,
                },
                source: this.circleCenterHandleSourceId,
                type: 'circle',
            };
        } else {
            return {
                filter: ['==', '$type', 'Polygon'],
                id: this.circleCenterHandleStrokeId,
                paint: {
                    'line-color': this.options.strokeColor,
                    'line-opacity': this.options.strokeOpacity * 0.5,
                    'line-width': this.options.strokeWeight,
                },
                source: this.circleCenterHandleSourceId,
                type: 'line',
            };
        }
    }

    /**
     * @return Style layer for the radius handles' stroke.
     */
    private getRadiusHandlesStrokeLayer(): mapboxgl.Layer {
        return {
            filter: ['==', '$type', 'Polygon'],
            id: this.circleRadiusHandlesStrokeId,
            paint: {
                'line-color': this.options.strokeColor,
                'line-opacity': this.options.strokeOpacity * 0.5,
                'line-width': this.options.strokeWeight,
            },
            source: this.circleRadiusHandlesSourceId,
            type: 'line',
        };
    }

    /**
     * @return Default paint style for edit handles.
     */
    private getEditHandleDefaultPaintOptions(): object {
        return {
            'circle-color': '#ffffff',
            'circle-radius': 3.75,
            'circle-stroke-color': this.options.strokeColor,
            'circle-stroke-opacity': this.options.strokeOpacity,
            'circle-stroke-width': this.options.strokeWeight,
        };
    }

    /**
     * @return Style layer for the circle's center handle
     */
    private getCircleCenterHandleLayer(): mapboxgl.Layer {
        return {
            filter: ['==', '$type', 'Point'],
            id: this.circleCenterHandleId,
            paint: this.getEditHandleDefaultPaintOptions(),
            source: this.circleCenterHandleSourceId,
            type: 'circle',
        };
    }

    /**
     * @return Style layer for the circle's radius handles.
     */
    private getCircleRadiusHandlesLayer(): mapboxgl.Layer {
        return {
            filter: ['==', '$type', 'Point'],
            id: this.circleRadiusHandlesId,
            paint: this.getEditHandleDefaultPaintOptions(),
            source: this.circleRadiusHandlesSourceId,
            type: 'circle',
        };
    }
}

export abstract class MapboxCircleMonostate {
    public static instanceIdCounter = 0;
    public static activeEditableCircles = [];
    public static broadcast = new EventEmitter();
}

interface Options {
    editable?: boolean;
    strokeColor?: string;
    strokeWeight?: number;
    strokeOpacity?: number;
    fillColor?: string;
    fillOpacity?: number;
    refineStroke?: boolean;
    minRadius?: number;
    maxRadius?: number;
    properties?: JSON;
    debugEl?: any;
}
