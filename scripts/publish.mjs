#!/usr/bin/env node
/**
 * Deterministic no-LLM publish pipeline for Railway (Node ESM)
 * Uses project-scoped .env vars:
 *   RAILWAY_TOKEN (required)
 *   RAILWAY_PROJECT_ID, RAILWAY_ENVIRONMENT_ID (preferred; auto-discover if missing)
 *   APP_SERVICE_ID (preferred; auto-detect if missing)
 *   DATABASE_SERVICE_ID (optional; excluded from auto-detect)
 *   DATABASE_URL (optional; not used directly here)
 *
 * Exit codes:
 *   0  success
 *   10 missing prerequisites (cli/tools/env) or ambiguous discovery
 *   20 build failed
 *   30 deploy failed
 *   40 healthcheck failed
 */
import { spawn } from "child_process"
import { config, parse } from "dotenv"
import fs from "fs"
import path from "path"
import { fileURLToPath } from "url"

config({ quiet: true })

// Paths
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const ROOT_DIR = path.resolve(__dirname, "..")
const envPath = path.join(ROOT_DIR, ".env")
const RESULT_JSON = path.join(ROOT_DIR, "publish-result.json")

// --- .env helpers ---
function readEnvFile() {
  if (!fs.existsSync(envPath)) return {}
  const envConfig = parse(fs.readFileSync(envPath, "utf8"))
  return envConfig
}
function writeEnvFile(envVars) {
  const envContent = Object.entries(envVars)
    .map(([k, v]) => `${k}=${v}`)
    .join("\n")
  fs.writeFileSync(envPath, envContent + "\n")
}
function updateEnvVariables(newVars) {
  const existing = readEnvFile()
  writeEnvFile({ ...existing, ...newVars })
}

// --- log helpers ---
const C = {
  blue: (s) => `\x1b[1;34m${s}\x1b[0m`,
  red: (s) => `\x1b[1;31m${s}\x1b[0m`,
  green: (s) => `\x1b[1;32m${s}\x1b[0m`,
  gray: (s) => `\x1b[90m${s}\x1b[0m`,
}
const log = (m) => console.log(`${C.blue("[ publish ]")} ${m}`)
const dbg = (m) => console.log(`${C.gray("[ debug ]")} ${m}`)
const err = (m) => console.error(`${C.red("[ error ]")} ${m}`)
const ok = (m) => console.log(`${C.green("[  done  ]")} ${m}`)

const writeResult = (okFlag, reason = "", build_url = "", service_url = "") => {
  fs.writeFileSync(
    RESULT_JSON,
    JSON.stringify({ ok: okFlag, reason, build_url, service_url }, null, 2) +
      "\n"
  )
}

// --- system helpers ---
const which = (cmd) =>
  new Promise((resolve) => {
    const p = spawn(process.platform === "win32" ? "where" : "which", [cmd], {
      stdio: "ignore",
    })
    p.on("close", (code) => resolve(code === 0))
  })

const run = (cmd, args, opts = {}) =>
  new Promise((resolve) => {
    const child = spawn(cmd, args, {
      cwd: opts.cwd ?? ROOT_DIR,
      env: opts.env ?? process.env,
      shell: false,
    })
    let out = "",
      errOut = ""
    child.stdout.on("data", (d) => {
      const s = d.toString()
      out += s
      if (opts.tee !== false) process.stdout.write(s)
    })
    child.stderr.on("data", (d) => {
      const s = d.toString()
      errOut += s
      if (opts.tee !== false) process.stderr.write(s)
    })
    child.on("close", (code) =>
      resolve({ code: code ?? 0, stdout: out, stderr: errOut })
    )
  })

const runSilent = (cmd, args, opts = {}) =>
  run(cmd, args, { ...opts, tee: false })

// --- log parsing ---
const extractBuildUrl = (txt) => {
  const m = txt.match(
    /https:\/\/railway\.com\/project\/[A-Za-z0-9-]+\/service\/[A-Za-z0-9-]+/
  )
  return m?.[0] ?? ""
}
const extractServiceUrl = (txt) => {
  const m1 = txt.match(
    /https?:\/\/[a-z0-9.-]+\.(?:railway\.app|app\.[a-z0-9.-]+)\S*/i
  )
  if (m1?.[0]) return m1[0]
  const m2 = txt.match(/https?:\/\/[a-z0-9.-]+\.grail\.computer\S*/i)
  return m2?.[0] ?? ""
}

