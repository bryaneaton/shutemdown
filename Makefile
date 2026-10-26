APP_PORT ?= 3000
SERVICE ?= shutemdown

.PHONY: install dev build start test format format-check check ci deploy stop restart status logs hooks-install

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

deploy: install build restart
	$(MAKE) status

stop:
	-sudo systemctl stop $(SERVICE)
	-sudo fuser -k -TERM $(APP_PORT)/tcp
	sleep 1

restart: stop
	sudo systemctl start $(SERVICE)

status:
	sudo systemctl --no-pager --full status $(SERVICE)

logs:
	sudo journalctl -u $(SERVICE) -f

hooks-install:
	npm run hooks:install
