#!/usr/bin/env node
import { config, parse } from "dotenv"
import fs from "fs"
import path from "path"
import Stripe from "stripe"

config({ quiet: true })

const envPath = path.join(process.cwd(), ".env")

if (!process.env.STRIPE_API_KEY) {
  console.log("❌ Aborting products setup - no Stripe API key")
  process.exit(1)
}

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

const stripe = new Stripe(process.env.STRIPE_API_KEY, {
  apiVersion: "2024-04-10",
})

const products = [
  {
    name: "Pro",
    id: "prod_pro",
    description: "Unlock Advanced Features",
    prices: [
      {
        nickname: "Pro Monthly",
        unit_amount: 1000, // $10.00 in cents
        currency: "usd",
        recurring: { interval: "month" },
        lookup_key: "pro_monthly",
      },
    ],
  },
  // Add more products here as needed:
  // {
  //   name: "Business",
  //   id: "prod_business",
  //   description: "For Power Users",
  //   prices: [
  //     {
  //       nickname: "Business Monthly",
  //       unit_amount: 3000, // $30.00 in cents
  //       currency: "usd",
  //       recurring: { interval: "month" },
  //       lookup_key: "business_monthly",
  //     },
  //   ],
  // },
]

async function findOrCreateProduct(productData) {
  try {
    const existingProducts = await stripe.products.list({
      limit: 100,
    })

    let product = existingProducts.data.find((p) => p.name === productData.name)

    if (product) {
      console.log(`✓ Found existing product: ${product.name} (${product.id})`)
      const updatedProduct = await stripe.products.update(product.id, {
        description: productData.description,
        active: true,
      })
      return updatedProduct
    } else {
      product = await stripe.products.create({
        name: productData.name,
        description: productData.description,
        type: "service",
      })
      console.log(`✓ Created new product: ${product.name} (${product.id})`)
      return product
    }
  } catch (error) {
    console.error(`Error handling product ${productData.name}:`, error.message)
    throw error
  }
}

async function findOrCreatePrice(productId, priceData) {
  try {
    const existingPrices = await stripe.prices.list({
      product: productId,
      active: true,
      limit: 100,
    })

    const priceByLookup = existingPrices.data.find(
      (p) => p.lookup_key === priceData.lookup_key
    )
    if (priceByLookup && priceByLookup.unit_amount === priceData.unit_amount) {
      console.log(
        `  ✓ Found existing price: ${priceData.nickname} (${priceByLookup.id})`
      )
      return priceByLookup
    }

    const priceByAmountInterval = existingPrices.data.find(
      (p) =>
        p.recurring?.interval === priceData.recurring.interval &&
        p.unit_amount === priceData.unit_amount
    )
    if (priceByAmountInterval) {
      console.log(
        `  ✓ Found existing price: ${priceData.nickname} (${priceByAmountInterval.id})`
      )
      return priceByAmountInterval
    }

    try {
      let price = await stripe.prices.create({
        product: productId,
        nickname: priceData.nickname,
        unit_amount: priceData.unit_amount,
        currency: priceData.currency,
        recurring: priceData.recurring,
        lookup_key: priceData.lookup_key,
      })
      console.log(`  ✓ Created new price: ${priceData.nickname} (${price.id})`)
      return price
    } catch (createErr) {
      const msg = createErr?.message || String(createErr)
      if (msg.includes("already uses that lookup key")) {
        const fallbackLookupKey = `${priceData.lookup_key}_${priceData.unit_amount}`
        console.warn(
          `  ⚠️ Lookup key conflict. Using fallback: ${fallbackLookupKey}`
        )
        const price = await stripe.prices.create({
          product: productId,
          nickname: priceData.nickname,
          unit_amount: priceData.unit_amount,
          currency: priceData.currency,
          recurring: priceData.recurring,
          lookup_key: fallbackLookupKey,
        })
        console.log(`  ✓ Created price with fallback lookup key: ${price.id}`)
        return price
      }
      throw createErr
    }
  } catch (error) {
    console.error(`Error handling price ${priceData.nickname}:`, error.message)
    throw error
  }
}

async function updateStripeProducts() {
  console.log("🚀 Starting Stripe products update...")

  if (!process.env.STRIPE_API_KEY) {
    console.error("❌ STRIPE_API_KEY not found in .env file")
    process.exit(0)
  }

  const priceIds = {}

  try {
    for (const productData of products) {
      console.log(`📦 Processing product: ${productData.name}`)

      const product = await findOrCreateProduct(productData)
      let monthlyPriceId = null

      for (const priceData of productData.prices) {
        const price = await findOrCreatePrice(product.id, priceData)
        const key = `${productData.name.toLowerCase()}_${
          priceData.recurring.interval
        }`
        priceIds[key] = price.id

        if (priceData.recurring.interval === "month") {
          monthlyPriceId = price.id
        }
      }

      if (monthlyPriceId) {
        await stripe.products.update(product.id, {
          default_price: monthlyPriceId,
        })
        console.log(`  ✓ Set monthly price as default for ${productData.name}`)
      }
    }

    console.log("✅ Successfully updated all Stripe products and prices!")

    const envVars = {
      VITE_STRIPE_PRO_MONTHLY_PLAN_ID: priceIds.pro_month,
    }

    console.log("📝 Updating .env file with Stripe price IDs...")
    updateEnvVariables(envVars)
    console.log(
      `✅ Updated .env: VITE_STRIPE_PRO_MONTHLY_PLAN_ID=${priceIds.pro_month}`
    )
  } catch (error) {
    console.error("❌ Failed to update Stripe products:", error.message)
    process.exit(1)
  }
}

updateStripeProducts()
