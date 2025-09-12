#!/usr/bin/env node
import { config, parse } from "dotenv"
import fs from "fs"
import os from "os"
import path from "path"
import Stripe from "stripe"

config({ quiet: true })

if (!process.env.STRIPE_API_KEY) {
  console.log("⏭️ Skipping webhook setup - no Stripe API key")
  process.exit(0)
}

const envPath = path.join(process.cwd(), ".env")

function readEnvFile() {
  if (!fs.existsSync(envPath)) {
    return {}
  }
  const envConfig = parse(fs.readFileSync(envPath, "utf8"))
  return envConfig
}

function writeEnvFile(envVars) {
  const envContent = Object.entries(envVars)
    .map(([key, value]) => `${key}=${value}`)
    .join("\n")
  fs.writeFileSync(envPath, envContent + "\n")
}

function updateEnvVariables(newVars) {
  const existingVars = readEnvFile()
  const updatedVars = { ...existingVars, ...newVars }
  writeEnvFile(updatedVars)
}

function updateWebhookSecret(secret, isProd = false) {
  if (isProd) {
    console.log(
      "🔐 Production webhook secret (set this manually in your production environment):"
    )
    console.log(`STRIPE_WEBHOOK_SECRET=${secret}`)
  } else {
    console.log("📝 Updating webhook secret in .env file...")
    updateEnvVariables({
      STRIPE_WEBHOOK_SECRET: secret,
    })
    console.log(`✅ Updated .env: STRIPE_WEBHOOK_SECRET=${secret}`)
  }
}

const stripe = new Stripe(process.env.STRIPE_API_KEY, {
  apiVersion: "2024-04-10",
})

const WEBHOOK_DESCRIPTION_SANDBOX = "Grail sandbox"
const WEBHOOK_DESCRIPTION_PROD = "Grail production"

const WEBHOOK_EVENTS = [
  "customer.subscription.created",
  "customer.subscription.updated",
  "customer.subscription.deleted",
  "invoice.payment_succeeded",
  "invoice.payment_failed",
  "checkout.session.completed",
]

async function findExistingWebhook(description) {
  try {
    const webhooks = await stripe.webhookEndpoints.list({
      limit: 100,
    })

    return webhooks.data.find((webhook) => webhook.description === description)
  } catch (error) {
    console.error("Error finding existing webhook:", error.message)
    throw error
  }
}

async function createWebhook(url, description) {
  try {
    const webhook = await stripe.webhookEndpoints.create({
      url: url,
      enabled_events: WEBHOOK_EVENTS,
      description: description,
    })

    console.log(`✅ Created new webhook: ${description} (${webhook.id})`)
    return webhook
  } catch (error) {
    console.error("Error creating webhook:", error.message)
    throw error
  }
}

async function updateWebhook(webhookId, url, description) {
  try {
    const webhook = await stripe.webhookEndpoints.update(webhookId, {
      url: url,
      enabled_events: WEBHOOK_EVENTS,
    })

    console.log(`✅ Updated existing webhook: ${description} (${webhook.id})`)
    return webhook
  } catch (error) {
    console.error("Error updating webhook:", error.message)
    throw error
  }
}

async function deleteWebhook(webhookId) {
  try {
    await stripe.webhookEndpoints.del(webhookId)
    console.log(`🗑️ Deleted existing webhook: ${webhookId}`)
  } catch (error) {
    console.error("Error deleting webhook:", error.message)
    throw error
  }
}

function getSandboxId() {
  try {
    const sandboxConfigPath = path.join(
      os.homedir(),
      ".local",
      "share",
      "sandboxConfig.json"
    )

    if (!fs.existsSync(sandboxConfigPath)) {
      return null
    }

    const configContent = fs.readFileSync(sandboxConfigPath, "utf8")
    const config = JSON.parse(configContent)

    return config.sandbox_id || null
  } catch (error) {
    console.warn("⚠️ Warning: Could not read sandbox config:", error.message)
    return null
  }
}

async function manageWebhook() {
  console.log("🚀 Starting Stripe webhook management...")

  const forceRecreate = process.argv.includes("--force-recreate")
  const isProd = process.argv.includes("--prod")

  let url = process.argv.find(
    (arg) =>
      !arg.includes("--") && arg !== process.argv[0] && arg !== process.argv[1]
  )

  if (isProd) {
    if (!url) {
      console.error("❌ URL is required when using --prod option")
      console.error(
        "Usage: node scripts/update-stripe-webhook.mjs <webhook-url> --prod [--force-recreate]"
      )
      process.exit(1)
    }
    console.log("🏭 Production mode enabled")
    console.log(`🔗 Production webhook URL: ${url}`)
  } else {
    if (!url) {
      console.log("🔍 Checking for sandbox config...")
      const sandboxId = getSandboxId()

      if (sandboxId) {
        url = `https://33000-${sandboxId}.e2b.dev/api/webhook/stripe`
        console.log(`📦 Found sandbox ID: ${sandboxId}`)
        console.log(`🔗 Webhook URL: ${url}`)
      } else {
        console.error("❌ Webhook URL is required")
        console.error(
          "Usage: node scripts/update-stripe-webhook.mjs <webhook-url> [--force-recreate] [--prod]"
        )
        process.exit(1)
      }
    }
  }

  try {
    new URL(url)
  } catch (error) {
    console.error("❌ Invalid URL format")
    process.exit(1)
  }

  const webhookDescription = isProd
    ? WEBHOOK_DESCRIPTION_PROD
    : WEBHOOK_DESCRIPTION_SANDBOX

  try {
    console.log("🔍 Checking for existing webhook...")
    const existingWebhook = await findExistingWebhook(webhookDescription)

    if (existingWebhook) {
      console.log(`📋 Found existing webhook: ${existingWebhook.id}`)

      // Check if recreation is needed upfront
      let needsRecreation = forceRecreate

      if (!isProd) {
        // For sandbox, check if secret needs recreation
        const existingVars = readEnvFile()
        const currentSecret = existingVars.STRIPE_WEBHOOK_SECRET
        needsRecreation =
          forceRecreate ||
          !currentSecret ||
          currentSecret === "undefined" ||
          !currentSecret.startsWith("whsec_")
      }

      if (needsRecreation) {
        if (forceRecreate) {
          console.log("🔄 Force recreate flag detected, recreating webhook...")
        } else {
          console.log(
            "⚠️ Invalid webhook secret detected, recreating webhook..."
          )
        }
        await deleteWebhook(existingWebhook.id)
        const newWebhook = await createWebhook(url, webhookDescription)
        updateWebhookSecret(newWebhook.secret, isProd)
      } else {
        // Only update if URL is different and secret is valid
        if (existingWebhook.url === url) {
          console.log("✨ Webhook URL is already up to date!")
        } else {
          console.log(`🔄 Updating webhook URL to ${url}...`)
          await updateWebhook(existingWebhook.id, url, webhookDescription)
        }
        if (isProd) {
          console.log(
            "ℹ️ For production, use the existing webhook secret in your production environment"
          )
          console.log(
            "💡 If you need a new secret, use --force-recreate to regenerate the webhook"
          )
        } else {
          console.log("✅ Valid webhook secret already exists")
        }
      }
    } else {
      console.log("📦 Creating new webhook...")
      const newWebhook = await createWebhook(url, webhookDescription)
      updateWebhookSecret(newWebhook.secret, isProd)
    }

    console.log("✅ Webhook setup completed successfully!")
  } catch (error) {
    console.error("❌ Failed to setup webhook:", error.message)
    process.exit(1)
  }
}

manageWebhook()
