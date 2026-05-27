import { z } from "zod";
import { prisma } from "../lib/prisma";
import { HttpError } from "../middleware/errorHandler";

const ghlClubPayloadSchema = z
  .object({
    locationId: z.string().min(1).optional(),
    location: z
      .object({
        id: z.string().min(1).optional()
      })
      .passthrough()
      .optional()
  })
  .passthrough();

export const getGhlLocationId = (payload: unknown): string | undefined => {
  const parsedPayload = ghlClubPayloadSchema.parse(payload);
  return parsedPayload.locationId ?? parsedPayload.location?.id;
};

export const resolveClubIdFromGhlPayload = async (payload: unknown): Promise<string> => {
  const ghlLocationId = getGhlLocationId(payload);

  if (!ghlLocationId) {
    throw new HttpError(422, "CLUB_NOT_FOUND", "GHL webhook payload did not include a location id");
  }

  const club = await prisma.club.findFirst({
    where: {
      ghlLocationId,
      isActive: true
    },
    select: { id: true }
  });

  if (!club) {
    throw new HttpError(422, "CLUB_NOT_FOUND", "No active club matches the GHL location id");
  }

  return club.id;
};
