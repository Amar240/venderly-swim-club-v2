import { Router } from "express";
import {
  createStaff,
  deactivateStaff,
  listActivity,
  listEditActivity,
  listStaff,
  updateStaff
} from "../handlers/admin";
import {
  getWebhookEvent,
  listWebhookEvents,
  replayWebhookEventHandler
} from "../handlers/adminWebhooks";
import { adminAuth } from "../middleware/adminAuth";
import { jwtAuth } from "../middleware/jwtAuth";
import { blockDemoFeature } from "../middleware/demoFeatureGuard";

export const adminRouter = Router();

adminRouter.use(jwtAuth);
adminRouter.use(adminAuth);

adminRouter.get("/staff", blockDemoFeature, listStaff);
adminRouter.post("/staff", blockDemoFeature, createStaff);
adminRouter.patch("/staff/:id", blockDemoFeature, updateStaff);
adminRouter.delete("/staff/:id", blockDemoFeature, deactivateStaff);
adminRouter.get("/activity", listActivity);
adminRouter.get("/edits", listEditActivity);
adminRouter.get("/webhooks", listWebhookEvents);
adminRouter.get("/webhooks/:id", getWebhookEvent);
adminRouter.post("/webhooks/:id/replay", replayWebhookEventHandler);
