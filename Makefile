.PHONY: setup api web build test lint demo

setup:
	uv sync --extra dev
	npm --prefix frontend install

api:
	uv run umbra-api

web:
	npm --prefix frontend run dev

build:
	npm --prefix frontend run build

test:
	uv run --extra dev pytest

lint:
	uv run --extra dev ruff check .
	npm --prefix frontend run lint

demo:
	curl -sS -X POST http://127.0.0.1:8000/api/v1/demo | python -m json.tool
