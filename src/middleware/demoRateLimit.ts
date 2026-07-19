import type { RequestHandler } from "express";
import { HttpError } from "./errorHandler";

type Attempt = { count: number; resetAt: number };

export const createDemoRateLimit = (options: {
  max: number;
  windowMs: number;
  now?: () => number;
}): RequestHandler => {
  const attempts = new Map<string, Attempt>();
  const now = options.now ?? Date.now;
  let requestCount = 0;

  return (req, _res, next) => {
    const key = req.ip || req.socket.remoteAddress || "unknown";
    const currentTime = now();
    requestCount += 1;
    if (requestCount % 1_000 === 0) {
      for (const [ip, attempt] of attempts.entries()) {
        if (attempt.resetAt <= currentTime) {
          attempts.delete(ip);
        }
      }
    }
    const current = attempts.get(key);

    if (!current || current.resetAt <= currentTime) {
      attempts.set(key, { count: 1, resetAt: currentTime + options.windowMs });
      next();
      return;
    }

    if (current.count >= options.max) {
      next(new HttpError(429, "TOO_MANY_DEMO_REQUESTS", "Too many demo requests. Please wait a few minutes and try again."));
      return;
    }

    current.count += 1;
    next();
  };
};
