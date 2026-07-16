import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { ingestCsv } from "../../src/ingestion/normalize";
import { prisma } from "../../src/lib/prisma";
import { getTestApp } from "../helpers/app";
import { resetDb } from "../helpers/reset";

const fixturePath = join(process.cwd(), "tests", "fixtures", "ingestion", "base_wedgewood_wide.csv");

const startDemo = async () => {
  const app = await getTestApp();
  return request(app).post("/api/v1/demo/start").send({
    clubName: "Demo Swim Club",
    contactName: "Demo Owner",
    email: "owner@example.com"
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
    expect(job).toMatchObject({
      clubId: start.body.demoClubId,
      rawFilename: "base_wedgewood_wide.csv",
      detectedFormat: "csv",
      rowCount: 40,
      status: "loaded"
    });
    expect(prospect.clubId).toBe(start.body.demoClubId);
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
