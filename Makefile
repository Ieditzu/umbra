.PHONY: setup api web build test lint demo public

setup:
	uv sync --extra dev
	npm --prefix frontend install
	cd backend && go mod download

api:
	uv run umbra-api

web:
	npm --prefix frontend run dev

build:
	npm --prefix frontend run build
	cd backend && go build -o /tmp/umbra-public ./cmd/umbra

test:
	uv run --extra dev pytest
	cd backend && go test ./...

lint:
	uv run --extra dev ruff check .
	npm --prefix frontend run lint
	cd backend && go vet ./...

public:
	docker compose --env-file .env.public up --build -d

demo:
	curl -sS -X POST http://127.0.0.1:8000/api/v1/demo | python -m json.tool
