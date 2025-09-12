# Stripe Management Scripts

Scripts to manage Stripe products and webhooks. All scripts automatically update your `.env` file.

## Update Stripe Products

Creates or updates Stripe products and pricing plans.

**Usage:**

```bash
node scripts/update-stripe-products.mjs
```

**What it creates:**

- Pro product with monthly pricing ($10/month)
- Automatically adds `VITE_STRIPE_PRO_MONTHLY_PLAN_ID` to `.env`

**Requirements:** `STRIPE_API_KEY` in `.env` file

## Update Stripe Webhook

Creates or updates a Stripe webhook endpoint for subscription events.

**Usage:**

```bash
node scripts/update-stripe-webhook.mjs https://your-app.com/api/webhooks/stripe
```

**What it does:**

- Creates/updates webhook with subscription and payment events
- Automatically adds `STRIPE_WEBHOOK_SECRET` to `.env`
- Auto-detects sandbox URL if no URL provided

**Requirements:** `STRIPE_API_KEY` in `.env` file

## Generate Auth Secret

Generates a random authentication secret for your application.

**Usage:**

```bash
node scripts/generate-auth-secret.mjs
```

**What it does:**

- Generates a secure random secret using `openssl`
- Automatically adds `AUTH_SECRET` to `.env`
- Skips if `AUTH_SECRET` already exists

**Requirements:** `openssl` installed (pre-installed on macOS/Linux)
