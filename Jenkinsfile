pipeline {
    agent any

    options {
        timestamps()
        disableConcurrentBuilds()
        skipDefaultCheckout(true)
    }

    environment {
        COMPOSE_PROJECT_NAME = 'studion'
        DEPLOY_HOST = '43.203.167.41'
        DEPLOY_USER = 'ec2-user'
        DEPLOY_DIR = '/home/ec2-user/deploy/S14P31A205'
        NGINX_STUDION_DIR = '/etc/nginx/studion'
        NGINX_SITE_CONF = '/etc/nginx/conf.d/studion.conf'
    }

    stages {
        stage('Checkout') {
            steps {
                deleteDir()
                checkout scm
            }
        }

        stage('CI - Docker Check') {
            steps {
                sh '''
                    docker version
                    docker compose version
                '''
            }
        }

        stage('CI - Backend Build') {
            steps {
                dir('BE') {
                    sh './gradlew clean build'
                }
            }
        }
        
        stage('CI - Frontend Build') {
            steps {
                dir('FE') {
                    sh 'docker build --target builder -t studion-fe-ci:${BUILD_NUMBER} .'
                }
            }
        }

        // stage('CI - AI Build') {

        //     agent {
        //         label 'ai-server'
        //     }
        //     steps {
        //         sh '''
        //         cd /home/ec2-user/deploy/S14P31A205
        //         git fetch origin release
        //         git checkout release
        //         git pull --ff-only origin release
        //         docker compose --env-file .env.ai -f compose.ai.yaml build
        //         '''
        //     }
        // }
        
        stage('Prepare Env') {
            steps {
                withCredentials([file(credentialsId: 'studion-prod-env', variable: 'ENV_PROD_FILE')]) {
                    sh 'rm -f .env.prod && cp "$ENV_PROD_FILE" .env.prod && chmod 600 .env.prod'
                }
            }
        }
        
        stage('CD - Select Target') {
            steps {
                sshagent(credentials: ['studion-ec2-ssh']) {
                    script {
                        env.ACTIVE_COLOR = sh(
                            script: '''
                                ssh -o StrictHostKeyChecking=no ${DEPLOY_USER}@${DEPLOY_HOST} "cat ${NGINX_STUDION_DIR}/active-color 2>/dev/null || echo green"
                            ''',
                            returnStdout: true
                        ).trim()
                        env.TARGET_COLOR = env.ACTIVE_COLOR == 'blue' ? 'green' : 'blue'
                        env.OLD_COLOR = env.ACTIVE_COLOR == 'blue' ? 'blue' : 'green'
                        env.TARGET_BACKEND_PORT = env.TARGET_COLOR == 'blue' ? '8081' : '8082'
                    }
                }
            }
        }

        stage('CD - Sync Source') {
            steps {
                sshagent(credentials: ['studion-ec2-ssh']) {
                    sh '''
                        ssh -o StrictHostKeyChecking=no ${DEPLOY_USER}@${DEPLOY_HOST} "mkdir -p ${DEPLOY_DIR}"
                        rsync -az --delete \
                          --exclude '.git' \
                          --exclude '.env' \
                          --exclude '.env.*' \
                          --exclude 'FE/node_modules' \
                          --exclude 'BE/build' \
                          ./ ${DEPLOY_USER}@${DEPLOY_HOST}:${DEPLOY_DIR}/
                        scp .env.prod ${DEPLOY_USER}@${DEPLOY_HOST}:${DEPLOY_DIR}/.env.prod
                    '''
                }
            }
        }

        stage('CD - Build Target') {
            steps {
                sshagent(credentials: ['studion-ec2-ssh']) {
                    sh '''
                        ssh ${DEPLOY_USER}@${DEPLOY_HOST} "cd ${DEPLOY_DIR} && docker compose --env-file .env.prod -f compose.prod.yaml up -d redis mysql mongodb && for c in redis mysql mongodb; do for i in \$(seq 1 30); do [ \"\$(docker inspect -f '{{.State.Health.Status}}' \"\$c\" 2>/dev/null)\" = healthy ] && break; sleep 5; done; [ \"\$(docker inspect -f '{{.State.Health.Status}}' \"\$c\")\" = healthy ] || exit 1; done && docker compose --env-file .env.prod -f compose.${TARGET_COLOR}.yaml build"
                    '''
                }
            }
        }

        stage('CD - Deploy Target') {
            steps {
                sshagent(credentials: ['studion-ec2-ssh']) {
                    sh '''
                        ssh ${DEPLOY_USER}@${DEPLOY_HOST} "cd ${DEPLOY_DIR} && docker compose --env-file .env.prod -f compose.${TARGET_COLOR}.yaml up -d"
                    '''
                }
            }
        }

        stage('CD - Health Check') {
            steps {
                sshagent(credentials: ['studion-ec2-ssh']) {
                    sh '''
                        ssh ${DEPLOY_USER}@${DEPLOY_HOST} 'for i in $(seq 1 30); do curl -fsS http://127.0.0.1:'"${TARGET_BACKEND_PORT}"'/actuator/health | grep -q UP && exit 0; sleep 5; done; exit 1'
                    '''
                }
            }
        }

        stage('CD - Switch Nginx') {
            steps {
                sshagent(credentials: ['studion-ec2-ssh']) {
                    sh '''
                        ssh ${DEPLOY_USER}@${DEPLOY_HOST} "sudo mkdir -p ${NGINX_STUDION_DIR} && sudo cp ${DEPLOY_DIR}/INFRA/nginx/app.conf ${NGINX_SITE_CONF} && sudo cp ${DEPLOY_DIR}/INFRA/nginx/upstream-${TARGET_COLOR}.conf ${NGINX_STUDION_DIR}/upstream-active.conf && echo ${TARGET_COLOR} | sudo tee ${NGINX_STUDION_DIR}/active-color >/dev/null && sudo nginx -t && sudo systemctl reload nginx"
                    '''
                }
            }
        }

        stage('CD - Stop Old App') {
            steps {
                sshagent(credentials: ['studion-ec2-ssh']) {
                    sh '''
                        ssh ${DEPLOY_USER}@${DEPLOY_HOST} "cd ${DEPLOY_DIR} && docker compose --env-file .env.prod -f compose.${OLD_COLOR}.yaml down || true"
                    '''
                }
            }
        }
        
        // stage('CD - Deploy AI') {
        //     when {
        //         beforeAgent true
        //         branch 'release'
        //     }
        //     agent {
        //         label 'ai-server'
        //     }
        //     steps {
        //         sh '''
        //         cd /home/ec2-user/deploy/S14P31A205
        //         docker compose --env-file .env.ai -f compose.ai.yaml up -d --scale ai-worker=3
        //         docker compose --env-file .env.ai -f compose.ai.yaml ps
        //         '''
        //     }
        // }
        
        stage('CD - Status App') {
            steps {
                sshagent(credentials: ['studion-ec2-ssh']) {
                    sh '''
                        ssh ${DEPLOY_USER}@${DEPLOY_HOST} "cd ${DEPLOY_DIR} && docker compose --env-file .env.prod -f compose.prod.yaml ps && docker compose --env-file .env.prod -f compose.${TARGET_COLOR}.yaml ps"
                    '''
                }
            }
        }
    }
    post {
        always {
            sh 'rm -f .env.prod'
        }
    }
}
