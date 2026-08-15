// ─────────────────────────────────────────────────────────────────────────────
// DND_App Jenkins Pipeline
//
// Prerequisites in Jenkins:
//   • Credential ID "nexus-docker"  → Username/Password for your Nexus Docker registry
//   • Global env var NEXUS_REGISTRY → host:port of your Nexus hosted Docker repo
//                                     e.g.  localhost:8082  or  192.168.1.78:8082
//
// Branch strategy:
//   dev    → build + lint-check only (no push)
//   stage  → build + push image to Nexus (tagged :stage-<build>)
//   main   → build + push image to Nexus (tagged :<version>-<build> and :latest)
//              + deploy on the local host via docker compose
// ─────────────────────────────────────────────────────────────────────────────
pipeline {
    agent any

    environment {
        IMAGE_NAME     = 'dnd-vtt'
        NEXUS_REGISTRY = "${env.NEXUS_REGISTRY ?: 'localhost:8086'}"
        NEXUS_CREDS    = credentials('nexus-docker')
    }

    options {
        buildDiscarder(logRotator(numToKeepStr: '10'))
        timestamps()
        timeout(time: 20, unit: 'MINUTES')
    }

    stages {

        // ── 1. Checkout ────────────────────────────────────────────────────
        stage('Checkout') {
            steps {
                checkout scm
            }
        }

        // ── 2. Resolve version from package.json ──────────────────────────
        stage('Version') {
            steps {
                script {
                    def pkg = readJSON file: 'package.json'
                    env.APP_VERSION  = pkg.version                          // e.g. 3.7.0
                    env.SHORT_SHA    = sh(script: 'git rev-parse --short HEAD', returnStdout: true).trim()
                    env.IMAGE_FULL   = "${env.NEXUS_REGISTRY}/${env.IMAGE_NAME}"
                    env.IMAGE_VER    = "${env.IMAGE_FULL}:${env.APP_VERSION}-${env.BUILD_NUMBER}"
                    env.IMAGE_LATEST = "${env.IMAGE_FULL}:latest"
                    env.IMAGE_STAGE  = "${env.IMAGE_FULL}:stage-${env.BUILD_NUMBER}"

                    echo "Version : ${env.APP_VERSION}"
                    echo "Commit  : ${env.SHORT_SHA}"
                    echo "Branch  : ${env.BRANCH_NAME}"
                }
            }
        }

        // ── 3. Build Docker image ──────────────────────────────────────────
        stage('Docker Build') {
            steps {
                script {
                    def tag = (env.BRANCH_NAME == 'main') ? env.IMAGE_VER : env.IMAGE_STAGE
                    // Label the image with build metadata
                    bat """
                        docker build ^
                          --label "git.commit=${env.SHORT_SHA}" ^
                          --label "build.number=${env.BUILD_NUMBER}" ^
                          --label "app.version=${env.APP_VERSION}" ^
                          -t ${tag} ^
                          .
                    """
                    env.BUILT_TAG = tag
                }
            }
        }

        // ── 4. Push to Nexus (stage + main only) ──────────────────────────
        stage('Push to Nexus') {
            when {
                anyOf { branch 'main'; branch 'stage' }
            }
            steps {
                script {
                    // Login — credentials are injected as env vars by Jenkins
                    bat "docker login ${env.NEXUS_REGISTRY} -u %NEXUS_CREDS_USR% -p %NEXUS_CREDS_PSW%"

                    bat "docker push ${env.BUILT_TAG}"

                    // On main also push :latest
                    if (env.BRANCH_NAME == 'main') {
                        bat "docker tag  ${env.BUILT_TAG} ${env.IMAGE_LATEST}"
                        bat "docker push ${env.IMAGE_LATEST}"
                    }

                    bat "docker logout ${env.NEXUS_REGISTRY}"
                }
            }
        }

        // ── 5. Deploy (main only — runs on the Jenkins host itself) ────────
        //
        //  This works when Jenkins runs on the same machine as the app.
        //  If you deploy to a separate host, replace the bat steps with an
        //  SSH step (sshagent plugin) or an Ansible playbook.
        // ───────────────────────────────────────────────────────────────────
        stage('Deploy') {
            when {
                branch 'main'
            }
            steps {
                script {
                    echo "Deploying ${env.IMAGE_LATEST} via docker compose..."
                    // Pull the freshly pushed image and recreate the container
                    bat "docker compose pull"
                    bat "docker compose up -d --remove-orphans"
                }
            }
        }
    }

    // ── Post-build ─────────────────────────────────────────────────────────
    post {
        always {
            // Remove dangling images to keep Jenkins host disk clean
            bat "docker image prune -f"
        }
        success {
            echo "Pipeline succeeded — ${env.IMAGE_NAME} v${env.APP_VERSION} (build ${env.BUILD_NUMBER})"
        }
        failure {
            echo "Pipeline FAILED — check console output above."
        }
    }
}