// --- healthcheck ---
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const healthcheck = async (url, attempts = 20, sleepMs = 3000) => {
  log(`Healthchecking: ${url}`)
  for (let i = 0; i < attempts; i++) {
    try {
      const res = await fetch(url)
      if (res.ok) return true
    } catch {}
    await sleep(sleepMs)
  }
  return false
}

// --- discovery helpers ---
async function jsonOrNull(cmd, args) {
  const out = await runSilent(cmd, args)
  if (out.code !== 0) return null
  try {
    const trimmed = out.stdout.trim()
    if (!trimmed) return null
    return JSON.parse(trimmed)
  } catch {
    return null
  }
}

async function discoverProjectEnv(projectIdFromEnv, envIdFromEnv) {
  let projectId = projectIdFromEnv || ""
  let envId = envIdFromEnv || ""

  // 1) linked context
  const statusJson = await jsonOrNull("railway", ["status", "--json"])
  if (statusJson?.projectId && !projectId) {
    projectId = statusJson.projectId
    dbg(`Using linked project: ${projectId}`)
  }
  if (statusJson?.environmentId && !envId) {
    envId = statusJson.environmentId
    dbg(`Using linked environment: ${envId}`)
  }

  // 2) single project
  if (!projectId) {
    const projJson = await jsonOrNull("railway", ["project", "list", "--json"])
    const projects = projJson?.projects || projJson?.data || []
    if (projects.length === 1) {
      projectId = projects[0].id || projects[0].projectId
      dbg(`Discovered sole project: ${projectId}`)
    } else if (projects.length > 1) {
      err("Multiple projects found. Set RAILWAY_PROJECT_ID in .env.")
      writeResult(false, "multiple_projects")
      process.exit(10)
    }
  }

  // 3) single or preferred env
  if (projectId && !envId) {
    const envJson = await jsonOrNull("railway", [
      "environment",
      "list",
      "--project",
      projectId,
      "--json",
    ])
    const envs = envJson?.environments || envJson?.data || []
    if (Array.isArray(envs) && envs.length > 0) {
      if (envs.length === 1) {
        envId = envs[0].id || envs[0].environmentId
        dbg(`Discovered sole environment: ${envId}`)
      } else {
        const prefer = ["production", "prod", "staging"]
        const preferred = envs.find((e) =>
          prefer.includes(String(e.name).toLowerCase())
        )
        if (preferred) {
          envId = preferred.id || preferred.environmentId
          dbg(`Selected preferred environment: ${preferred.name} (${envId})`)
        } else {
          err(
            "Multiple environments found. Set RAILWAY_ENVIRONMENT_ID in .env."
          )
          writeResult(false, "multiple_environments")
          process.exit(10)
        }
      }
    }
  }
  return { projectId, envId }
}

const DB_KEYWORDS = [
  "postgres",
  "postgresql",
  "mysql",
  "mariadb",
  "redis",
  "upstash",
  "dragonfly",
  "valkey",
  "mongodb",
  "mongo",
  "clickhouse",
  "kafka",
  "influx",
  "timescale",
  "neo4j",
  "elasticsearch",
  "meilisearch",
]
const isDbServiceNameOrSource = (s = "") =>
  DB_KEYWORDS.some((kw) => String(s).toLowerCase().includes(kw))

async function listServicesJSON(flags) {
  let j = await jsonOrNull("railway", ["service", "list", "--json", ...flags])
  if (j?.services) return j.services
  j = await jsonOrNull("railway", ["service", "--json", ...flags])
  if (j?.services) return j.services
  return null
}
async function listServicesFallback(flags) {
  const out = await runSilent("railway", ["service", "list", ...flags])
  const lines = out.stdout
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
  const svcs = []
  for (const line of lines) {
    if (
      /^id\b/i.test(line) ||
      /^─+$/.test(line) ||
      line.toLowerCase().includes("services")
    )
      continue
    const parts = line.split(/\s{2,}|\t| +/).filter(Boolean)
    if (parts.length >= 2) {
      const maybeId = parts[0]
      const maybeName = parts[1]
      if (/^[a-f0-9-]{16,}$/.test(maybeId)) {
        svcs.push({ id: maybeId, name: maybeName, source: line })
      }
    }
  }
  return svcs
}

