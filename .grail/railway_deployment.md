# Railway CLI deployment runbook (Dockerfile-based)

This repo is deployed to Railway via the Railway CLI using [`Dockerfile`](Dockerfile:1). The flow below is based on a successful deployment from this workspace.

## 0) Prerequisites

- Railway CLI installed (`railway --version`)
- A Railway project already exists (or you will create one)
- A valid Railway token available as `RAILWAY_TOKEN` (recommended) in [`.env`](.env)

## 1) Authenticate the Railway CLI (non-interactive)

In sandbox/CI environments, `railway login` and `railway login --browserless` may fail because they require an interactive TTY/browser.

Use a token instead:

1. Put `RAILWAY_TOKEN=...` into [`.env`](.env).
2. Load it into the current shell (Railway CLI reads env vars from the process environment, not from the file automatically):

```bash
set -a
source ./.env
set +a
```

3. Verify auth + project visibility:

```bash
railway status
```

If you see `Unauthorized`, the token is missing/invalid or wasn’t exported into the shell.

## 2) Get the correct project + service IDs

Some Railway CLI commands accept a human-readable project name, but many operations require IDs. Use JSON output to avoid ambiguity.

### 2.1 Get the project ID

```bash
railway status --json
```

Use the top-level `"id"` as your `PROJECT_ID`.

### 2.2 List services (and find the App service ID)

```bash
railway service status --all --json
```

Identify the service you want to deploy to (usually `App`) and capture its `id` as `SERVICE_ID`.

In this repo, the `App` service is the Node web service; the `Postgres` service is the database.

## 3) Ensure required environment variables are set (production)

This app expects a database + auth/base-url configuration:

- `DATABASE_URL` (Prisma; see [`server/lib/db.ts`](server/lib/db.ts:1))
- `AUTH_SECRET` (Auth.js; see [`server/routes/auth.ts`](server/routes/auth.ts:55))
- `NEXTAUTH_URL` (used to build callback URLs; see [`server/routes/auth.ts`](server/routes/auth.ts:56))
- `VITE_APP_URL` (client-side base URL)

Check existing vars:

```bash
railway variables --service "$SERVICE_ID" --environment production --json
```

Set the base URLs (replace the domain with your Railway public domain):

```bash
DOMAIN="https://<your-railway-domain>"
railway variables --service "$SERVICE_ID" --environment production --set "NEXTAUTH_URL=$DOMAIN" --skip-deploys
railway variables --service "$SERVICE_ID" --environment production --set "VITE_APP_URL=$DOMAIN" --skip-deploys
```

Ensure `AUTH_SECRET` exists (generate one if missing):

```bash
# Only set if missing:
if ! railway variables --service "$SERVICE_ID" --environment production --kv | grep -q "^AUTH_SECRET="; then
  openssl rand -base64 33 | railway variables --service "$SERVICE_ID" --environment production --set-from-stdin AUTH_SECRET --skip-deploys
fi
```

Note: `DATABASE_URL` is typically injected automatically when you connect a Railway Postgres service to the App service.

## 4) Make Docker builds reliable + safe

### 4.1 Install dependencies correctly during image build

The image build must include devDependencies for the production build step. This repo uses `vite build` + `esbuild` per [`package.json`](package.json:9).

Use `npm ci` in [`Dockerfile`](Dockerfile:12) (not a custom/invalid flag combination).

### 4.2 Never bake secrets into the Docker image

This repo’s [`Dockerfile`](Dockerfile:15) copies the whole repo into the image with `COPY . .`.

Ensure [`.dockerignore`](.dockerignore:12) excludes [`.env`](.env) and other env files so secrets aren’t copied into the build context.

## 5) Deploy using Railway CLI

Run a deploy that targets the project + service explicitly (works even if this directory is not “linked”):

```bash
railway up -p "$PROJECT_ID" -s "$SERVICE_ID" -e production --ci
```

This uploads your repo, builds via the detected [`Dockerfile`](Dockerfile:1), pushes the image to the Railway registry, and deploys it.

## 6) Monitor deployment status

```bash
railway service status --service "$SERVICE_ID" --environment production --json
```

Wait for `"status": "SUCCESS"`.

## 7) Validate the deployed app

The public domain can be found in Railway, or via variables like `RAILWAY_PUBLIC_DOMAIN` when you run:

```bash
railway variables --service "$SERVICE_ID" --environment production --kv | grep "^RAILWAY_PUBLIC_DOMAIN="
```

Then verify a known route:

```bash
curl -i "https://<your-railway-domain>/api/hello"
```

The `/api/hello` route is implemented in [`server/routes/hello.ts`](server/routes/hello.ts:1) and should return HTTP 200 with JSON.

## Troubleshooting notes (from this deployment)

- **`Unauthorized. Please login`**: your token isn’t in the process environment. Re-run the export sequence from section 1 (loading [`.env`](.env) into your shell).
- **Some commands still say `Unauthorized` even though `railway status` works**: if you’re using a project-scoped token, `railway whoami` / `railway list` may fail. Prefer `railway status --json` for IDs and deploy with explicit `-p/-s/-e` flags.
- **`railway login --browserless` fails**: some environments report `Cannot login in non-interactive mode`. Use `RAILWAY_TOKEN` instead.
- **`railway link` confusion**: `--project` expects a project ID, not the project name. Use `railway status --json` and the `"id"` field.
- **Piping/quoting issues in scripts**: prefer simple verification with `--kv` + `grep` over complex multi-line `python -c` one-liners.
