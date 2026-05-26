import { AttendanceAction } from "@prisma/client";
import { prisma } from "../lib/prisma";
import type { CapacityResult } from "../types";

const DEFAULT_MAX_CAPACITY = 100;

export const checkPoolCapacity = async (maxCapacity = DEFAULT_MAX_CAPACITY): Promise<CapacityResult> => {
  const checkIns = await prisma.attendanceLog.count({
    where: { action: AttendanceAction.CHECK_IN }
  });

  const signOuts = await prisma.attendanceLog.count({
    where: { action: AttendanceAction.SIGN_OUT }
  });

  const currentOccupancy = Math.max(checkIns - signOuts, 0);

  return {
    allowed: currentOccupancy < maxCapacity,
    currentOccupancy,
    maxCapacity
  };
};
