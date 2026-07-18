# Use ./node_modules/.bin tools, not whatever happens to be on PATH —
# protects against parent direnvs hijacking with the wrong version.
NPM := npm
BIN := ./node_modules/.bin

.PHONY: install hooks test test-watch test-cov lint format fix typecheck audit check build run clean push pull log web-install web-build web-test web-check vuln

install:
	$(NPM) install
	$(MAKE) hooks

hooks:
	$(BIN)/simple-git-hooks

test:
	$(NPM) run test

test-watch:
	$(NPM) run test:watch

test-cov:
	$(NPM) run test:cov

lint:
	$(NPM) run lint

format:
	$(NPM) run format

fix:
	$(NPM) run fix

typecheck:
	$(NPM) run typecheck

# audit is an alias for vuln (kept for muscle memory / CLAUDE.md). The gate is
# the OFFLINE shared scan — covers root AND web lockfiles in one pass
# (de-GitHub OPTION A; npm audit's registry call is gone from gate time).
audit: vuln

vuln:
	bash ../.github/scripts/vuln-scan.sh .

check: lint typecheck test-cov vuln

build:
	$(NPM) run build

run:
	node --import tsx src/index.ts

clean:
	rm -rf dist coverage .nyc_output *.tsbuildinfo

# --- Vendored SPA (web/) — SvelteKit source for the served web/static ---
# The built output is committed on purpose (the vsix ships it); regenerate
# with web-build whenever web/src changes, and commit source + output together.

web-install:
	cd web && $(NPM) ci

web-build:
	cd web && $(NPM) run build

web-test:
	cd web && $(NPM) run test

web-check:
	cd web && $(NPM) run check



# Append a dated entry to docs/changelog.md.
# Usage: make log MSG="what changed and why"
log:
	@if [ -z "$(MSG)" ]; then echo 'usage: make log MSG="..."'; exit 1; fi
	@printf '\n## %s\n\n%s\n' "$$(date -u +%Y-%m-%d)" "$(MSG)" >> docs/changelog.md
	@echo "appended to docs/changelog.md"

pull:
	git pull origin main

push: check
	git push origin main
