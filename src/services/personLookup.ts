import { PersonStatus } from "@prisma/client";
import { prisma } from "../lib/prisma";
import type { PersonLookupInput, PersonLookupResult } from "../types";

type PersonLookupRecord = {
  id: string;
  membershipId: string;
  isPrimary: boolean;
};

const toFoundResult = (
  person: PersonLookupRecord,
  matchedBy: NonNullable<PersonLookupResult["matchedBy"]>
): PersonLookupResult => ({
  found: true,
  personId: person.id,
  membershipId: person.membershipId,
  matchedBy
});

const choosePerson = (
  persons: PersonLookupRecord[],
  matchedBy: NonNullable<PersonLookupResult["matchedBy"]>
): PersonLookupResult => {
  if (persons.length === 0) {
    return { found: false };
  }

  if (persons.length === 1) {
    return toFoundResult(persons[0], matchedBy);
  }

  const primaryPersons = persons.filter((person) => person.isPrimary);

  if (primaryPersons.length === 1) {
    return toFoundResult(primaryPersons[0], matchedBy);
  }

  return { found: false, ambiguous: true, matchedBy };
};

export const lookupPerson = async (input: PersonLookupInput): Promise<PersonLookupResult> => {
  if (input.personId) {
    const person = await prisma.person.findFirst({
      where: {
        id: input.personId,
        clubId: input.clubId,
        status: PersonStatus.ACTIVE
      },
      select: {
        id: true,
        membershipId: true,
        isPrimary: true
      }
    });

    return person ? toFoundResult(person, "personId") : { found: false };
  }

  if (input.membershipCode) {
    const membership = await prisma.membership.findFirst({
      where: {
        clubId: input.clubId,
        membershipCode: input.membershipCode,
        status: "ACTIVE"
      },
      select: {
        persons: {
          where: { status: PersonStatus.ACTIVE },
          select: {
            id: true,
            membershipId: true,
            isPrimary: true
          }
        }
      }
    });

    return choosePerson(membership?.persons ?? [], "membershipCode");
  }

  if (input.email) {
    const persons = await prisma.person.findMany({
      where: {
        clubId: input.clubId,
        email: input.email,
        status: PersonStatus.ACTIVE
      },
      select: {
        id: true,
        membershipId: true,
        isPrimary: true
      },
      take: 2
    });

    return choosePerson(persons, "email");
  }

  if (input.phone) {
    const persons = await prisma.person.findMany({
      where: {
        clubId: input.clubId,
        phone: input.phone,
        status: PersonStatus.ACTIVE
      },
      select: {
        id: true,
        membershipId: true,
        isPrimary: true
      },
      take: 2
    });

    return choosePerson(persons, "phone");
  }

  return { found: false };
};
