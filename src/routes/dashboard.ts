import { Router } from "express";
import {
  getActiveCheckins,
  getDashboardSummary,
  getRecentCheckinEvents,
  manualCheckin,
  manualSignout,
  searchMembers,
  updateClubCapacity
} from "../handlers/dashboard";
import { jwtAuth } from "../middleware/jwtAuth";
import { blockDemoFeature } from "../middleware/demoFeatureGuard";

export const dashboardRouter = Router();

dashboardRouter.use(jwtAuth);

dashboardRouter.get("/summary", getDashboardSummary);
dashboardRouter.get("/active", getActiveCheckins);
dashboardRouter.get("/recent", getRecentCheckinEvents);
dashboardRouter.get("/search", searchMembers);
dashboardRouter.post("/signout/manual", manualSignout);
dashboardRouter.post("/checkin/manual", manualCheckin);
dashboardRouter.post("/capacity", blockDemoFeature, updateClubCapacity);
