import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const prismaMock = vi.hoisted(() => ({
  club: { findFirstOrThrow: vi.fn() },
  checkinEvent: { findMany: vi.fn() },
  guestPassPurchase: { findMany: vi.fn() },
  membership: { count: vi.fn() }
}));

const loggerMock = vi.hoisted(() => ({
  error: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  debug: vi.fn()
}));

const sesSendMock = vi.hoisted(() => vi.fn());

vi.mock("../../src/lib/prisma", () => ({ prisma: prismaMock }));
vi.mock("../../src/lib/logger", () => ({ logger: loggerMock }));
vi.mock("@aws-sdk/client-sesv2", () => ({
  SESv2Client: class {
    public send = sesSendMock;
  },
  SendEmailCommand: class {
    public input: unknown;

    public constructor(input: unknown) {
      this.input = input;
    }
  }
}));

import { runEmailDigestJob, sendWeeklyDigest } from "../../src/lib/emailDigest";

const seedHappyPrisma = () => {
  prismaMock.club.findFirstOrThrow.mockResolvedValue({ id: "club_1" });
  prismaMock.checkinEvent.findMany.mockResolvedValue([
    {
      checkedInAt: new Date("2026-06-07T17:00:00Z"),
      signedOutAt: null,
      personId: "p1",
      membershipId: "m1",
      numGuests: 2
    }
  ]);
  prismaMock.guestPassPurchase.findMany.mockResolvedValue([]);
  prismaMock.membership.count.mockResolvedValue(3);
};

describe("sendWeeklyDigest", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.RYAN_EMAIL;
    delete process.env.SES_FROM_ADDRESS;
  });

  afterEach(() => {
    delete process.env.RYAN_EMAIL;
    delete process.env.SES_FROM_ADDRESS;
  });

  it("skips with a warning when RYAN_EMAIL or SES_FROM_ADDRESS is missing", async () => {
    await sendWeeklyDigest();

    expect(loggerMock.warn).toHaveBeenCalledWith(
      "Email digest skipped: RYAN_EMAIL or SES_FROM_ADDRESS not set"
    );
    expect(prismaMock.club.findFirstOrThrow).not.toHaveBeenCalled();
    expect(sesSendMock).not.toHaveBeenCalled();
  });

  it("sends the digest email when configured", async () => {
    process.env.RYAN_EMAIL = "ryan@example.com";
    process.env.SES_FROM_ADDRESS = "noreply@example.com";
    seedHappyPrisma();
    sesSendMock.mockResolvedValue({});

    await sendWeeklyDigest();

    expect(sesSendMock).toHaveBeenCalledTimes(1);
    const command = sesSendMock.mock.calls[0]?.[0] as { input: Record<string, unknown> };
    expect(command.input).toMatchObject({
      FromEmailAddress: "noreply@example.com",
      Destination: { ToAddresses: ["ryan@example.com"] }
    });
    const content = command.input.Content as {
      Simple: { Subject: { Data: string }; Body: { Text: { Data: string } } };
    };
    expect(content.Simple.Subject.Data).toContain("Wedgewood Weekly");
    expect(content.Simple.Body.Text.Data).toContain("Total visits:       3"); // 1 member + 2 guests
    expect(content.Simple.Body.Text.Data).toContain("New members:        3");
    expect(content.Simple.Body.Text.Data).toContain("https://pooladmin.govenderly.us");
    expect(loggerMock.info).toHaveBeenCalledWith("Weekly email digest sent", { to: "ryan@example.com" });
  });
});

describe("runEmailDigestJob", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.RYAN_EMAIL = "ryan@example.com";
    process.env.SES_FROM_ADDRESS = "noreply@example.com";
  });

  afterEach(() => {
    delete process.env.RYAN_EMAIL;
    delete process.env.SES_FROM_ADDRESS;
  });

  it("catches and logs errors instead of throwing", async () => {
    prismaMock.club.findFirstOrThrow.mockRejectedValue(new Error("database unavailable"));

    await expect(runEmailDigestJob()).resolves.toBeUndefined();
    expect(loggerMock.error).toHaveBeenCalledWith("Email digest failed", { message: "database unavailable" });
    expect(sesSendMock).not.toHaveBeenCalled();
  });
});
