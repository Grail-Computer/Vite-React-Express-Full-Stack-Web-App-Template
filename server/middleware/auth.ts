import { getSession } from "@auth/express"
import { NextFunction, Request, Response } from "express"
import { authConfig } from "../routes/auth"

export interface AuthenticatedRequest extends Request {
  user?: {
    id: string
    name?: string | null
    email?: string | null
    image?: string | null
  }
}

export async function requireAuth(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) {
  try {
    const session = await getSession(req, authConfig)

    if (!session || !session.user) {
      return res.status(401).json({
        error: "Authentication required",
        message: "Please sign in to access this resource",
      })
    }

    // Inject user details into request object
    req.user = {
      id: session.user.id!,
      name: session.user.name,
      email: session.user.email,
      image: session.user.image,
    }

    next()
  } catch (error) {
    console.error("Auth middleware error:", error)
    return res.status(500).json({ error: "Authentication error" })
  }
}

// Optional: Middleware that adds user info if available but doesn't require auth
export async function optionalAuth(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) {
  try {
    const session = await getSession(req, authConfig)

    if (session?.user) {
      req.user = {
        id: session.user.id!,
        name: session.user.name,
        email: session.user.email,
        image: session.user.image,
      }
    }

    next()
  } catch (error) {
    console.error("Optional auth middleware error:", error)
    next() // Continue even if auth fails
  }
}
