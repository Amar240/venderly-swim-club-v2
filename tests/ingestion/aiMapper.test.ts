import { beforeEach, describe, expect, it, vi } from "vitest";

const bedrockMocks = vi.hoisted(() => ({
  send: vi.fn(),
  destroy: vi.fn()
}));

vi.mock("@aws-sdk/client-bedrock-runtime", () => ({
  BedrockRuntimeClient: class {
    send = bedrockMocks.send;
    destroy = bedrockMocks.destroy;
  },
  InvokeModelCommand: class {
    input: unknown;
    constructor(input: unknown) {
      this.input = input;
    }
  }
}));

vi.mock("../../src/lib/logger", () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn()
  }
}));

import {
  clearAiMappingCacheForTests,
  maskSampleValue,
  parseMappingResponse,
  proposeMapping
} from "../../src/ingestion/aiMapper";
import { logger } from "../../src/lib/logger";

const bedrockResponse = (value: unknown): { body: Uint8Array } => ({
  body: new TextEncoder().encode(JSON.stringify({
    content: [{ type: "text", text: typeof value === "string" ? value : JSON.stringify(value) }]
  }))
});

describe("maskSampleValue", () => {
  it("preserves case shape and punctuation while masking alphanumeric data", () => {
    expect(maskSampleValue("jsmith@gmail.com")).toBe("aaaaaa@aaaaa.aaa");
    expect(maskSampleValue("Kevin Lewis (67)")).toBe("Aaaaa Aaaaa (##)");
    expect(maskSampleValue("3025911540")).toBe("##########");
    expect(maskSampleValue("8354 Sunset Blvd")).toBe("#### Aaaaaa Aaaa");
  });

  it("does not preserve any original alphanumeric character", () => {
    const original = "Qz9-Member_204";
    const masked = maskSampleValue(original);

    expect(masked).toBe("Aa#-Aaaaaa_###");
    for (const character of original.match(/[A-Za-z0-9]/g) ?? []) {
      if (!["A", "a"].includes(character)) {
        expect(masked).not.toContain(character);
      }
    }
  });
});

describe("parseMappingResponse", () => {
  it("keeps valid proposals and drops malformed, unknown, and duplicate entries", () => {
    const response = bedrockResponse([
      { column: "Visitor Credits", targetField: "guestPasses", confidence: 0.91 },
      { column: "Other Credits", targetField: "guestPasses", confidence: 0.8 },
      { column: "Unknown Column", targetField: "phone", confidence: 0.9 },
      { column: "Member Notes", targetField: "unsupported", confidence: 0.7 },
      { column: "Member Notes", targetField: "medicalNotes", confidence: 2 }
    ]);

    expect(parseMappingResponse(response.body, ["Visitor Credits", "Other Credits", "Member Notes"])).toEqual([
      { sourceColumn: "Visitor Credits", targetField: "guestPasses", confidence: 0.91 }
    ]);
  });

  it("returns an empty list for malformed JSON", () => {
    expect(parseMappingResponse(bedrockResponse("not json").body, ["Visitor Credits"])).toEqual([]);
  });
});

describe("proposeMapping", () => {
  beforeEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
    clearAiMappingCacheForTests();
    delete process.env.AI_MAPPING_ENABLED;
    delete process.env.BEDROCK_REGION;
    delete process.env.BEDROCK_MODEL_ID;
  });

  it("does not call Bedrock when the feature is disabled", async () => {
    process.env.BEDROCK_REGION = "us-east-2";
    process.env.BEDROCK_MODEL_ID = "test-model";

    await expect(proposeMapping([{ sourceColumn: "Visitor Credits", sampleValues: ["12"] }])).resolves.toEqual([]);
    expect(bedrockMocks.send).not.toHaveBeenCalled();
    expect(logger.info).toHaveBeenCalledWith("AI mapping skipped", {
      outcome: "disabled",
      configured: true,
      columnCount: 1
    });
  });

  it("records when there are no unresolved columns without calling Bedrock", async () => {
    process.env.AI_MAPPING_ENABLED = "true";
    process.env.BEDROCK_REGION = "us-east-2";
    process.env.BEDROCK_MODEL_ID = "test-model";

    await expect(proposeMapping([])).resolves.toEqual([]);
    expect(bedrockMocks.send).not.toHaveBeenCalled();
    expect(logger.info).toHaveBeenCalledWith("AI mapping skipped", {
      outcome: "no_unresolved_columns",
      columnCount: 0
    });
  });

  it("sends only masked samples and caches a successful file shape", async () => {
    process.env.AI_MAPPING_ENABLED = "true";
    process.env.BEDROCK_REGION = "us-east-2";
    process.env.BEDROCK_MODEL_ID = "test-model";
    bedrockMocks.send.mockResolvedValue(bedrockResponse([
      { column: "Visitor Credits", targetField: "guestPasses", confidence: 0.88 }
    ]));
    const columns = [{
      sourceColumn: "Visitor Credits",
      sampleValues: ["Kevin Lewis (67)", "jsmith@gmail.com"]
    }];

    await expect(proposeMapping(columns)).resolves.toEqual([
      { sourceColumn: "Visitor Credits", targetField: "guestPasses", confidence: 0.88 }
    ]);
    await proposeMapping(columns);

    const command = bedrockMocks.send.mock.calls[0]?.[0] as { input: { body: string } };
    expect(command.input.body).toContain("Aaaaa Aaaaa (##)");
    expect(command.input.body).toContain("aaaaaa@aaaaa.aaa");
    expect(command.input.body).not.toContain("Kevin");
    expect(command.input.body).not.toContain("jsmith");
    expect(bedrockMocks.send).toHaveBeenCalledTimes(1);
  });

  it("returns an empty list when Bedrock fails", async () => {
    process.env.AI_MAPPING_ENABLED = "true";
    process.env.BEDROCK_REGION = "us-east-2";
    process.env.BEDROCK_MODEL_ID = "test-model";
    bedrockMocks.send.mockRejectedValue(new Error("AccessDeniedException"));

    await expect(proposeMapping([{ sourceColumn: "Visitor Credits", sampleValues: ["12"] }])).resolves.toEqual([]);
  });

  it("returns an empty list and records a malformed Bedrock response", async () => {
    process.env.AI_MAPPING_ENABLED = "true";
    process.env.BEDROCK_REGION = "us-east-2";
    process.env.BEDROCK_MODEL_ID = "test-model";
    bedrockMocks.send.mockResolvedValue(bedrockResponse("not json"));

    await expect(proposeMapping([{ sourceColumn: "Visitor Credits", sampleValues: ["12"] }])).resolves.toEqual([]);
    expect(logger.warn).toHaveBeenCalledWith("AI mapping unavailable", { outcome: "malformed_response" });
  });

  it("returns an empty list after the timeout without throwing", async () => {
    vi.useFakeTimers();
    process.env.AI_MAPPING_ENABLED = "true";
    process.env.BEDROCK_REGION = "us-east-2";
    process.env.BEDROCK_MODEL_ID = "test-model";
    bedrockMocks.send.mockReturnValue(new Promise(() => undefined));

    const pending = proposeMapping([{ sourceColumn: "Visitor Credits", sampleValues: ["12"] }]);
    await vi.advanceTimersByTimeAsync(6_000);

    await expect(pending).resolves.toEqual([]);
    vi.useRealTimers();
  });
});
