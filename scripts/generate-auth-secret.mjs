#!/usr/bin/env node
import { execSync } from "child_process"
import * as dotenv from "dotenv"
import fs from "fs"
import path from "path"

// Path to .env file
const envPath = path.join(process.cwd(), ".env")

/**
 * Generate a random secret using openssl
 */
function generateSecret() {
  try {
    const secret = execSync("openssl rand -base64 33", {
      encoding: "utf8",
    }).trim()
    return secret
  } catch (error) {
    console.error("❌ Error generating secret with openssl:", error.message)
    console.error("Make sure openssl is installed on your system")
    process.exit(1)
  }
}

/**
 * Read and parse .env file using dotenv
 */
function readEnvFile() {
  if (!fs.existsSync(envPath)) {
    return {}
  }

  // Parse the .env file using dotenv
  const envConfig = dotenv.parse(fs.readFileSync(envPath, "utf8"))
  return envConfig
}

/**
 * Write environment variables to .env file
 */
function writeEnvFile(envVars) {
  const envContent = Object.entries(envVars)
    .map(([key, value]) => `${key}=${value}`)
    .join("\n")

  fs.writeFileSync(envPath, envContent + "\n")
}

/**
 * Add AUTH_SECRET to .env file
 */
function addAuthSecret() {
  // Read existing .env file
  const envVars = readEnvFile()

  // Check if AUTH_SECRET exists and is not empty (handles "", empty quotes, and undefined)
  if (envVars.AUTH_SECRET && envVars.AUTH_SECRET.trim() !== "") {
    console.log("✅ AUTH_SECRET already exists in .env file")
    console.log(`   Current value: ${envVars.AUTH_SECRET.substring(0, 10)}...`)
    return
  }

  // Generate new secret
  console.log("🔄 Generating new AUTH_SECRET...")
  const newSecret = generateSecret()

  // Add to env vars
  envVars.AUTH_SECRET = newSecret

  // Write back to .env file
  writeEnvFile(envVars)

  console.log("✅ Successfully added AUTH_SECRET to .env file")
}

addAuthSecret()
