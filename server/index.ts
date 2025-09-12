import chokidar from "chokidar"
import { config } from "dotenv"
import { build } from "esbuild"
import express from "express"
import fs from "fs/promises"
import path from "path"
import { log, serveStatic } from "./vite"

config({ path: ".env", quiet: true })

const app = express()
app.use(express.json({ limit: "100mb" }))
app.use(express.urlencoded({ extended: false, limit: "100mb" }))

// Shared logging middleware
app.use((req, res, next) => {
  const start = Date.now()
  const path = req.path
  let capturedJsonResponse: Record<string, any> | undefined = undefined

  const originalResJson = res.json
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson
    return originalResJson.apply(res, [bodyJson, ...args])
  }

  res.on("finish", () => {
    const duration = Date.now() - start
    if (path.startsWith("/api")) {
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`

      // Log request body if it exists
      if (req.body && Object.keys(req.body).length > 0) {
        logLine += ` :: body: ${JSON.stringify(req.body)}`
      }

      // Log query params if they exist
      if (req.query && Object.keys(req.query).length > 0) {
        logLine += ` :: query: ${JSON.stringify(req.query)}`
      }

      // Log response if it exists, trimmed to 100 chars
      if (capturedJsonResponse) {
        const responseStr = JSON.stringify(capturedJsonResponse)
        const trimmedResponse =
          responseStr.length > 100
            ? responseStr.slice(0, 100) + "…"
            : responseStr
        logLine += ` :: response: ${trimmedResponse}`
      }

      if (logLine.length > 200) {
        logLine = logLine.slice(0, 79) + "…"
      }

      log(logLine)
    }
  })

  next()
})

const backendRouter = express.Router()
app.use("/api", backendRouter)

// --------------------------------------------------
// Backend loader (hot reloads on changes)
// --------------------------------------------------
async function cleanupOldBundles() {
  try {
    const distDir = path.resolve(process.cwd(), "dist/server")
    try {
      await fs.access(distDir)
    } catch {
      return
    }

    const files = await fs.readdir(distDir)
    const bundleFiles = files.filter(
      (file) => file.startsWith("backend.dist.") && file.endsWith(".cjs")
    )

    // Keep only the 2 most recent bundles, delete the rest
    if (bundleFiles.length > 2) {
      const filesToDelete = bundleFiles
        .map((file) => ({
          name: file,
          path: path.join(distDir, file),
          timestamp: parseInt(
            file.match(/backend\.dist\.(\d+)\.cjs$/)?.[1] || "0"
          ),
        }))
        .sort((a, b) => b.timestamp - a.timestamp)
        .slice(2) // Keep 2, remove the rest

      filesToDelete.forEach(async (file) => {
        try {
          await fs.unlink(file.path)
        } catch (err) {
          // Ignore errors when deleting
        }
      })
    }
  } catch (err) {
    // Ignore cleanup errors
  }
}

async function loadBackend() {
  // Create timestamped filename to avoid caching
  const timestamp = Date.now()
  const outfile = path.resolve(
    process.cwd(),
    `dist/server/backend.dist.${timestamp}.cjs`
  )
  await build({
    entryPoints: [path.resolve(process.cwd(), "server/backend.ts")],
    bundle: true,
    platform: "node",
    format: "cjs",
    outfile,
    sourcemap: "inline",
    packages: "external",
  })

  // Import the timestamped bundle
  const backend = await import(outfile)

  if (backend.registerRoutes) {
    backendRouter.stack = [] // clear old routes
    await backend.registerRoutes(backendRouter)
  } else {
    console.error("Backend module has no registerRoutes export!")
  }

  setImmediate(() => cleanupOldBundles())
}

function logError(err: Error) {
  if (!err.stack) {
    console.error(err)
    return
  }

  const stack = err.stack
    .split("\n")
    .filter((line) => !line.includes("node_modules")) // filter out noise
    .filter((line) => !line.includes("internal")) // filter Node internals
    .join("\n")

  console.error(`Error: ${err.message}\n${stack}`)
}

// Error handler
app.use((err: any, req: any, res: any, _next: any) => {
  console.error(`Error in ${req.method} ${req.path}:`)
  logError(err)
  if (!res.headersSent)
    res.status(500).json({ message: "Internal Server Error" })
})

// --------------------------------------------------
// Main initialization function
// --------------------------------------------------
;(async () => {
  // Initial load
  await loadBackend().catch((err) => {
    console.error("Failed to build backend")
  })

  if (app.get("env") !== "development") {
  }

  const port = parseInt(process.env.PORT || "3000", 10)
  const server = app.listen(port, "0.0.0.0", () => {
    log(`🚀 Serving on http://localhost:${port}`)
  })

  if (app.get("env") !== "development") {
    // Serve static files in production
    serveStatic(app)
  } else {
    const { setupVite } = await import("./vite")
    await setupVite(app, server)
    chokidar
      .watch(["server/", "shared/"], { ignoreInitial: true })
      .on("all", (event, path) => {
        // Only reload for .ts files, but ignore server/index.ts
        if (path.endsWith(".ts") && path !== "server/index.ts") {
          loadBackend()
            .then(() => {
              console.log("🔄 Backend reloaded")
            })
            .catch(() => {
              console.error("Failed to build backend")
            })
        }
      })
  }
})()
