# Vite + React + Express Full-Stack Web App Template - AI Agent Guide

## Project Overview

This is a comprehensive full-stack web application template providing a complete foundation for building modern web applications with authentication, database integration, real-time features, and payment processing capabilities.

## Tech Stack & Core Dependencies

### Frontend Framework & Build Tool

- Vite 5
- React 18
- TypeScript
- Wouter - Lightweight client-side routing

### Backend Framework

- Express.js
- TypeScript

### Database & ORM

- PostgreSQL - Primary database
- Prisma ORM

### Authentication (optional)

- Auth.js v5 (NextAuth) with Express adapter
- Grail Auth Provider - OIDC authentication provider providing in-built sign in with google flow
- Session Management - Server-side sessions with database storage

### State Management & Data Fetching

- TanStack Query (React Query) - Server state management
- React Hook Form - Form handling
- Zod - Schema validation

### UI & Styling

- Shadcn - Component library
- Tailwind CSS
- Lucide React - Icon library
- Framer Motion - Animation library
- Next Themes - Theme switching (dark/light mode)

**Component Reference**: See `client/reference/components-showcase.tsx` for examples of all available Shadcn UI components and their usage patterns.

### Payments & Subscriptions

- Stripe - Payment processing and subscription management
- Webhook integration for payment events

## Project Structure

```
├── client/                       # Frontend React application
│   ├── components/               # Reusable UI components
│   │   └── ui/                   # Shadcn components
│   ├── pages/                    # Page components (routed by Wouter)
│   ├── hooks/                    # Custom React hooks
│   ├── lib/                      # Client-side utilities
│   ├── App.tsx                   # Main React application
│   ├── main.tsx                  # Vite entry point
│   ├── index.html                # HTML template
│   └── index.css                 # Global styles
├── server/                       # Backend Express.js application
│   ├── routes/                   # API route handlers
│   ├── lib/                      # Server-side utilities
│   ├── index.ts                  # Express server setup
│   ├── routes.ts                 # Route registration
│   └── vite.ts                   # Vite integration for development
├── shared/                       # Shared types and utilities
│   └── types.ts                  # Common TypeScript types
├── prisma/                       # Database schema & migrations
│   └── schema.prisma             # Prisma schema definition
├── scripts/                      # Utility scripts
├── assets/                       # Static assets
├── .env                          # Environment variables
├── vite.config.ts                # Vite configuration
├── tailwind.config.ts            # Tailwind CSS configuration
├── tsconfig.json                 # TypeScript configuration
└── components.json               # Shadcn configuration
```

## Environment Variables Setup

### Core Environment Variables

- `PORT` - Server port (default: 3000)
- `DATABASE_URL` - PostgreSQL connection string
- `AUTH_SECRET` - Secret for session encryption
- `VITE_APP_URL` - Application URL for client-side

### Authentication (OIDC Provider)

- `AUTH_CLIENT_ID` - OIDC client ID
- `AUTH_CLIENT_SECRET` - OIDC client secret
- `OIDC_ISSUER_URL` - OIDC provider issuer URL
- `NEXTAUTH_URL` - NextAuth.js configuration URL

### AI Integration (Optional)

- `OPENAI_API_KEY` - OpenAI API key for AI features
- `OPENAI_BASE_URL` - Custom OpenAI API base URL

### Payment Processing (Optional)

- `STRIPE_API_KEY` - Stripe secret key
- `STRIPE_WEBHOOK_SECRET` - Stripe webhook endpoint secret
- `VITE_STRIPE_PRO_MONTHLY_PLAN_ID` - Stripe price ID for pro monthly plan

### Development Environment

- `SANDBOX_ID` - E2B sandbox identifier
- `RAILWAY_TOKEN` - Railway deployment token

## Development Workflows

### Development server

- `make dev` use this command to install dependencies, setup environment and start the development server. This runs automatically on startup.
- It supports HMR for react client and server reload for server and shared folder.
- To reload the server, stop the running server and run `make dev` command again.

### Prisma workflow

