import { Router } from "express";
import { checkPoolCapacity } from "../services/capacity";
import { jwtAuth } from "../middleware/jwtAuth";

export const dashboardRouter = Router();

dashboardRouter.use(jwtAuth);

dashboardRouter.get("/overview", async (_req, res, next) => {
  try {
    const capacity = await checkPoolCapacity();

    res.json({
      status: "ok",
      data: {
        message: "Staff dashboard overview placeholder",
        capacity
      }
    });
  } catch (error) {
    next(error);
  }
});
