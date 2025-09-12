import runtimeErrorOverlay from "@replit/vite-plugin-runtime-error-modal"
import react from "@vitejs/plugin-react"
import path from "path"
import { defineConfig } from "vite"

// Error deduplication to prevent logging the same error multiple times
const loggedErrors = new Set<string>()
const ERROR_CACHE_TTL = 5000 // 5 seconds

function getErrorKey(error: Error): string {
  return `${error.message}:${error.stack?.split("\n")[0] || ""}`
}

export default defineConfig({
  plugins: [
    react(),
    runtimeErrorOverlay({
      filter: (error: Error) => {
        const errorKey = getErrorKey(error)
        if (loggedErrors.has(errorKey)) {
          return true
        }
        console.error("Vite Runtime Error:", error.message)
        console.error("Stack:", error.stack)
        loggedErrors.add(errorKey)
        setTimeout(() => {
          loggedErrors.delete(errorKey)
        }, ERROR_CACHE_TTL)
        return true
      },
    }),
    ...(process.env.NODE_ENV !== "production"
      ? [
          await import("@replit/vite-plugin-cartographer").then((m) =>
            m.cartographer()
          ),
        ]
      : []),
  ],
  define: {
    // Define process.env for browser compatibility with next-auth
    "process.env": {},
    "process.browser": true,
    process: {
      env: {},
      browser: true,
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "client"),
      "@/shared": path.resolve(import.meta.dirname, "shared"),
      "@/assets": path.resolve(import.meta.dirname, "assets"),
    },
  },
  root: path.resolve(import.meta.dirname, "client"),
  build: {
    outDir: path.resolve(import.meta.dirname, "dist/public"),
    emptyOutDir: true,
  },
  server: {
    fs: {
      strict: true,
      deny: ["**/.*"],
    },
  },
})
