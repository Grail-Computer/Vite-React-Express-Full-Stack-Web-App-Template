import { Router } from "express"
import { asyncHandler } from "server/lib/utils"

const router = Router()

router.get(
  "",
  asyncHandler(async (_req, res) => {
    res.json({ message: "Hello, world!" })
  })
)

export default router
