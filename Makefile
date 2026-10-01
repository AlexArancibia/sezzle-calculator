DB_URL      := postgres://calculator:calculator@localhost:5440/calculator?sslmode=disable
TEST_DB_URL := postgres://calculator:calculator@localhost:5440/calculator_test?sslmode=disable
API_KEY     ?= local-dev-key

.PHONY: up down db backend frontend install test test-backend test-integration test-frontend coverage coverage-report

up: ## Build and run the whole stack (http://localhost:3000)
	docker compose up --build

down: ## Stop everything
	docker compose down

db: ## Start only Postgres (localhost:5440)
	docker compose up -d db

backend: ## Run the API locally on :8080 against the local database
	cd backend && DATABASE_URL="$(DB_URL)" API_KEYS="$(API_KEY)" go run ./cmd/server

frontend: ## Run the React dev server on :5173 (proxies /api to :8080)
	cd frontend && API_KEY="$(API_KEY)" npm run dev

install: ## Install dependencies for both apps
	cd backend && go mod download
	cd frontend && npm install

test: test-backend test-frontend ## Run all unit tests

test-backend:
	cd backend && go test ./... -cover

test-integration: ## Backend tests including the Postgres store (needs `make db`)
	cd backend && TEST_DATABASE_URL="$(TEST_DB_URL)" go test ./... -cover -count=1

test-frontend:
	cd frontend && npm test

coverage: ## Coverage reports: backend/coverage.html and frontend/coverage/index.html
	cd backend && TEST_DATABASE_URL="$(TEST_DB_URL)" go test ./... -count=1 -coverprofile=coverage.out && go tool cover -func=coverage.out | tail -1 && go tool cover -html=coverage.out -o coverage.html
	cd frontend && npm run coverage

coverage-report: ## Writes the text reports committed in coverage/ (needs `make db`)
	cd backend && TEST_DATABASE_URL="$(TEST_DB_URL)" go test ./... -count=1 -coverprofile=coverage.out > /dev/null && go tool cover -func=coverage.out > ../coverage/backend.txt
	cd frontend && NO_COLOR=1 FORCE_COLOR=0 npx vitest run --coverage --coverage.reporter=text > ../coverage/frontend.txt 2>&1
