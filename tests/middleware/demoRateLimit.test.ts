import { describe, expect, it, vi } from "vitest";
import { createDemoRateLimit } from "../../src/middleware/demoRateLimit";
import { HttpError } from "../../src/middleware/errorHandler";

const request = { ip: "203.0.113.10", socket: {} } as never;
const response = {} as never;

describe("createDemoRateLimit", () => {
  it("blocks requests after the configured limit", () => {
    const next = vi.fn();
    const middleware = createDemoRateLimit({ max: 2, windowMs: 60_000, now: () => 1_000 });

    middleware(request, response, next);
    middleware(request, response, next);
    middleware(request, response, next);

    expect(next).toHaveBeenNthCalledWith(1);
    expect(next).toHaveBeenNthCalledWith(2);
    expect(next.mock.calls[2]?.[0]).toMatchObject<HttpError>({
      statusCode: 429,
      code: "TOO_MANY_DEMO_REQUESTS"
    });
  });

  it("starts a new window after the reset time", () => {
    let currentTime = 1_000;
    const next = vi.fn();
    const middleware = createDemoRateLimit({ max: 1, windowMs: 100, now: () => currentTime });

    middleware(request, response, next);
    currentTime = 1_101;
    middleware(request, response, next);

    expect(next).toHaveBeenNthCalledWith(1);
    expect(next).toHaveBeenNthCalledWith(2);
  });
});
