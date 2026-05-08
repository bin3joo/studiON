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

        stage('Deploy AI') {
            agent {
                label 'ai-server'
            }
            when {
                changeset "AI/**"
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
