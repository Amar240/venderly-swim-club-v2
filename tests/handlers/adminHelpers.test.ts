import bcrypt from "bcrypt";
import { describe, expect, it } from "vitest";
import {
  findActivePinConflict,
  flattenActivityEvents,
  serializeStaff
} from "../../src/handlers/admin";

describe("findActivePinConflict", () => {
  it("finds a matching active staff PIN", async () => {
    const passwordHash = await bcrypt.hash("1234", 4);

    await expect(findActivePinConflict("1234", [{ id: "staff_1", passwordHash }])).resolves.toMatchObject({
      id: "staff_1"
    });
  });

  it("ignores the excluded staff member", async () => {
    const passwordHash = await bcrypt.hash("1234", 4);

    await expect(findActivePinConflict("1234", [{ id: "staff_1", passwordHash }], "staff_1")).resolves.toBeNull();
  });

  it("returns null when no PIN matches", async () => {
    const passwordHash = await bcrypt.hash("5678", 4);

    await expect(findActivePinConflict("1234", [{ id: "staff_1", passwordHash }])).resolves.toBeNull();
  });
});

describe("flattenActivityEvents", () => {
  it("creates separate check-in and sign-out rows and sorts by timestamp", () => {
    const rows = flattenActivityEvents([
      {
        id: "event_1",
        checkedInAt: new Date("2026-06-03T13:00:00Z"),
        signedOutAt: new Date("2026-06-03T14:00:00Z"),
        staff: { id: "staff_1", name: "Admin" },
        person: { firstName: "Kelly", lastName: "Oldis" }
      },
      {
        id: "event_2",
        checkedInAt: new Date("2026-06-03T13:30:00Z"),
        signedOutAt: null,
        staff: { id: "staff_2", name: "Staff" },
        person: { firstName: "Tyler", lastName: "Oldis" }
      }
    ]);

    expect(rows).toEqual([
      expect.objectContaining({ eventId: "event_1", actionType: "manual_signout", memberName: "Kelly Oldis" }),
      expect.objectContaining({ eventId: "event_2", actionType: "manual_checkin", memberName: "Tyler Oldis" }),
      expect.objectContaining({ eventId: "event_1", actionType: "manual_checkin", memberName: "Kelly Oldis" })
    ]);
  });

  it("skips rows without staff", () => {
    expect(
      flattenActivityEvents([
        {
          id: "event_1",
          checkedInAt: new Date("2026-06-03T13:00:00Z"),
          signedOutAt: null,
          staff: null,
          person: { firstName: "QR", lastName: "Form" }
        }
      ])
    ).toEqual([]);
  });
});

describe("serializeStaff", () => {
  it("omits passwordHash and serializes createdAt", () => {
    expect(
      serializeStaff({
        id: "staff_1",
        name: "Admin",
        email: "admin@example.com",
        role: "ADMIN",
        isActive: true,
        createdAt: new Date("2026-06-03T12:00:00Z")
      })
    ).toEqual({
      id: "staff_1",
      name: "Admin",
      email: "admin@example.com",
      role: "ADMIN",
      isActive: true,
      createdAt: "2026-06-03T12:00:00.000Z"
    });
  });
});
