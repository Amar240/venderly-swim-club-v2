import { prisma } from "../lib/prisma";
import type { MemberLookupInput, MemberLookupResult } from "../types";

export const lookupMember = async (input: MemberLookupInput): Promise<MemberLookupResult> => {
  if (input.membershipCode) {
    const member = await prisma.member.findUnique({
      where: { membershipCode: input.membershipCode },
      select: { id: true }
    });

    if (member) {
      return { found: true, memberId: member.id, matchedBy: "membershipCode" };
    }
  }

  if (input.email) {
    const member = await prisma.member.findUnique({
      where: { email: input.email },
      select: { id: true }
    });

    if (member) {
      return { found: true, memberId: member.id, matchedBy: "email" };
    }
  }

  if (input.phone) {
    const member = await prisma.member.findFirst({
      where: { phone: input.phone },
      select: { id: true }
    });

    if (member) {
      return { found: true, memberId: member.id, matchedBy: "phone" };
    }
  }

  return { found: false };
};
