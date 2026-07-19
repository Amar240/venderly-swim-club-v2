import { Router } from "express";
import { goodbyeHandler, signedUpHandler, welcomeHandler } from "../handlers/memberPages";
import { authRouter } from "./auth";
import { apiV1Router } from "./apiV1";
import { demoRouter } from "./demo";
import { webhooksRouter } from "./webhooks";

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

  router.get("/welcome", welcomeHandler);
  router.get("/goodbye", goodbyeHandler);
  router.get("/signed-up", signedUpHandler);

  router.use("/api/v1", apiV1Router);
  router.use("/webhooks", webhooksRouter);
  router.use("/auth", authRouter);
  return router;
};

export const routes = createRoutes();
