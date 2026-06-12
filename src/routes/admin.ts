import { Router } from "express";
import {
  createStaff,
  deactivateStaff,
  listActivity,
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

export const adminRouter = Router();

adminRouter.use(jwtAuth);
adminRouter.use(adminAuth);

adminRouter.get("/staff", listStaff);
adminRouter.post("/staff", createStaff);
adminRouter.patch("/staff/:id", updateStaff);
adminRouter.delete("/staff/:id", deactivateStaff);
adminRouter.get("/activity", listActivity);
adminRouter.get("/webhooks", listWebhookEvents);
adminRouter.get("/webhooks/:id", getWebhookEvent);
adminRouter.post("/webhooks/:id/replay", replayWebhookEventHandler);
