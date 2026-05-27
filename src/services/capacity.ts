import { prisma } from "../lib/prisma";
import { HttpError } from "../middleware/errorHandler";
import type { CapacityResult } from "../types";

export const checkPoolCapacity = async (clubId: string): Promise<CapacityResult> => {
  const club = await prisma.club.findUnique({
    where: { id: clubId },
    select: {
      id: true,
      maxCapacity: true
    }
  });

  if (!club) {
    throw new HttpError(404, "CLUB_NOT_FOUND", "Club was not found");
  }

  const currentOccupancy = await prisma.checkinEvent.count({
    where: {
      clubId,
      isActive: true
    }
  });

  return {
    clubId: club.id,
    allowed: currentOccupancy < club.maxCapacity,
    currentOccupancy,
    maxCapacity: club.maxCapacity
  };
};
