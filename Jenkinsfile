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

        stage('Build') {
            steps {
                sh 'docker compose --env-file .env.prod -f compose.prod.yaml build'
            }
        }

        stage('Deploy') {
            steps {
                // --force-recreate: 기존 컨테이너가 예전 환경변수 가지고 있는 문제 방지
                sh 'docker compose --env-file .env.prod -f compose.prod.yaml up -d --force-recreate --remove-orphans'
            }
        }

        stage('Status') {
            steps {
                sh 'docker compose --env-file .env.prod -f compose.prod.yaml ps'
            }
        }
    }
}
