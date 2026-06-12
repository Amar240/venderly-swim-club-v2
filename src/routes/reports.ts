import { Router } from "express";
import { getReportsSummary } from "../handlers/reports";
import { adminAuth } from "../middleware/adminAuth";
import { jwtAuth } from "../middleware/jwtAuth";

export const reportsRouter = Router();

reportsRouter.use(jwtAuth);
reportsRouter.use(adminAuth);

reportsRouter.get("/summary", getReportsSummary);
