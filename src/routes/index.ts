import { Router } from "express";
import { goodbyeHandler, signedUpHandler, welcomeHandler } from "../handlers/memberPages";
import { authRouter } from "./auth";
import { apiV1Router } from "./apiV1";
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

routes.get("/welcome", welcomeHandler);
routes.get("/goodbye", goodbyeHandler);
routes.get("/signed-up", signedUpHandler);

routes.use("/api/v1", apiV1Router);
routes.use("/webhooks", webhooksRouter);
routes.use("/auth", authRouter);