async function resolveAppService({
  projectId,
  envId,
  appServiceIdFromEnv,
  dbServiceIdFromEnv,
}) {
  const flags = []
  if (projectId) flags.push(`--project=${projectId}`)
  if (envId) flags.push(`--environment=${envId}`)

  // If provided, use it directly
  if (appServiceIdFromEnv) return { id: appServiceIdFromEnv }

  // List services
  let services = await listServicesJSON(flags)
  if (!services) {
    const fallback = await listServicesFallback(flags)
    services = fallback.map((s) => ({
      id: s.id,
      name: s.name,
      source: s.source,
    }))
  }
  if (!Array.isArray(services) || services.length === 0) {
    throw new Error("no_services_found")
  }

  // If DB service id provided, exclude it explicitly
  const excludeIds = new Set([dbServiceIdFromEnv].filter(Boolean))

  const candidates = services.filter((s) => {
    const id = s.id || s.serviceId
    const name = s.name || s.serviceName || ""
    const source = s.source || ""
    if (!id) return false
    if (excludeIds.has(id)) return false
    return !isDbServiceNameOrSource(name) && !isDbServiceNameOrSource(source)
  })

  if (candidates.length === 1) return { id: candidates[0].id }

  if (candidates.length === 0) {
    throw new Error("only_database_services_found")
  }
  const names = candidates
    .map((s) => `${s.name ?? "svc"}(${String(s.id).slice(0, 8)})`)
    .join(", ")
  throw new Error(`multiple_candidate_services:${names}`)
}

