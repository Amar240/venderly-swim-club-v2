import { Router } from "express";
import { checkPoolCapacity } from "../services/capacity";
import { jwtAuth, type StaffResponse } from "../middleware/jwtAuth";

export const dashboardRouter = Router();

dashboardRouter.use(jwtAuth);

dashboardRouter.get("/overview", async (_req, res: StaffResponse, next) => {
  try {
    const capacity = await checkPoolCapacity(res.locals.staff.clubId);

    res.json({
      status: "ok",
      data: {
        message: "Staff dashboard overview placeholder",
        clubId: res.locals.staff.clubId,
        capacity
      }
    });
  } catch (error) {
    next(error);
  }
});
