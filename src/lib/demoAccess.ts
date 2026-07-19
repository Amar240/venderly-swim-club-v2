import { prisma } from "./prisma";
import { HttpError } from "../middleware/errorHandler";

export const getActiveDemoProspect = async (clubId: string, prospectId?: string) => {
  const [club, prospect] = await Promise.all([
    prisma.club.findUnique({ where: { id: clubId }, select: { id: true, name: true, isActive: true } }),
    prisma.prospect.findFirst({
      where: {
        clubId,
        expiresAt: { gt: new Date() },
        ...(prospectId ? { id: prospectId } : {})
      },
      select: { id: true, clubId: true, contactName: true, email: true, expiresAt: true }
    })
  ]);

  if (!club?.isActive || !prospect) {
    throw new HttpError(404, "DEMO_NOT_FOUND", "Demo club was not found or has expired");
  }

  return { club, prospect };
};
