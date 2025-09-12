import { PrismaClient } from "@prisma/client"

// Type to ensure db is only used in server-side code
export type ServerOnlyPrismaClient = PrismaClient & {
  _isServerOnly: true
}

const globalForPrisma = globalThis as unknown as {
  prisma: ServerOnlyPrismaClient | undefined
}

// Check if error is a connection/network error that might be due to database sleeping
const isConnectionError = (error: any): boolean => {
  if (!error) return false

  const errorMessage = error.message?.toLowerCase() || ""
  const errorCode = error.code

  // Common connection error patterns, especially for Railway database sleep errors
  return (
    errorMessage.includes("connection") ||
    errorMessage.includes("network") ||
    errorMessage.includes("timeout") ||
    errorMessage.includes("econnrefused") ||
    errorMessage.includes("enotfound") ||
    errorMessage.includes("etimedout") ||
    errorMessage.includes("can't reach database server") ||
    errorMessage.includes("server has gone away") ||
    errorMessage.includes("connection refused") ||
    errorMessage.includes("connection lost") ||
    errorCode === "P1001" || // Can't reach database server
    errorCode === "P1008" || // Operations timed out
    errorCode === "P1017" || // Server has closed the connection
    errorCode === "P1000" || // Authentication failed
    errorCode === "P1011" // Error opening a TLS connection
  )
}

// Retry function with exponential backoff
const retryOperation = async <T>(
  operation: () => Promise<T>,
  maxRetries: number = 3,
  baseDelay: number = 1000,
  context: string = "unknown"
): Promise<T> => {
  let lastError: any

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await operation()
    } catch (error) {
      lastError = error

      // Only retry connection errors
      if (!isConnectionError(error) || attempt === maxRetries) {
        if (attempt > 0) {
          console.error(
            `Database operation "${context}" failed after ${
              attempt + 1
            } attempts:`,
            error
          )
        }
        throw error
      }

      // Log retry attempt for debugging
      const delay = baseDelay * Math.pow(2, attempt)
      const errorMessage =
        error instanceof Error ? error.message : String(error)
      const errorCode = (error as any)?.code
      console.warn(
        `Database connection error on attempt ${attempt + 1}/${
          maxRetries + 1
        } for "${context}". Retrying in ${delay}ms...`,
        {
          error: errorMessage,
          code: errorCode,
        }
      )

      await new Promise((resolve) => setTimeout(resolve, delay))
    }
  }

  throw lastError
}

const createPrismaClient = () => {
  const client = new PrismaClient() as ServerOnlyPrismaClient
  client._isServerOnly = true

  // Add middleware to intercept ALL database operations (including those from PrismaAdapter)
  client.$use(async (params, next) => {
    const operation = params.model
      ? `${params.model}.${params.action}`
      : params.action || "unknown"

    return retryOperation(
      () => next(params),
      3, // maxRetries
      1000, // baseDelay
      operation // context for logging
    )
  })

  // Browser safety check wrapper
  return new Proxy(client, {
    get(target, prop) {
      if (typeof window !== "undefined") {
        throw new Error(
          "PrismaClient is being used in a browser environment. This is not allowed. Please use this client only in server-side code."
        )
      }

      return target[prop as keyof typeof target]
    },
  })
}

export const db = globalForPrisma.prisma ?? createPrismaClient()

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = db
}
