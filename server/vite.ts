import express, { type Express } from "express"
import fs from "fs"
import { type Server } from "http"
import { nanoid } from "nanoid"
import path from "path"
import {
  createLogger,
  createServer as createViteServer,
  ViteDevServer,
} from "vite"
import viteConfig from "../vite.config"

const viteLogger = createLogger()

// Keep track of the current vite server instance
let currentViteServer: ViteDevServer | null = null

export function log(message: string, source = "express") {
  const formattedTime = new Date().toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  })

  console.log(`${formattedTime} [${source}] ${message}`)
}

export async function setupVite(app: Express, server: Server) {
  // Close existing vite server if one exists
  if (currentViteServer) {
    log("Closing existing Vite server", "vite")
    await currentViteServer.close()
    currentViteServer = null
  }

  const serverOptions = {
    middlewareMode: true,
    hmr: { server },
    allowedHosts: true as const,
  }

  const vite = await createViteServer({
    ...viteConfig,
    configFile: false,
    customLogger: {
      ...viteLogger,
      error: (msg, options) => {
        // Log the error but don't crash the server
        // This allows Vite to handle errors gracefully and show them in the browser
        viteLogger.error(msg, options)
      },
    },
    server: serverOptions,
    appType: "custom",
  })

  // Store the reference to the current vite server
  currentViteServer = vite

  app.use(vite.middlewares)
  app.use("*", async (req, res, next) => {
    const url = req.originalUrl

    try {
      const clientTemplate = path.resolve(
        import.meta.dirname,
        "..",
        "client",
        "index.html"
      )

      // always reload the index.html file from disk incase it changes
      let template = await fs.promises.readFile(clientTemplate, "utf-8")
      template = template.replace(
        `src="/main.tsx"`,
        `src="/main.tsx?v=${nanoid()}"`
      )
      const page = await vite.transformIndexHtml(url, template)
      res.status(200).set({ "Content-Type": "text/html" }).end(page)
    } catch (e) {
      vite.ssrFixStacktrace(e as Error)
      next(e)
    }
  })
}

export function serveStatic(app: Express) {
  const distPath = path.resolve(import.meta.dirname, "public")

  if (!fs.existsSync(distPath)) {
    throw new Error(
      `Could not find the build directory: ${distPath}, make sure to build the client first`
    )
  }

  app.use(express.static(distPath))

  // fall through to index.html if the file doesn't exist
  app.use("*", (_req, res) => {
    res.sendFile(path.resolve(distPath, "index.html"))
  })
}
