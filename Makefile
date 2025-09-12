SHELL := /bin/bash

.PHONY: dev
dev:
	npm i
	node scripts/generate-auth-secret.mjs
	node scripts/update-stripe-webhook.mjs
	npm run dev
