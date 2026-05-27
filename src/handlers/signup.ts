import type { RequestHandler } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { HttpError } from "../middleware/errorHandler";
import { resolveClubIdFromGhlPayload } from "../services/clubResolver";

const signupSchema = z
  .object({
    contactId: z.string().min(1),
    membershipCode: z.string().min(1).optional(),
    membershipId: z.string().min(1).optional(),
    externalMembershipId: z.string().min(1).optional(),
    externalCustomerId: z.string().min(1).optional(),
    opportunityId: z.string().min(1).optional(),
    locationId: z.string().min(1).optional(),
    location: z
      .object({
        id: z.string().min(1).optional()
      })
      .passthrough()
      .optional(),
    firstName: z.string().min(1),
    lastName: z.string().min(1),
    email: z.string().email(),
    phone: z.string().min(7).optional()
  })
  .passthrough();

export const signupHandler: RequestHandler = async (req, res, next) => {
  try {
    const clubId = await resolveClubIdFromGhlPayload(req.body);
    const input = signupSchema.parse(req.body);
    const externalMembershipId =
      input.externalMembershipId ?? input.membershipId ?? input.opportunityId ?? input.contactId;

    if (!input.membershipCode && !externalMembershipId) {
      throw new HttpError(
        400,
        "MEMBERSHIP_IDENTIFIER_REQUIRED",
        "Signup webhook must include a membership code or external membership id"
      );
    }

    const result = await prisma.$transaction(async (transaction) => {
      const existingMembership = await transaction.membership.findFirst({
        where: {
          clubId,
          OR: [
            ...(input.membershipCode ? [{ membershipCode: input.membershipCode }] : []),
            ...(externalMembershipId ? [{ externalMembershipId }] : [])
          ]
        },
        select: { id: true }
      });

      const membership = existingMembership
        ? await transaction.membership.update({
            where: { id: existingMembership.id },
            data: {
              membershipCode: input.membershipCode,
              externalMembershipId,
              externalCustomerId: input.externalCustomerId
            },
            select: {
              id: true,
              membershipCode: true,
              externalMembershipId: true
            }
          })
        : await transaction.membership.create({
            data: {
              clubId,
              membershipCode: input.membershipCode,
              externalMembershipId,
              externalCustomerId: input.externalCustomerId
            },
            select: {
              id: true,
              membershipCode: true,
              externalMembershipId: true
            }
          });

      const person = await transaction.person.upsert({
        where: {
          clubId_ghlContactId: {
            clubId,
            ghlContactId: input.contactId
          }
        },
        create: {
          clubId,
          membershipId: membership.id,
          firstName: input.firstName,
          lastName: input.lastName,
          email: input.email,
          phone: input.phone,
          ghlContactId: input.contactId,
          isPrimary: true
        },
        update: {
          membershipId: membership.id,
          firstName: input.firstName,
          lastName: input.lastName,
          email: input.email,
          phone: input.phone,
          isPrimary: true
        },
        select: {
          id: true,
          membershipId: true,
          firstName: true,
          lastName: true,
          email: true,
          phone: true,
          ghlContactId: true
        }
      });

      return { membership, person };
    });

    res.status(201).json({
      status: "ok",
      data: {
        message: "Signup webhook processed",
        clubId,
        membership: result.membership,
        person: result.person
      }
    });
  } catch (error) {
    next(error);
  }
};
