#!/usr/bin/env groovy

//noinspection GroovyAssignabilityCheck
pipeline {
    agent any
    stages {
        stage('Set Build Variables') {
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

                    def getNpmTag = { String fullBranchName ->
                        switch (getBranchTypeAndName(fullBranchName)[0]) {
                            case 'master':
                                return 'latest'
                            case 'release':
                                return 'next'
                            default:
                                return ''
                        }
                    }

                    env.BUILD_VERSION = getBuildVersion(BRANCH_NAME as String, BUILD_NUMBER)
                    env.NPM_TAG = getNpmTag(BRANCH_NAME as String)
                    env.DOCKER_TAG = env.BUILD_VERSION.replace('+', '_')
                    env.DOCKER_TAG_ALIAS = env.NPM_TAG
                    env.BUILD_TYPE = env.NPM_TAG ? env.NPM_TAG : 'develop'  // latest, next or develop

                    if (env.BUILD_TYPE == 'next') {
                        sh 'npm version $BUILD_VERSION'
                    }
                }
            }
        }
        stage('Install Dependencies') {
            steps {
                stash 'pre_install_git_checkout'
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
                parallel {
                    stage('Development Bundle') {
                        steps {
                            sh 'npm run browserify'
                            archiveArtifacts "dist/mapbox-gl-circle-${BUILD_VERSION}.js"
                        }
                    }
                    stage('Production Bundle') {
                        steps {
                            sh 'npm run prepare'
                            archiveArtifacts "dist/mapbox-gl-circle-${BUILD_VERSION}.min.js"
                        }
                    }
                    stage('API Docs') {
                        steps {
                            sh 'npm run docs'
                            archiveArtifacts 'API.md'
                        }
                    }
                }
            }
        }
        stage('Publish') {
            when {
                expression { env.BUILD_TYPE in ['next', 'latest'] }
            }
            environment {
                NPM_TOKEN = credentials('mblomdahl_npm')
                DOCKER_LOGIN = credentials('docker_smithmicro_io')
            }
            //noinspection GroovyAssignabilityCheck
            parallel {
                stage('Docker Image') {
                    steps {
                        dir '_docker-build' {
                            unstash 'pre_install_git_checkout'
                            sh 'echo $(pwd)'
                            sh 'ls -lFah'
                            sh 'rm -rf node_modules'
                            sh 'docker login -u $DOCKER_LOGIN_USR -p $DOCKER_LOGIN_PSW docker.smithmicro.io'
                            sh 'docker build -t docker.smithmicro.io/mapbox-gl-circle:$DOCKER_TAG .'
                            sh 'docker save docker.smithmicro.io/mapbox-gl-circle:$DOCKER_TAG | gzip - \
> mapbox-gl-circle-$BUILD_VERSION.docker.tar.gz'
                            archiveArtifacts "mapbox-gl-circle-${BUILD_VERSION}.docker.tar.gz"

                            sh 'docker push docker.smithmicro.io/mapbox-gl-circle:$DOCKER_TAG'
                            sh 'docker tag docker.smithmicro.io/mapbox-gl-circle:$DOCKER_TAG \
docker.smithmicro.io/mapbox-gl-circle:$DOCKER_TAG_ALIAS'
                            sh 'docker push docker.smithmicro.io/mapbox-gl-circle:$DOCKER_TAG_ALIAS'
                        }
                    }
                }
                stage('NPM Package') {
                    steps {
                        sh 'echo "//registry.npmjs.org/:_authToken=$NPM_TOKEN" >> .npmrc'
                        sh 'npm publish --tag $NPM_TAG .'
                    }
                }
            }
        }
    }
    post {
        always {
            deleteDir()
        }
        success {
            echo 'Build succeeded!'
        }
        unstable {
            echo 'Build unstable :/'
        }
        failure {
            echo 'Build failed :('
        }
        changed {
            echo 'Things are different...'
        }
    }
}
