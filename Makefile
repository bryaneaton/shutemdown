.PHONY: install dev build start format format-check hooks-install

install:
	npm ci

dev:
	npm run dev

build:
	npm run build

start:
	npm start

format:
	npm run format

format-check:
	npm run format:check

hooks-install:
	npm run hooks:install
