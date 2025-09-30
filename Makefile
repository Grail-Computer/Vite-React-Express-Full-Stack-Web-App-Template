SHELL := /bin/bash

.PHONY: dev publish
dev:
	npm i
	node scripts/generate-auth-secret.mjs
	node scripts/update-stripe-webhook.mjs
	npm run dev

publish:
	node scripts/publish.mjs