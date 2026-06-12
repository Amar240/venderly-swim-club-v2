import type { Express } from "express";

let cachedApp: Express | undefined;

/**
 * Returns the Express app for supertest, created lazily so that the
 * integration setup file (which swaps DATABASE_URL for DATABASE_URL_TEST)
 * runs before any application module is loaded.
 */
export const getTestApp = async (): Promise<Express> => {
  if (!cachedApp) {
    const { createApp } = await import("../../src/app");
    cachedApp = createApp();
  }

  return cachedApp;
};
