import { describe, expect, it } from "vitest";
import { createApp } from "../src/app";

describe("createApp", () => {
  it("trusts one proxy hop for App Runner forwarded IPs", () => {
    const app = createApp();

    expect(app.get("trust proxy")).toBe(1);
  });
});
