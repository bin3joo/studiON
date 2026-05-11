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
                sh 'docker compose --env-file .env.prod -f compose.yaml -f compose.prod.yaml build'
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
                sh 'docker compose --env-file .env.prod -f compose.yaml -f compose.prod.yaml up -d --remove-orphans'
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
                sh 'docker compose --env-file .env.prod -f compose.yaml -f compose.prod.yaml ps'
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