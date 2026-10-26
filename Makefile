.PHONY: install dev build start test format format-check check ci deploy restart status logs hooks-install

install:
	npm ci

dev:
	npm run dev

build:
	npm run build

test:
	npm test

start:
	npm start

format:
	npm run format

format-check:
	npm run format:check

check: format-check test build

ci: check

deploy: install build
	sudo systemctl restart shutemdown
	sudo systemctl --no-pager --full status shutemdown

restart:
	sudo systemctl restart shutemdown

status:
	sudo systemctl --no-pager --full status shutemdown

logs:
	sudo journalctl -u shutemdown -f

hooks-install:
	npm run hooks:install
