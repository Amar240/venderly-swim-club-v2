import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../src/ingestion/aiMapper", () => ({
  proposeMapping: vi.fn(async (columns: Array<{ sourceColumn: string }>) => {
    const targets: Record<string, string> = {
      "Household Lead": "accountHolderName",
      "Electronic Mail Address": "email",
      "Ring Number": "phone",
      "Residence Line": "streetAddress",
      Municipality: "city",
      "Mailing Zone": "postalCode",
      "Persons On Plan": "memberCount",
      "Complimentary Visitor Credits Remaining": "guestPasses",
      "Dues Collected": "paymentAmount",
      "Enrolment Logged": "submittedAt",
      "Health Remarks": "medicalNotes",
      "Acct Holder (Last, First)": "accountHolderName",
      "E-Addr": "email",
      Cell: "phone",
      "Str Addr": "streetAddress",
      Twn: "city",
      Zip4: "postalCode",
      "Fam Sz": "memberCount",
      "Bal Passes": "guestPasses",
      "Amt Pd": "paymentAmount",
      "Dt Recd": "submittedAt",
      "Notes / Med": "medicalNotes"
    };

    return columns.flatMap((column) => targets[column.sourceColumn]
      ? [{
          sourceColumn: column.sourceColumn,
          targetField: targets[column.sourceColumn],
          confidence: 0.94
        }]
      : []);
  })
}));
import request from "supertest";
import { ingestCsv } from "../../src/ingestion/normalize";
import { prisma } from "../../src/lib/prisma";
import { getTestApp } from "../helpers/app";
import { resetDb } from "../helpers/reset";
import { cleanupExpiredDemos } from "../../src/lib/demoCleanup";
import { SCALAR_TARGET_FIELDS } from "../../src/ingestion/synonyms";

const fixturePath = join(process.cwd(), "tests", "fixtures", "ingestion", "base_wedgewood_wide.csv");
const samplePath = join(process.cwd(), "assets", "samples", "sample-swim-club.csv");
const aiMappingFixturePath = join(process.cwd(), "test-files", "ai-mapping-test.csv");
const hardAiMappingFixturePath = join(process.cwd(), "test-files", "ai-mapping-hard.csv");

const completeScalarMapping = (mapping: Array<{
  sourceColumn: string;
  targetField: string | null;
  editable: boolean;
}>) => mapping
  .filter((entry) => entry.editable)
  .map((entry) => ({
    sourceColumn: entry.sourceColumn,
    targetField: entry.targetField && SCALAR_TARGET_FIELDS.includes(
      entry.targetField as (typeof SCALAR_TARGET_FIELDS)[number]
    )
      ? entry.targetField
      : null
  }));

const startDemo = async () => {
  const app = await getTestApp();
  return request(app).post("/api/v1/demo/start").send({
    clubName: "Demo Swim Club",
    contactName: "Demo Owner",
    email: "owner@example.com",
    authorized: true
  });
};

