import { describe, expect, it } from "vitest";
import { createRoutes } from "../../src/routes";

type RouterLayer = {
  route?: { path: string };
  regexp?: { toString(): string };
};

describe("createRoutes demo mode", () => {
  it("exposes health but not staff, webhook, or auth surfaces", async () => {
    const router = createRoutes("demo") as unknown as { stack: RouterLayer[] };
    const paths = router.stack.map((layer) => layer.route?.path ?? layer.regexp?.toString() ?? "");

    expect(paths).toContain("/health");
    expect(paths.some((path) => path.includes("api\\/v1"))).toBe(true);
    expect(paths.some((path) => path.includes("webhooks"))).toBe(false);
    expect(paths.some((path) => path.includes("auth"))).toBe(false);
    expect(paths.some((path) => path.includes("dashboard"))).toBe(false);
  });
});
