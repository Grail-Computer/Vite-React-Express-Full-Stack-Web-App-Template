// import authRouter from "@/server/routes/auth"
import helloRouter from "@/server/routes/hello"
import { Router } from "express"

export async function registerRoutes(apiRouter: Router): Promise<void> {
  apiRouter.use("/hello", helloRouter)

  // Add auth router, if required (defined in @/server/routes/auth.ts)
  // apiRouter.use("/auth", authRouter)

  // Catch-all for any /api/* route that wasn't matched above
  apiRouter.use("*", (req, res) => {
    res.status(404).json({ message: "API route not found" })
  })
}
