#!/usr/bin/env groovy

//noinspection GroovyAssignabilityCheck
pipeline {
    agent any
    stages {
        stage('Prepare') {
            steps {
                checkout scm
                sh 'npm install'
                stash includes: 'node_modules/**', name: 'node_modules'
            }
        }
        stage('ESLint') {
            steps {
                checkout scm
                unstash 'node_modules'
                sh 'npm run lint'
            }
        }
        stage('Build Standalone') {
            steps {
                checkout scm
                unstash 'node_modules'
                sh 'npm run prepare'
                archiveArtifacts 'dist/mapbox-gl-circle.min.js'
            }
        }
        stage('Build Docker') {
            steps {
                checkout scm
                sh 'docker build -t docker.smithmicro.io/mapbox-gl-circle .'
                sh 'docker save docker.smithmicro.io/mapbox-gl-circle | gzip - > mapbox-gl-circle.docker.tar.gz'
                archiveArtifacts 'mapbox-gl-circle.docker.tar.gz'
            }
        }
    }
}
