'use strict';

const turfCircle = require('@turf/circle');
// const turfLineDistance = require('@turf/line-distance');
const turfBbox = require('@turf/bbox');
const turfBboxPoly = require('@turf/bbox-polygon');
const turfTruncate = require('@turf/truncate');
const turfDestination = require('@turf/destination');
const turfHelpers = require('@turf/helpers');

function Circle(center, radius, options) {
    this.center = center; // Point geojson feature or array of [long,lat]
    this.radius = radius; // Radius of circle

    // miles, kilometers, degrees, or radians
    this.units = options.units ? options.units : 'kilometers';
    // Current zoom level detail of circle
    this.zoom = options.zoom ? options.zoom : 8;
    // JSON Object - property metadata for circle
    this.properties = options.properties ? options.properties : {};

    this.steps = 100; // Default steps

    this.circle_gj = turfCircle(
        this.center,
        this.radius,
        this.steps,
        this.units,
        this.properties
    );

    this.controlPoints = [
        turfDestination(this.center, this.radius, 0, this.units),
        turfDestination(this.center, this.radius, 90, this.units),
        turfDestination(this.center, this.radius, 180, this.units),
        turfDestination(this.center, this.radius, -90, this.units)
    ];

    this._updateCircle = function() {
        this.steps = this._calcSteps(this.zoom);

        this.circle_gj = turfCircle(
            this.center,
            this.radius,
            this.steps,
            this.units,
            this.properties
        );

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

    this.asGeojson = function() {
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
}

module.exports = exports = Circle;