describe("demo ingestion (integration)", () => {
  beforeEach(async () => {
    await resetDb();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("creates a demo prospect and loads the base CSV into its club", async () => {
    const app = await getTestApp();
    const start = await startDemo();

    expect(start.status).toBe(201);
    expect(start.body.demoClubId).toEqual(expect.any(String));
    expect(start.body.prospectId).toEqual(expect.any(String));
    expect(start.body.expiresAt).toEqual(expect.any(String));

    const canonical = ingestCsv(readFileSync(fixturePath, "utf8"));
    const expectedPersons = canonical.memberships.reduce((sum, item) => sum + item.persons.length, 0);
    const upload = await request(app)
      .post(`/api/v1/demo/${start.body.demoClubId}/upload`)
      .attach("file", fixturePath);

    expect(upload.status).toBe(200);
    expect(upload.body).toMatchObject({
      membershipsCreated: 40,
      personsCreated: expectedPersons,
      warnings: []
    });

    const [membershipCount, personCount, primary, job, prospect] = await Promise.all([
      prisma.membership.count({ where: { clubId: start.body.demoClubId } }),
      prisma.person.count({ where: { clubId: start.body.demoClubId } }),
      prisma.person.findFirstOrThrow({
        where: { clubId: start.body.demoClubId, firstName: "Caleb", lastName: "Lewis" }
      }),
      prisma.ingestionJob.findUniqueOrThrow({ where: { id: upload.body.jobId } }),
      prisma.prospect.findUniqueOrThrow({ where: { id: start.body.prospectId } })
    ]);

    expect(membershipCount).toBe(40);
    expect(personCount).toBe(expectedPersons);
    expect(primary.isPrimary).toBe(true);
    expect(primary.relationship).toBe("self");
    expect(primary.email).toBeNull();
    expect(primary.phone).toBeNull();
    expect(primary.allergies).toBeNull();
    expect(job).toMatchObject({
      clubId: start.body.demoClubId,
      rawFilename: "base_wedgewood_wide.csv",
      detectedFormat: "csv",
      rowCount: 40,
      status: "loaded"
    });
    expect(prospect.clubId).toBe(start.body.demoClubId);
    expect(prospect.expiresAt.getTime()).toBeGreaterThan(Date.now());
  });

  it("previews inferred mappings without persisting member data", async () => {
    const app = await getTestApp();
    const start = await startDemo();

    const preview = await request(app)
      .post(`/api/v1/demo/${start.body.demoClubId}/preview`)
      .attach("file", fixturePath)
      .expect(200);

    expect(preview.body.stats).toEqual({
      totalRows: 40,
      membershipsFound: 40,
      peopleFound: 139,
      validCount: 40,
      invalidCount: 0
    });
    expect(preview.body.sampleMemberships).toHaveLength(3);
    expect(preview.body.structure).toMatchObject({
      headerRowIndex: 0,
      detectedBy: "auto"
    });
    expect(preview.body.mapping).toEqual(expect.arrayContaining([
      expect.objectContaining({
        sourceColumn: "Your Full Name",
        targetField: "accountHolderName",
        method: "fuzzy",
        sampleValues: expect.arrayContaining(["Caleb Lewis"])
      }),
      expect.objectContaining({
        sourceColumn: "1st Member Full Name",
        targetField: "familyMemberName",
        method: "structural",
        groupKey: "family-wide"
      })
    ]));
    expect(await prisma.membership.count({ where: { clubId: start.body.demoClubId } })).toBe(0);
    expect(await prisma.person.count({ where: { clubId: start.body.demoClubId } })).toBe(0);
    expect(await prisma.ingestionJob.count({ where: { clubId: start.body.demoClubId } })).toBe(0);
  });

  it("detects and manually reuses the hard fixture header row", async () => {
    const app = await getTestApp();
    const automaticDemo = await startDemo();

    const automatic = await request(app)
      .post(`/api/v1/demo/${automaticDemo.body.demoClubId}/preview`)
      .attach("file", hardAiMappingFixturePath)
      .expect(200);

    expect(automatic.body.structure).toMatchObject({
      headerRowIndex: 4,
      detectedBy: "auto",
      candidateRows: expect.arrayContaining([{ index: 3, cells: [] }])
    });
    expect(automatic.body.stats).toMatchObject({
      totalRows: 30,
      membershipsFound: 30,
      validCount: 30,
      invalidCount: 0
    });
    expect(await prisma.membership.count({ where: { clubId: automaticDemo.body.demoClubId } })).toBe(0);
    expect(await prisma.person.count({ where: { clubId: automaticDemo.body.demoClubId } })).toBe(0);
    expect(await prisma.ingestionJob.count({ where: { clubId: automaticDemo.body.demoClubId } })).toBe(0);

    const wrong = await request(app)
      .post(`/api/v1/demo/${automaticDemo.body.demoClubId}/preview`)
      .field("headerRowIndex", "0")
      .attach("file", hardAiMappingFixturePath)
      .expect(200);
    expect(wrong.body.structure).toMatchObject({ headerRowIndex: 0, detectedBy: "manual" });
    expect(wrong.body.stats).toMatchObject({ membershipsFound: 0, validCount: 0 });

    const manual = await request(app)
      .post(`/api/v1/demo/${automaticDemo.body.demoClubId}/preview`)
      .field("headerRowIndex", "4")
      .attach("file", hardAiMappingFixturePath)
      .expect(200);
    expect(manual.body.structure).toMatchObject({ headerRowIndex: 4, detectedBy: "manual" });
    expect(manual.body.stats).toMatchObject({ membershipsFound: 30, validCount: 30, invalidCount: 0 });

    const upload = await request(app)
      .post(`/api/v1/demo/${automaticDemo.body.demoClubId}/upload`)
      .field("headerRowIndex", "4")
      .field("mappingOverrides", JSON.stringify(completeScalarMapping(manual.body.mapping)))
      .attach("file", hardAiMappingFixturePath)
      .expect(200);
    expect(upload.body.membershipsCreated).toBe(30);
  });

  it("loads a confirmed upload with a corrected scalar mapping", async () => {
    const app = await getTestApp();
    const start = await startDemo();
    const csv = [
      "Your Full Name,Your Phone,Your Email,Select the # of Members for your Membership,Mystery Balance",
      "Ada Lovelace,3025551212,ada@example.com,1,7"
    ].join("\n");

    const upload = await request(app)
      .post(`/api/v1/demo/${start.body.demoClubId}/upload`)
      .field("mappingOverrides", JSON.stringify([
        { sourceColumn: "Mystery Balance", targetField: "guestPasses" }
      ]))
      .attach("file", Buffer.from(csv), "custom.csv")
      .expect(200);

    expect(upload.body).toMatchObject({ membershipsCreated: 1, personsCreated: 1 });

    const overview = await request(app)
      .get(`/api/v1/demo/${start.body.demoClubId}/overview`)
      .expect(200);

    expect(overview.body.summary.guestPasses).toBe(7);
    expect(overview.body.memberships[0]).toMatchObject({
      accountHolderName: "Ada Lovelace",
      guestPassesTotal: 7
    });
  });

  it("loads an accepted AI mapping without a manual edit or contact columns", async () => {
    const app = await getTestApp();
    const start = await startDemo();
    const csv = [
      "Household Lead,Complimentary Visitor Credits Remaining",
      "Ada Lovelace,7"
    ].join("\n");

    const preview = await request(app)
      .post(`/api/v1/demo/${start.body.demoClubId}/preview`)
      .attach("file", Buffer.from(csv), "ai-preview.csv")
      .expect(200);
    expect(preview.body.mapping).toEqual(expect.arrayContaining([
      expect.objectContaining({
        sourceColumn: "Household Lead",
        targetField: "accountHolderName",
        method: "llm",
        confidence: 0.94
      }),
      expect.objectContaining({
        sourceColumn: "Complimentary Visitor Credits Remaining",
        targetField: "guestPasses",
        method: "llm",
        confidence: 0.94
      })
    ]));

    await request(app)
      .post(`/api/v1/demo/${start.body.demoClubId}/upload`)
      .field("mappingOverrides", JSON.stringify(completeScalarMapping(preview.body.mapping)))
      .attach("file", Buffer.from(csv), "ai-preview.csv")
      .expect(200);

    const overview = await request(app)
      .get(`/api/v1/demo/${start.body.demoClubId}/overview`)
      .expect(200);
    expect(overview.body.memberships[0].guestPassesTotal).toBe(7);
  });

  it("loads the 25-row AI mapping fixture from the complete reviewed mapping", async () => {
    const app = await getTestApp();
    const start = await startDemo();

    const preview = await request(app)
      .post(`/api/v1/demo/${start.body.demoClubId}/preview`)
      .attach("file", aiMappingFixturePath)
      .expect(200);
    expect(preview.body.mapping).toEqual(expect.arrayContaining([
      expect.objectContaining({ sourceColumn: "Household Lead", targetField: "accountHolderName", method: "llm" }),
      expect.objectContaining({ sourceColumn: "Ring Number", targetField: "phone", method: "llm" }),
      expect.objectContaining({
        sourceColumn: "Complimentary Visitor Credits Remaining",
        targetField: "guestPasses",
        method: "llm"
      })
    ]));
    expect(preview.body.stats).toEqual({
      totalRows: 25,
      membershipsFound: 25,
      peopleFound: 88,
      validCount: 25,
      invalidCount: 0
    });
    expect(preview.body.warnings).toEqual([]);
    expect(preview.body.sampleMemberships).toHaveLength(3);
    expect(preview.body.sampleMemberships[0]).toMatchObject({
      accountHolderName: "Caleb Lewis",
      persons: expect.arrayContaining([
        expect.objectContaining({ fullName: "Caleb Lewis", isPrimary: true }),
        expect.objectContaining({ fullName: "Kevin Lewis", isPrimary: false }),
        expect.objectContaining({ fullName: "Ethan Lewis", isPrimary: false })
      ])
    });
    expect(preview.body.mapping.filter(
      (entry: { targetField: string | null }) => entry.targetField === "accountHolderName"
    )).toEqual([
      expect.objectContaining({
        sourceColumn: "Household Lead",
        method: "llm"
      })
    ]);
    expect(await prisma.membership.count({ where: { clubId: start.body.demoClubId } })).toBe(0);
    expect(await prisma.person.count({ where: { clubId: start.body.demoClubId } })).toBe(0);
    expect(await prisma.ingestionJob.count({ where: { clubId: start.body.demoClubId } })).toBe(0);

    const upload = await request(app)
      .post(`/api/v1/demo/${start.body.demoClubId}/upload`)
      .field("mappingOverrides", JSON.stringify(completeScalarMapping(preview.body.mapping)))
      .attach("file", aiMappingFixturePath)
      .expect(200);

    expect(upload.body.membershipsCreated).toBe(25);
    expect(await prisma.membership.count({ where: { clubId: start.body.demoClubId } })).toBe(25);

    const overview = await request(app)
      .get(`/api/v1/demo/${start.body.demoClubId}/overview`)
      .expect(200);
    expect(overview.body.memberships[0]).toMatchObject({
      accountHolderName: "Caleb Lewis",
      persons: expect.arrayContaining([
        expect.objectContaining({ firstName: "Caleb", lastName: "Lewis", isPrimary: true }),
        expect.objectContaining({ firstName: "Kevin", lastName: "Lewis", isPrimary: false }),
        expect.objectContaining({ firstName: "Ethan", lastName: "Lewis", isPrimary: false })
      ])
    });
    expect(overview.body.memberships[0].persons.filter(
      (person: { isPrimary: boolean }) => person.isPrimary
    )).toHaveLength(1);
  });

  it("returns a public overview for a loaded demo club", async () => {
    const app = await getTestApp();
    const start = await startDemo();

    await request(app)
      .post(`/api/v1/demo/${start.body.demoClubId}/upload`)
      .attach("file", fixturePath)
      .expect(200);

    const response = await request(app)
      .get(`/api/v1/demo/${start.body.demoClubId}/overview`)
      .expect(200);

    expect(response.body.club).toEqual({ name: "Demo Swim Club" });
    expect(response.body.summary).toMatchObject({
      memberships: 40,
      members: 139
    });
    expect(response.body.memberships).toHaveLength(40);
    expect(response.body.memberships[0]).toMatchObject({
      accountHolderName: "Caleb Lewis"
    });
    expect(response.body.memberships[0].persons[0]).toMatchObject({
      firstName: "Caleb",
      lastName: "Lewis",
      isPrimary: true
    });
  });

  it("loads the built-in sample club through the normal ingestion path", async () => {
    const app = await getTestApp();
    const start = await startDemo();
    const canonical = ingestCsv(readFileSync(samplePath, "utf8"));
    const expectedPersons = canonical.memberships.reduce((sum, item) => sum + item.persons.length, 0);

    const sample = await request(app)
      .post(`/api/v1/demo/${start.body.demoClubId}/sample`)
      .expect(200);

    expect(sample.body).toMatchObject({
      membershipsCreated: 45,
      personsCreated: expectedPersons,
      isSample: true
    });

    const overview = await request(app)
      .get(`/api/v1/demo/${start.body.demoClubId}/overview`)
      .expect(200);

    expect(overview.body.summary).toMatchObject({
      memberships: 45,
      members: expectedPersons
    });
    expect(overview.body.memberships).toHaveLength(45);
    expect(overview.body.memberships[0].persons[0]).toMatchObject({
      firstName: "Caleb",
      lastName: "Lewis",
      isPrimary: true
    });

    const job = await prisma.ingestionJob.findUniqueOrThrow({ where: { id: sample.body.jobId } });
    expect(job).toMatchObject({
      rawFilename: "sample-swim-club.csv",
      detectedFormat: "csv",
      rowCount: 45,
      status: "loaded"
    });
  });

  it("does not expose a non-demo club through the public overview", async () => {
    const app = await getTestApp();
    const club = await prisma.club.create({
      data: { name: "Private Swim Club", slug: "private-swim-club" }
    });

    const response = await request(app).get(`/api/v1/demo/${club.id}/overview`);

    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe("DEMO_NOT_FOUND");
  });

  it("does not load sample data into a non-demo club", async () => {
    const app = await getTestApp();
    const club = await prisma.club.create({
      data: { name: "Private Swim Club", slug: "private-sample-club" }
    });

    const response = await request(app).post(`/api/v1/demo/${club.id}/sample`);

    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe("DEMO_NOT_FOUND");
    expect(await prisma.membership.count({ where: { clubId: club.id } })).toBe(0);
  });

  it("rejects expired demo uploads and overviews", async () => {
    const app = await getTestApp();
    const start = await startDemo();
    await prisma.prospect.updateMany({
      where: { clubId: start.body.demoClubId },
      data: { expiresAt: new Date(Date.now() - 1_000) }
    });

    await request(app).get(`/api/v1/demo/${start.body.demoClubId}/overview`).expect(404);
    await request(app)
      .post(`/api/v1/demo/${start.body.demoClubId}/upload`)
      .attach("file", fixturePath)
      .expect(404);
    await request(app)
      .post(`/api/v1/demo/${start.body.demoClubId}/sample`)
      .expect(404);
  });

  it("deletes expired demo records without touching active demos", async () => {
    const app = await getTestApp();
    const expired = await startDemo();
    const active = await startDemo();
    await request(app)
      .post(`/api/v1/demo/${expired.body.demoClubId}/upload`)
      .attach("file", fixturePath)
      .expect(200);
    await prisma.prospect.updateMany({
      where: { clubId: expired.body.demoClubId },
      data: { expiresAt: new Date(Date.now() - 1_000) }
    });

    await expect(cleanupExpiredDemos()).resolves.toBe(1);
    expect(await prisma.club.findUnique({ where: { id: expired.body.demoClubId } })).toBeNull();
    expect(await prisma.membership.count({ where: { clubId: expired.body.demoClubId } })).toBe(0);
    expect(await prisma.person.count({ where: { clubId: expired.body.demoClubId } })).toBe(0);
    expect(await prisma.ingestionJob.count({ where: { clubId: expired.body.demoClubId } })).toBe(0);
    expect(await prisma.club.findUnique({ where: { id: active.body.demoClubId } })).not.toBeNull();
  });

  it("requires upload authorization before creating a demo", async () => {
    const app = await getTestApp();
    const response = await request(app).post("/api/v1/demo/start").send({
      clubName: "Demo Swim Club",
      contactName: "Demo Owner",
      email: "owner@example.com",
      authorized: false
    });

    expect(response.status).toBe(400);
    expect(await prisma.club.count()).toBe(0);
  });

  it("persists a failed job for an Apple Numbers ingestion attempt", async () => {
    const app = await getTestApp();
    const start = await startDemo();
    const response = await request(app)
      .post(`/api/v1/demo/${start.body.demoClubId}/upload`)
      .attach("file", Buffer.from("numbers"), "members.numbers");

    expect(response.status).toBe(400);
    expect(response.body.error.message).toContain("export the spreadsheet to Excel");

    const job = await prisma.ingestionJob.findFirstOrThrow({ where: { clubId: start.body.demoClubId } });
    expect(job).toMatchObject({
      detectedFormat: "numbers",
      rawFilename: "members.numbers",
      status: "failed",
      rowCount: 0
    });
  });

  it("returns 400 without a job when the file is missing", async () => {
    const app = await getTestApp();
    const start = await startDemo();
    const response = await request(app).post(`/api/v1/demo/${start.body.demoClubId}/upload`);

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe("FILE_REQUIRED");
    expect(await prisma.ingestionJob.count()).toBe(0);
  });

  it("persists a failed job and returns 422 when no memberships are valid", async () => {
    const app = await getTestApp();
    const start = await startDemo();
    const response = await request(app)
      .post(`/api/v1/demo/${start.body.demoClubId}/upload`)
      .attach("file", Buffer.from("Name,Email,Phone\n"), "empty.csv");

    expect(response.status).toBe(422);
    expect(response.body.error.code).toBe("NO_VALID_MEMBERSHIPS");

    const job = await prisma.ingestionJob.findFirstOrThrow({ where: { clubId: start.body.demoClubId } });
    expect(job).toMatchObject({ status: "failed", rowCount: 0, detectedFormat: "csv" });
  });
});
