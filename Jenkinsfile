#!/usr/bin/env groovy

def BUILD_VERSION = null

//noinspection GroovyAssignabilityCheck
pipeline {
    agent any
    stages {
        stage('Set BUILD_VERSION') {
            steps {
                script {
                    BUILD_VERSION = sh(
                            returnStdout: true,
                            script: 'echo $(node -e "console.log(require(\'./package.json\').version)")'
                    )
                    env.BUILD_VERSION = BUILD_VERSION
                }
            }
        }
        stage('Install Dependencies') {
            steps {
                sh 'npm install'
            }
        }
        stage('Run ESLint') {
            steps {
                sh 'npm run lint'
            }
        }
        stage('Build Artifacts') {
            steps {
                //noinspection GroovyAssignabilityCheck
                parallel(
                    'Development Bundle': {
                        sh 'npm run browserify'
                        archiveArtifacts "dist/mapbox-gl-circle-${BUILD_VERSION}.js"
                    },
                    'Production Bundle': {
                        sh 'npm run prepare'
                        archiveArtifacts "dist/mapbox-gl-circle-${BUILD_VERSION}.min.js"
                    },
                    'API Docs': {
                        sh 'npm run docs'
                        archiveArtifacts 'API.md'
                    }
                )
            }
        }
        stage('Publish') {
            steps {
                //noinspection GroovyAssignabilityCheck
                parallel(
                    'Docker Image': {
                        sh 'rm -rf node_modules'
                        sh 'docker build -t docker.smithmicro.io/mapbox-gl-circle:$BUILD_VERSION .'
                        sh 'docker save docker.smithmicro.io/mapbox-gl-circle:$BUILD_VERSION | gzip - > mapbox-gl-circle-$BUILD_VERSION.docker.tar.gz'
                        archiveArtifacts "mapbox-gl-circle-${BUILD_VERSION}.docker.tar.gz"
                    },
                    'NPM Package': {
                        sh 'echo "placeholder! for $BUILD_VERSION"'
                    }
                )
            }
        }
    }
}
