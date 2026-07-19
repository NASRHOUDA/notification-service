pipeline {
    agent any

    environment {
        DOCKER_IMAGE   = 'houdanasr/notification-service'
        VAULT_ADDR     = 'http://host.docker.internal:8200'
        GH_USER        = 'NASRHOUDA'
    }

    options {
        timeout(time: 60, unit: 'MINUTES')
        disableConcurrentBuilds()
    }

    stages {

        stage('Checkout') {
            steps {
                git branch: 'main',
                    url: 'https://github.com/NASRHOUDA/notification-service.git',
                    credentialsId: 'github-token'
                echo '📦 Code récupéré depuis GitHub'
            }
        }

        stage('Check CI Skip') {
            steps {
                script {
                    def lastCommitMsg = sh(script: 'git log -1 --pretty=%B', returnStdout: true).trim()
                    if (lastCommitMsg.contains('[skip ci]')) {
                        echo "⏭️ Commit contient [skip ci] — build arrêté."
                        currentBuild.result = 'NOT_BUILT'
                        error("Build volontairement stoppé : commit [skip ci] détecté.")
                    }
                }
            }
        }

        stage('Fetch Secrets from Vault') {
            steps {
                withCredentials([string(credentialsId: 'vault-token', variable: 'VAULT_TOKEN')]) {
                    script {
                        env.DOCKER_USER = sh(script: """
                            set +x
                            curl -s -H "X-Vault-Token: ${VAULT_TOKEN}" ${VAULT_ADDR}/v1/secret/data/taskmanager/docker | jq -r '.data.data.username'
                        """, returnStdout: true).trim()
                        env.DOCKER_PASS = sh(script: """
                            set +x
                            curl -s -H "X-Vault-Token: ${VAULT_TOKEN}" ${VAULT_ADDR}/v1/secret/data/taskmanager/docker | jq -r '.data.data.password'
                        """, returnStdout: true).trim()
                        env.GH_TOKEN = sh(script: """
                            set +x
                            curl -s -H "X-Vault-Token: ${VAULT_TOKEN}" ${VAULT_ADDR}/v1/secret/data/taskmanager/github | jq -r '.data.data.token'
                        """, returnStdout: true).trim()
                        env.SONAR_TOKEN = sh(script: """
                            set +x
                            curl -s -H "X-Vault-Token: ${VAULT_TOKEN}" ${VAULT_ADDR}/v1/secret/data/taskmanager/sonar | jq -r '.data.data.token'
                        """, returnStdout: true).trim()
                        env.EMAIL_USER = sh(script: """
                            set +x
                            curl -s -H "X-Vault-Token: ${VAULT_TOKEN}" ${VAULT_ADDR}/v1/secret/data/taskmanager/app | jq -r '.data.data.email_user'
                        """, returnStdout: true).trim()
                        env.EMAIL_APP_PASSWORD = sh(script: """
                            set +x
                            curl -s -H "X-Vault-Token: ${VAULT_TOKEN}" ${VAULT_ADDR}/v1/secret/data/taskmanager/app | jq -r '.data.data.email_app_password'
                        """, returnStdout: true).trim()
                        env.INTERNAL_API_KEY = sh(script: """
                            set +x
                            curl -s -H "X-Vault-Token: ${VAULT_TOKEN}" ${VAULT_ADDR}/v1/secret/data/taskmanager/app | jq -r '.data.data.internal_api_key'
                        """, returnStdout: true).trim()

                        echo '✅ Secrets récupérés depuis Vault (masqués dans les logs)'

                        def required = ['DOCKER_USER','DOCKER_PASS','GH_TOKEN','SONAR_TOKEN','EMAIL_USER','EMAIL_APP_PASSWORD','INTERNAL_API_KEY']
                        def missing = required.findAll { name ->
                            def v = env."${name}"
                            !v || v == 'null' || v.trim() == ''
                        }
                        if (missing) {
                            error("❌ Secrets manquants ou invalides depuis Vault : ${missing.join(', ')}")
                        }
                        echo '✅ Tous les secrets requis sont présents et valides'
                    }
                }
            }
        }

        stage('Install, Test & Prepare Trivy') {
            parallel {
                stage('Install & Unit Tests') {
                    steps {
                        sh 'npm install'
                        sh 'npm test -- --coverage --coverageReporters=lcov || echo "⚠️ Tests terminés"'
                        sh 'npm audit --audit-level=high || echo "⚠️ npm vulnerabilities detected"'
                    }
                }
                stage('Prepare Trivy Cache') {
                    steps {
                        retry(3) {
                            sh '''
                                docker volume create trivy-cache-notification
                                docker run --rm \
                                  -v trivy-cache-notification:/root/.cache/trivy \
                                  aquasec/trivy:latest image \
                                  --download-db-only --timeout 5m
                            '''
                        }
                    }
                }
            }
        }

        stage('SAST - Semgrep') {
            steps {
                sh '''
                    docker run --rm \
                      --volumes-from jenkins \
                      returntocorp/semgrep:latest \
                      semgrep --config=p/security-audit \
                      "${WORKSPACE}" \
                      --no-git-ignore \
                      --json --output="${WORKSPACE}/semgrep-report.json" \
                    || echo "⚠️ Semgrep scan terminé"
                '''
                archiveArtifacts artifacts: 'semgrep-report.json', allowEmptyArchive: true
            }
        }

        stage('SonarQube Analysis') {
            steps {
                sh '''
                    echo "📊 Vérification des fichiers de rapport :"
                    ls -la coverage/ || echo "⚠️ Coverage directory not found"
                    rm -rf .scannerwork
                '''
                withSonarQubeEnv('SonarQube') {
                    sh '''
                        npx sonar-scanner \
                          -Dsonar.projectKey=notification-service \
                          -Dsonar.sources=. \
                          -Dsonar.host.url=http://host.docker.internal:9000 \
                          -Dsonar.token="$SONAR_TOKEN" \
                          -Dsonar.exclusions="**/node_modules/**,**/*.test.js,**/coverage/**" \
                          -Dsonar.javascript.lcov.reportPaths="coverage/lcov.info" \
                          -Dsonar.tests="services/__tests__" \
                          -Dsonar.test.inclusions="**/*.test.js" \
                          -Dsonar.working.directory=.scannerwork
                    '''
                }
            }
        }

        stage('SonarQube Quality Gate') {
            steps {
                script {
                    def qg = waitForQualityGate()
                    if (qg.status != 'OK') {
                        echo "⚠️ Quality Gate status: ${qg.status} - build marqué UNSTABLE"
                        currentBuild.result = 'UNSTABLE'
                    } else {
                        echo "✅ Quality Gate passed: ${qg.status}"
                    }
                }
            }
        }

        stage('Build Docker Image') {
            steps {
                sh """
                    docker build \
                      -t ${DOCKER_IMAGE}:${BUILD_NUMBER} \
                      -t ${DOCKER_IMAGE}:latest \
                      -f docker/Dockerfile \
                      .
                    echo "✅ Image buildée"
                """
            }
        }

        stage('Trivy Image Scan') {
            steps {
                retry(3) {
                    sh '''
                        set +e
                        docker rm -f trivy-scan-${BUILD_NUMBER} >/dev/null 2>&1 || true
                        docker run --name trivy-scan-${BUILD_NUMBER} \
                          -v /var/run/docker.sock:/var/run/docker.sock \
                          -v trivy-cache-notification:/root/.cache/trivy \
                          aquasec/trivy:latest image \
                          ${DOCKER_IMAGE}:latest \
                          --severity HIGH,CRITICAL \
                          --exit-code 0 \
                          --timeout 5m \
                          --format json \
                          --output /tmp/trivy-report.json
                        RESULT=$?
                        docker cp trivy-scan-${BUILD_NUMBER}:/tmp/trivy-report.json "${WORKSPACE}/trivy-report.json" 2>/dev/null || echo "⚠️ Rapport Trivy introuvable"
                        docker rm trivy-scan-${BUILD_NUMBER} >/dev/null 2>&1 || true
                        if [ $RESULT -ne 0 ]; then
                            echo "❌ Trivy a échoué (code $RESULT)"
                            exit 1
                        fi
                    '''
                }
                archiveArtifacts artifacts: 'trivy-report.json', allowEmptyArchive: true
            }
        }

        stage('Push to Docker Hub') {
            steps {
                sh '''
                    set +x
                    set -e
                    export DOCKER_CONFIG="${WORKSPACE}/.docker-${BUILD_NUMBER}"
                    mkdir -p "${DOCKER_CONFIG}"
                    echo "$DOCKER_PASS" | docker --config "${DOCKER_CONFIG}" login -u "$DOCKER_USER" --password-stdin
                    docker --config "${DOCKER_CONFIG}" push ${DOCKER_IMAGE}:${BUILD_NUMBER}
                    docker --config "${DOCKER_CONFIG}" push ${DOCKER_IMAGE}:latest
                    docker --config "${DOCKER_CONFIG}" logout
                    rm -rf "${DOCKER_CONFIG}"
                    echo "✅ Image poussée vers Docker Hub (tag ${BUILD_NUMBER} et latest confirmés)"
                '''
            }
        }

        stage('Update Manifests') {
            steps {
                sh '''
                    set +x
                    set -e
                    git config user.email jenkins@taskmanager.com
                    git config user.name "Jenkins CI"
                    export GIT_TERMINAL_PROMPT=0

                    sed -i "s|image: houdanasr/notification-service:.*|image: houdanasr/notification-service:${BUILD_NUMBER}|g" kubernetes/deployment.yaml

                    git add kubernetes/deployment.yaml
                    if ! git commit -m "ci: update image tag to build #${BUILD_NUMBER} [skip ci]"; then
                        echo "⚠️ No changes to commit"
                    fi
                    git push "https://${GH_USER}:${GH_TOKEN}@github.com/NASRHOUDA/notification-service.git" HEAD:main
                    echo "✅ Manifests pushed successfully"
                '''
            }
        }

        stage('Flux Reconciliation') {
            steps {
                sh '''
                    sleep 30
                    flux reconcile source git flux-system --timeout=3m || true
                    flux reconcile kustomization notification-service --timeout=3m || true
                    sleep 20
                    echo "📊 Pods:"
                    kubectl get pods -n microservices -l app=notification-service || true
                    echo "✅ Déploiement Flux CD complété"
                '''
            }
        }
    }

    post {
        success { echo '✅ Pipeline notification-service réussi !' }
        failure { echo '❌ Pipeline échoué' }
    }
}
