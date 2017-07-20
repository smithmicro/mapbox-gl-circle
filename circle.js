'use strict';

const turfCircle = require('turf-circle');
const turfBbox = require('@turf/bbox');
const turfBboxPoly = require('@turf/bbox-polygon');
const turfTruncate = require('@turf/truncate');

function Circle(center, radius, steps, units, properties) {
    this.center = center; // Point geojson feature or array of [long,lat]
    this.radius = radius; // Radius of circle
    this.steps = steps; // Number of steps.  
    this.units = units; // miles, kilometers, degrees, or radians
    this.properties = properties; // JSON Object - property metadata for circle

    this.circle_gj = turfCircle(
        this.center,
        this.radius,
        this.steps,
        this.units,
        this.properties
    );

    this.asGeojson = function() {
        this.circle_gj = turfCircle(
            this.center,
            this.radius,
            this.steps,
            this.units,
            this.properties
        );
        return this.circle_gj;
    };

    this.updateCenter = function(newCenter) {
        this.center = newCenter;
    };

    this.updateRadius = function(newRadius) {
        this.radius = newRadius;
    };

    this.updateSteps = function(newSteps) {
        this.steps = newSteps;
    };

    this.updateUnits = function(newUnits) {
        this.units = newUnits;
    };

    this.getBounds = function() {
        let bboxPoly = turfTruncate(turfBboxPoly(turfBbox(this.circle_gj)), 4);
        return [
            bboxPoly.geometry.coordinates[0][0][0],
            bboxPoly.geometry.coordinates[0][0][1],
            bboxPoly.geometry.coordinates[0][2][0],
            bboxPoly.geometry.coordinates[0][2][1],
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
}

module.exports = exports = Circle;
