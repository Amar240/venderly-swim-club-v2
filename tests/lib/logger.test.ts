import { afterEach, describe, expect, it, vi } from "vitest";
import { logger } from "../../src/lib/logger";

describe("logger", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("writes info logs to console.log", () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);

    logger.info("hello", { clubId: "club_1" });

    expect(log).toHaveBeenCalledOnce();
    expect(JSON.parse(String(log.mock.calls[0]?.[0]))).toMatchObject({
      level: "info",
      message: "hello",
      clubId: "club_1"
    });
  });

  it("writes warnings to console.warn", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);

    logger.warn("careful");

    expect(warn).toHaveBeenCalledOnce();
  });

  it("writes errors to console.error", () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);

    logger.error("boom");

    expect(error).toHaveBeenCalledOnce();
  });
});
