import { Router } from "express";
import { goodbyeHandler, signedUpHandler, welcomeHandler } from "../handlers/memberPages";
import { authRouter } from "./auth";
import { apiV1Router } from "./apiV1";
import { membersRouter, membershipsRouter } from "./apiV1";
import { demoRouter } from "./demo";
import { demoAdminSessionRouter } from "./demoAdminSession";
import { dashboardRouter } from "./dashboard";
import { reportsRouter } from "./reports";
import { pilotAdminRouter } from "./pilotAdmin";
import { webhooksRouter } from "./webhooks";
import { HttpError } from "../middleware/errorHandler";

const healthPayload = () => ({
  status: "ok",
  data: {
    service: "venderly-swim-club-v2",
    uptime: process.uptime(),
    timestamp: new Date().toISOString()
  }
});

export const createRoutes = (appMode = process.env.APP_MODE): Router => {
  const router = Router();

  router.get("/health", (_req, res) => res.json(healthPayload()));

  if (appMode === "demo") {
    const demoApi = Router();
    demoApi.get("/health", (_req, res) => res.json(healthPayload()));
    demoApi.use("/demo", demoRouter);
    router.use("/api/v1", demoApi);
    return router;
  }

  if (appMode === "pilot") {
    const pilotApi = Router();
    pilotApi.get("/health", (_req, res) => res.json(healthPayload()));
    pilotApi.use("/demo", demoAdminSessionRouter, demoRouter);
    pilotApi.use("/auth", authRouter);
    pilotApi.use("/dashboard", dashboardRouter);
    pilotApi.use("/members", membersRouter);
    pilotApi.use("/memberships", membershipsRouter);
    pilotApi.use("/reports", reportsRouter);
    pilotApi.use("/admin", pilotAdminRouter);
    router.use("/api/v1", pilotApi);
    router.all(["/welcome", "/goodbye", "/signed-up"], (req, _res, next) => {
      next(new HttpError(404, "NOT_FOUND", `Route ${req.method} ${req.originalUrl} not found`));
    });
    return router;
  }

  router.get("/welcome", welcomeHandler);
  router.get("/goodbye", goodbyeHandler);
  router.get("/signed-up", signedUpHandler);

  router.use("/api/v1", apiV1Router);
  router.use("/webhooks", webhooksRouter);
  router.use("/auth", authRouter);
  return router;
};