**Production migration workflow:**  
After updating your Prisma schema, follow these steps to safely apply changes in production:

- `npx prisma generate` - Generate Prisma client
- `npx prisma migrate dev --create-only` - Create a new migration without applying to verify it
- `npx prisma migrate deploy` - apply a new migration to the database

**IMPORTANT:** The database you have access to is the production database. Run migrations with caution. AVOID DATA LOSS!

### Import alias

Import aliases are configured in `tsconfig.json` to simplify and standardize import paths throughout the project. Instead of using long relative paths, you can use the following aliases:

- `@/*` — everything under `client/`
- `@/shared/*` — everything under `shared/`
- `@/server/*` — everything under `server/`
- `@/assets/*` — everything under `assets/`

## Feature development workflow

Think through the user's query and plan the feature development based on the following steps:

- Ask questions to clarify. If it is too vague, switch to plan mode first.
- If database schema change is needed, follow the prisma workflow. If database url is not yet available, continue with the development and create migrations at the end.
- Create APIs if needed. Test them with curl command before integrating with frontend.
- Define types in `shared/` module to share between client and server.
- Frontend development
  - If home page is empty, then start development from home page. Don't leave home page empty.
  - Check if required components are available in shadcn. Reference `client/reference/components-showcase.tsx` to see all available components and their usage patterns.
  - While creating new page, don't forget to add it to the routing in `client/App.tsx`.
  - Use react query for data fetching and mutations with types from shared module.
- Check vs code diagnostics data - if new errors are introduced, fix them.

### UI Guidelines

- Make sure the UI looks good
- Make it responsive
- Use a modern color palette: A neutral background with 1-2 primary accent colors. Avoid too much gradients.

### LLM (Grail OpenAI-compatible) Integration

- Use the Grail OpenAI-compatible gateway with vendor-prefixed model IDs (e.g., `openai/gpt-5-mini`).
- For endpoint, headers, env vars, examples, and pitfalls, see `docs/openai.md`.

## Deployment

Deployment is done on railway using Railway MCP. Make sure to update the environment variables in the railway app service.

### Setting Environment Variables on Railway

After deploying to Railway, you need to configure environment variables for the app service. First, get the Railway app URL from the deployment, then set the following variables:

**Environment Variables Setup:**

1. **PORT** - `3000` (same as local)
2. **SANDBOX_ID** - Not needed
3. **DATABASE_URL** - Already set
4. **RAILWAY_TOKEN** - Not needed
5. **OPENAI_API_KEY** - Your OpenAI API key (same as local)
6. **OPENAI_BASE_URL** - Your OpenAI base URL (same as local)
7. **VITE_APP_URL** - Use your Railway app's public URL (e.g., `https://your-app.railway.app`)
8. **AUTH_SECRET** - Use the same value from your local `.env`
9. **STRIPE_API_KEY** - Your Stripe API key (same as local, or use production key) (if using stripe)
10. **STRIPE_WEBHOOK_SECRET** - Generate this by running:
    ```bash
    node scripts/update-stripe-webhook.mjs https://your-railway-app-url.railway.app --prod
    ```
    Then use the generated webhook secret value
11. **VITE_STRIPE_PRO_MONTHLY_PLAN_ID** - Your Stripe price ID (same as local) (if using stripe)
12. **AUTH_CLIENT_ID** - Your OIDC client ID (same as local)
13. **AUTH_CLIENT_SECRET** - Your OIDC client secret (same as local)
14. **OIDC_ISSUER_URL** - `https://backend.grail.computer/oidc` (same as local)
15. **NEXTAUTH_URL** - Use your Railway app's public URL (e.g., `https://your-app.railway.app`)
16. **AUTH_TRUST_HOST** - `true` (same as local)

**Important Notes:**

- Variables that depend on the app URL (VITE_APP_URL, NEXTAUTH_URL) must use the Railway app's public URL
- For Stripe webhook, run the update script with your production URL and `--prod` flag to generate the correct webhook secret
- Most other variables can use the same values as your local development environment
- Use Railway MCP commands to set these variables in the app service