// --- main flow ---
const main = async () => {
  process.chdir(ROOT_DIR)

  // prereqs
  if (!(await which("railway"))) {
    err("railway CLI not found. Install with: npm i -g @railway/cli")
    writeResult(false, "railway CLI missing")
    process.exit(10)
  }
  if (!(await which("node")) || !(await which("npm"))) {
    err("node/npm not found.")
    writeResult(false, "node/npm missing")
    process.exit(10)
  }

  const RAILWAY_TOKEN = process.env.RAILWAY_TOKEN
  if (!RAILWAY_TOKEN) {
    err("RAILWAY_TOKEN missing in .env")
    writeResult(false, "RAILWAY_TOKEN missing")
    process.exit(10)
  }

  // Prefer project-scoped env names
  let PROJECT_ID = process.env.RAILWAY_PROJECT_ID || ""
  let ENV_ID = process.env.RAILWAY_ENVIRONMENT_ID || ""

  // Discover if missing
  const { projectId, envId } = await discoverProjectEnv(PROJECT_ID, ENV_ID)
  PROJECT_ID = projectId || PROJECT_ID
  ENV_ID = envId || ENV_ID

  if (!PROJECT_ID) {
    err("Could not determine RAILWAY_PROJECT_ID. Set it in .env.")
    writeResult(false, "project_not_found")
    process.exit(10)
  }
  if (!ENV_ID) {
    err("Could not determine RAILWAY_ENVIRONMENT_ID. Set it in .env.")
    writeResult(false, "environment_not_found")
    process.exit(10)
  }

  // Resolve APP service
  let APP_SERVICE_ID = process.env.APP_SERVICE_ID || ""
  const DATABASE_SERVICE_ID = process.env.DATABASE_SERVICE_ID || ""

  try {
    ;({ id: APP_SERVICE_ID } = await resolveAppService({
      projectId: PROJECT_ID,
      envId: ENV_ID,
      appServiceIdFromEnv: APP_SERVICE_ID,
      dbServiceIdFromEnv: DATABASE_SERVICE_ID,
    }))
  } catch (e) {
    const msg = String(e?.message || e)
    if (msg === "no_services_found") {
      err("No services found in this project/environment.")
      writeResult(false, "service_not_found")
    } else if (msg === "only_database_services_found") {
      err("Only database services found; cannot auto-select an app service.")
      writeResult(false, "only_db_services")
    } else if (msg.startsWith("multiple_candidate_services:")) {
      err(
        `Multiple candidate app services: ${
          msg.split(":")[1]
        }\nSet APP_SERVICE_ID in .env.`
      )
      writeResult(false, "multiple_services")
    } else {
      err(`Service auto-detection failed: ${msg}`)
      writeResult(false, "service_autodetect_failed")
    }
    process.exit(10)
  }

  // Persist for next time (optional)
  try {
    const envNow = readEnvFile()
    const toSave = {}
    if (!envNow.RAILWAY_PROJECT_ID && PROJECT_ID)
      toSave.RAILWAY_PROJECT_ID = PROJECT_ID
    if (!envNow.RAILWAY_ENVIRONMENT_ID && ENV_ID)
      toSave.RAILWAY_ENVIRONMENT_ID = ENV_ID
    if (!envNow.APP_SERVICE_ID && APP_SERVICE_ID)
      toSave.APP_SERVICE_ID = APP_SERVICE_ID
    if (Object.keys(toSave).length) {
      updateEnvVariables(toSave)
      dbg(`Saved to .env: ${Object.keys(toSave).join(", ")}`)
    }
  } catch {}

  const HEALTHCHECK_URL = process.env.HEALTHCHECK_URL || ""

  // build
  log(
    `Project: ${PROJECT_ID} | Env: ${ENV_ID} | App Service: ${APP_SERVICE_ID}`
  )
  // log("Installing deps...");
  // const useCi = fs.existsSync(path.join(ROOT_DIR, "package-lock.json"));
  // const install = await run("npm", [useCi ? "ci" : "install", ...(useCi ? [] : ["--no-fund", "--no-audit"])]);
  // if (install.code !== 0) {
  //   err("Dependency install failed.");
  //   writeResult(false, "install failed");
  //   process.exit(20);
  // }

  // log("Running build...");
  // const build = await run("npm", ["run", "build"]);
  // if (build.code !== 0) {
  //   err("Build failed (npm run build).");
  //   writeResult(false, "build failed");
  //   process.exit(20);
  // }
  // ok("Build succeeded.");

  // deploy
  log("Deploying with Railway...")
  const env = { ...process.env, RAILWAY_TOKEN }
  const deploy = await run(
    "railway",
    [
      "up",
      "--ci",
      // `--project=${PROJECT_ID}`,
      // `--environment=${ENV_ID}`,
      `--service=${APP_SERVICE_ID}`,
    ],
    { env }
  )
  const buildUrl = extractBuildUrl(deploy.stdout)
  let serviceUrl = extractServiceUrl(deploy.stdout)
  // Fallback: use SERVICE_DOMAIN from env if we couldn't parse a service URL from logs
  if (!serviceUrl) {
    const envDomain = process.env.SERVICE_DOMAIN || ""
    if (envDomain) {
      serviceUrl = /^https?:\/\//i.test(envDomain)
        ? envDomain
        : `https://${envDomain}`
    }
  }
  if (deploy.code !== 0) {
    err(`Railway deploy failed (exit ${deploy.code}).`)
    writeResult(false, "deploy failed", buildUrl, serviceUrl)
    process.exit(30)
  }
  ok("Deploy complete.")
  log(`Build Logs: ${buildUrl || "<unknown>"}`)
  log(`Service URL: ${serviceUrl || "<unknown>"}`)

  // healthcheck
  if (HEALTHCHECK_URL) {
    const pass = await healthcheck(HEALTHCHECK_URL)
    if (!pass) {
      err(`Healthcheck failed for ${HEALTHCHECK_URL}`)
      writeResult(false, "healthcheck failed", buildUrl, serviceUrl)
      process.exit(40)
    }
    ok("Healthcheck passed.")
  }

  writeResult(true, "", buildUrl, serviceUrl)
  ok(`Publish succeeded. Result JSON at: ${RESULT_JSON}`)
  process.exit(0)
}

main().catch((e) => {
  err(e?.message || String(e))
  writeResult(false, "unexpected error")
  process.exit(30)
})
