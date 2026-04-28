pipeline {
    agent any

    options {
        timestamps()
        disableConcurrentBuilds()
    }

    environment {
        COMPOSE_PROJECT_NAME = 'studion'
    }

    stages {
        stage('Checkout') {
            steps {
                checkout scm
            }
        }

        stage('Build') {
            steps {
                sh 'docker compose --env-file .env.prod -f compose.yaml -f compose.prod.yaml build'
            }
        }

        stage('Deploy') {
            steps {
                sh 'docker compose --env-file .env.prod -f compose.yaml -f compose.prod.yaml up -d --remove-orphans'
            }
        }

        stage('Status') {
            steps {
                sh 'docker compose --env-file .env.prod -f compose.yaml -f compose.prod.yaml ps'
            }
        }
    }
}
