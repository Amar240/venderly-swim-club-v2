import { Router } from "express";
import { listActivity, listEditActivity } from "../handlers/admin";
import { adminAuth } from "../middleware/adminAuth";
import { blockDemoFeature } from "../middleware/demoFeatureGuard";
import { jwtAuth } from "../middleware/jwtAuth";

export const pilotAdminRouter = Router();

pilotAdminRouter.use(jwtAuth);
pilotAdminRouter.use(adminAuth);
pilotAdminRouter.all("/staff", blockDemoFeature);
pilotAdminRouter.all("/staff/:id", blockDemoFeature);
pilotAdminRouter.get("/activity", listActivity);
pilotAdminRouter.get("/edits", listEditActivity);
