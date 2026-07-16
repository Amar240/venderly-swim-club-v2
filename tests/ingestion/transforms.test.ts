import { describe, expect, it } from "vitest";
import {
  coercePhone,
  coercePostal,
  dedupeHolderFromListedPeople,
  groupPeopleLong,
  joinName,
  parseDateLoose,
  splitAddress,
  splitName,
  splitPeopleFromCell,
  splitPeopleWide,
  withAccountHolderPerson
} from "../../src/ingestion/transforms";

describe("coercePhone", () => {
  it("normalizes common US phone formats to E.164", () => {
    expect(coercePhone("+13025911540")).toBe("+13025911540");
    expect(coercePhone("3025911540")).toBe("+13025911540");
    expect(coercePhone("3025911540.0")).toBe("+13025911540");
    expect(coercePhone("(302) 591-1540")).toBe("+13025911540");
  });

  it("is idempotent for already +1-prefixed 11-digit input", () => {
    expect(coercePhone("+13025911540")).toBe("+13025911540");
  });
});

describe("coercePostal", () => {
  it("preserves postal codes as strings and strips only trailing .0", () => {
    expect(coercePostal("01992")).toBe("01992");
    expect(coercePostal("19929.0")).toBe("19929");
  });
});

describe("parseDateLoose", () => {
  it("parses ordinal text, ISO dates, and US slash dates to ISO strings", () => {
    expect(parseDateLoose("Jul 6th 2026, 11:52 pm")).toBe("2026-07-06T23:52:00.000Z");
    expect(parseDateLoose("2026-07-09")).toBe("2026-07-09T12:00:00.000Z");
    expect(parseDateLoose("07/09/2026")).toBe("2026-07-09T12:00:00.000Z");
  });
});

describe("splitPeopleFromCell", () => {
  it("splits semicolon-delimited name-age cells", () => {
    expect(splitPeopleFromCell("Kevin Lewis (67); Ethan Lewis (11)")).toEqual([
      { fullName: "Kevin Lewis", isPrimary: false, age: 67 },
      { fullName: "Ethan Lewis", isPrimary: false, age: 11 }
    ]);
  });
});

describe("splitPeopleWide", () => {
  it("extracts member groups and dedupes the holder", () => {
    const people = splitPeopleWide(
      {
        "1st Member Full Name": "Caleb Lewis",
        "1st Member Phone": "3025911540.0",
        "1st Member Age": "40.0",
        "2nd Member Full Name": "Kevin Lewis",
        "2nd Member Phone": "",
        "2nd Member Age": "67.0"
      },
      [
        { index: 1, nameColumn: "1st Member Full Name", phoneColumn: "1st Member Phone", ageColumn: "1st Member Age" },
        { index: 2, nameColumn: "2nd Member Full Name", phoneColumn: "2nd Member Phone", ageColumn: "2nd Member Age" }
      ],
      "Caleb Lewis"
    );

    expect(people).toEqual([{ fullName: "Kevin Lewis", isPrimary: false, age: 67 }]);
  });
});

describe("groupPeopleLong", () => {
  it("groups long rows and puts the primary person first", () => {
    const groups = groupPeopleLong(
      [
        { household_id: "H1", member_name: "Child One", is_primary: "no", age: "8", phone: "" },
        { household_id: "H1", member_name: "Parent One", is_primary: "yes", age: "", phone: "3025911540" }
      ],
      {
        groupIdColumn: "household_id",
        nameColumn: "member_name",
        isPrimaryColumn: "is_primary",
        ageColumn: "age",
        phoneColumn: "phone"
      }
    );

    expect(groups).toHaveLength(1);
    expect(groups[0]?.people.map((person) => person.fullName)).toEqual(["Parent One", "Child One"]);
    expect(groups[0]?.people.map((person) => person.isPrimary)).toEqual([true, false]);
  });
});

describe("names", () => {
  it("joins and splits names using the shared signup name behavior", () => {
    expect(joinName("Elsa", "")).toBe("Elsa");
    expect(splitName("Elsa")).toEqual({ firstName: "Elsa", lastName: "" });
  });

  it("dedupes listed holder names using normalizeName", () => {
    expect(
      dedupeHolderFromListedPeople("Elena M. Gouge", [
        { fullName: "Elena M Gouge", isPrimary: false },
        { fullName: "Anthony Gouge", isPrimary: false }
      ])
    ).toEqual([{ fullName: "Anthony Gouge", isPrimary: false }]);
  });

  it("adds one account-holder person before deduped listed people", () => {
    expect(
      withAccountHolderPerson("Caleb Lewis", "+13025911540", [
        { fullName: "Caleb Lewis", isPrimary: false },
        { fullName: "Kevin Lewis", isPrimary: false }
      ])
    ).toEqual([
      { fullName: "Caleb Lewis", isPrimary: true, age: null, phone: "+13025911540" },
      { fullName: "Kevin Lewis", isPrimary: false }
    ]);
  });
});

describe("splitAddress", () => {
  it("strips Google place-id tails and splits address parts", () => {
    expect(splitAddress("8354 Sunset Blvd, Smyrna, DE, USA ChIJ888059827 8354 Sunset Blvd")).toEqual({
      streetAddress: "8354 Sunset Blvd",
      city: "Smyrna",
      state: "DE",
      country: "USA"
    });
  });
});
