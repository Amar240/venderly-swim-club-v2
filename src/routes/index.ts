import { Router } from "express";
import { adminRouter } from "./admin";
import { authRouter } from "./auth";
import { dashboardRouter } from "./dashboard";
import { webhooksRouter } from "./webhooks";

export const routes = Router();

routes.get("/health", (_req, res) => {
  res.json({
    status: "ok",
    data: {
      service: "venderly-swim-club-v2",
      uptime: process.uptime(),
      timestamp: new Date().toISOString()
    }
  });
});

routes.use("/webhooks", webhooksRouter);
routes.use("/dashboard", dashboardRouter);
routes.use("/auth", authRouter);
routes.use("/admin", adminRouter);
