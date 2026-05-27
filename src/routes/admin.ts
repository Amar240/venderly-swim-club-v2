import { Router } from "express";
import { jwtAuth, type StaffResponse } from "../middleware/jwtAuth";
import { HttpError } from "../middleware/errorHandler";

export const adminRouter = Router();

adminRouter.use(jwtAuth);

adminRouter.use((_req, res: StaffResponse, next) => {
  if (res.locals.staff.role !== "ADMIN") {
    next(new HttpError(403, "ADMIN_REQUIRED", "Admin role is required"));
    return;
  }

  next();
});

adminRouter.get("/operations", (_req, res) => {
  res.json({
    status: "ok",
    data: {
      message: "Admin operations placeholder",
      clubId: res.locals.staff.clubId
    }
  });
});
