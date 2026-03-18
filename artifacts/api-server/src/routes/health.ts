import { Router, type IRouter } from "express";
import { HealthCheckResponse } from "@workspace/api-zod";
import { cache } from "./trades";

const router: IRouter = Router();

router.get("/healthz", (_req, res) => {
  const data = HealthCheckResponse.parse({ status: "ok" });
  res.json(data);
});

router.get("/health", (_req, res) => {
  res.json({
    status: "ok",
    hasKey: true,
    source: "House Stock Watcher + Senate Stock Watcher (free)",
    cacheKeys: cache.keys().length,
    uptime: Math.floor(process.uptime()),
  });
});

export default router;
