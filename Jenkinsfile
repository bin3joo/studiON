pipeline {
    agent any

    options {
        timestamps()
        disableConcurrentBuilds()
        skipDefaultCheckout(true)
    }

    environment {
        COMPOSE_PROJECT_NAME = 'studion'
    }

    stages {
        stage('Checkout') {
            steps {
                deleteDir()
                checkout scm
            }
        }

        stage('Prepare Env') {
            steps {
                withCredentials([file(credentialsId: 'studion-prod-env', variable: 'ENV_PROD_FILE')]) {
                    sh 'rm -f .env.prod && cp "$ENV_PROD_FILE" .env.prod && chmod 600 .env.prod'
                }
            }
        }

        stage('Build App') {
            when {
                anyOf {
                    changeset "BE/**"
                    changeset "FE/**"
                    changeset "INFRA/**"
                    changeset "compose.yaml"
                    changeset "compose.prod.yaml"
                }
            }
            steps {
                sh 'docker compose --env-file .env.prod -f compose.prod.yaml build'
            }
        }

        stage('Deploy App') {
            when {
                anyOf {
                    changeset "BE/**"
                    changeset "FE/**"
                    changeset "INFRA/**"
                    changeset "compose.yaml"
                    changeset "compose.prod.yaml"
                }
            }
            steps {
                // --force-recreate: 기존 컨테이너가 예전 환경변수 가지고 있는 문제 방지
                sh 'docker compose --env-file .env.prod -f compose.prod.yaml up -d --force-recreate --remove-orphans'
            }
        }

        stage('Status App') {
            when {
                anyOf {
                    changeset "BE/**"
                    changeset "FE/**"
                    changeset "INFRA/**"
                    changeset "compose.yaml"
                    changeset "compose.prod.yaml"
                }
            }
            steps {
                sh 'docker compose --env-file .env.prod -f compose.prod.yaml ps'
            }
        }

        stage('Deploy AI') {
            agent {
                label 'ai-server'
            }
            when {
                anyOf {
                    changeset "AI/**"
                    changeset "compose.ai.yaml"
                }
            }
            steps {
                sh '''
                cd /home/ec2-user/deploy/S14P31A205
                git pull
                docker compose -f compose.ai.yaml up -d --build --scale ai-worker=3
                docker compose -f compose.ai.yaml ps
                '''
            }
        }
    }
}