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

                        if (fullBranchName ==~ ~/(feature|bugfix)\/[.\d\-\w]+$/) {
                            String _type, _name
                            (_type, _name) = fullBranchName.split('/') as List
                            return [_type as String,
                                    _name.replaceAll(/[^.\da-zA-Z]/, '.').toLowerCase()]
                        }

                        if (fullBranchName ==~ ~/hotfix\/\d+(\.\d+){1,2}p\d+$/) {
                            return fullBranchName.split('/') as List
                        }

                        if (fullBranchName ==~ ~/release\/\d+(\.\d+){1,2}([ab]\d+)?$/) {
                            return fullBranchName.split('/') as List
                        }

                        throw new AssertionError("Enforcing Gitflow Workflow and SemVer. Ha!")
                    }

                    def getBuildVersion = { String fullBranchName, buildNumber ->
                        String branchType, branchName, projectVersion = getProjectVersion()
                        (branchType, branchName) = getBranchTypeAndName(fullBranchName)

                        switch (branchType) {
                            case 'master':
                                return projectVersion
                            case 'hotfix':
                                return "${branchName}-rc.${buildNumber}"
                            case 'develop':
                                return "${projectVersion}+develop.dev${buildNumber}"
                            case 'feature':
                                return "${projectVersion}+feature.${branchName}.dev${buildNumber}"
                            case 'bugfix':
                                return "${projectVersion}+bugfix.${branchName}.dev${buildNumber}"
                            case 'release':
                                assert branchName == projectVersion
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
