import { randomInt } from "node:crypto";
import bcrypt from "bcrypt";
import { prisma } from "./prisma";
import { HttpError } from "../middleware/errorHandler";

export type StaffPinRecord = {
  id: string;
  passwordHash: string;
};

export const findActivePinConflict = async (
  pin: string,
  staff: StaffPinRecord[],
  excludeStaffId?: string
): Promise<StaffPinRecord | null> => {
  for (const candidate of staff) {
    if (candidate.id === excludeStaffId) continue;
    if (await bcrypt.compare(pin, candidate.passwordHash)) return candidate;
  }

  return null;
};

const listActivePinRecords = (): Promise<StaffPinRecord[]> =>
  prisma.staff.findMany({
    where: { isActive: true },
    select: { id: true, passwordHash: true }
  });

export const assertActivePinAvailable = async (pin: string, excludeStaffId?: string): Promise<void> => {
  const conflict = await findActivePinConflict(pin, await listActivePinRecords(), excludeStaffId);
  if (conflict) {
    throw new HttpError(409, "PIN_TAKEN", "PIN is already assigned to another active staff member");
  }
};

export const hashStaffPin = (pin: string): Promise<string> => bcrypt.hash(pin, 10);

export const generateUniqueStaffPin = async (): Promise<{ pin: string; passwordHash: string }> => {
  const activeStaff = await listActivePinRecords();

  for (let attempt = 0; attempt < 100; attempt += 1) {
    const pin = randomInt(0, 10_000).toString().padStart(4, "0");
    if (!(await findActivePinConflict(pin, activeStaff))) {
      return { pin, passwordHash: await hashStaffPin(pin) };
    }
  }

  throw new HttpError(503, "PIN_GENERATION_FAILED", "A unique staff PIN could not be generated");
};
