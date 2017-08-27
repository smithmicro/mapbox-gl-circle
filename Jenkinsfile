#!/usr/bin/env groovy

//noinspection GroovyAssignabilityCheck
pipeline {
    agent any
    stages {
        stage('Set BUILD_VERSION') {
            steps {
                script {

                    def getProjectVersion = { ->
                        return sh(
                                returnStdout: true,
                                script: 'echo $(node -e "console.log(require(\'./package.json\').version)")'
                        ).replace('\n', '')
                    }

                    def getBranchTypeAndName = { String fullBranchName ->

                        if (fullBranchName in ['develop', 'master']) {
                            return [fullBranchName, fullBranchName]
                        }

                        if (fullBranchName.matches(/(feature|bugfix)\/[.\d\-\w]+$/)) {
                            return [fullBranchName.split('/')[0],
                                    fullBranchName.split('/')[1].toLowerCase().replaceAll(/[^.\da-z]/, '.')]
                        }

                        if (fullBranchName.matches(/hotfix\/\d+(\.\d+){1,2}p\d+$/)) {
                            return fullBranchName.split('/') as List
                        }

                        if (fullBranchName.matches(/release\/\d+(\.\d+){1,2}([ab]\d+)?$/)) {
                            return fullBranchName.split('/') as List
                        }

                        throw new AssertionError("Enforcing Gitflow Workflow and SemVer. Ha!")
                    }

                    def getBuildVersion = { String fullBranchName, buildNumber ->
                        String projectVersion = getProjectVersion()
                        def branchTypeAndName = getBranchTypeAndName(fullBranchName)

                        switch (branchTypeAndName[0]) {
                            case 'master':
                                return projectVersion
                            case 'hotfix':
                                return "${branchTypeAndName[1]}-rc.${buildNumber}"
                            case 'develop':
                                return "${projectVersion}+develop.dev${buildNumber}"
                            case 'feature':
                                return "${projectVersion}+feature.${branchTypeAndName[1]}.dev${buildNumber}"
                            case 'bugfix':
                                return "${projectVersion}+bugfix.${branchTypeAndName[1]}.dev${buildNumber}"
                            case 'release':
                                assert branchTypeAndName[1] == projectVersion
                                return "${projectVersion}-rc.${buildNumber}"
                            default:
                                throw new AssertionError("Oops, Mats messed up! :(")
                        }
                    }

                    env.BUILD_VERSION = getBuildVersion(BRANCH_NAME as String, BUILD_NUMBER)
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
                            sh '''docker save docker.smithmicro.io/mapbox-gl-circle:$BUILD_VERSION | gzip - \
> mapbox-gl-circle-$BUILD_VERSION.docker.tar.gz'''
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
