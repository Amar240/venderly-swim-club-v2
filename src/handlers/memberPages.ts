import type { RequestHandler, Response } from "express";
import { renderGoodbye } from "../templates/goodbye";
import { renderLayout } from "../templates/layout";
import { renderSignedUp } from "../templates/signedUp";
import { renderWelcome } from "../templates/welcome";

const getQueryString = (value: unknown, fallback = ""): string => {
  if (typeof value === "string") {
    return value;
  }

  if (Array.isArray(value) && typeof value[0] === "string") {
    return value[0];
  }

  return fallback;
};

const getQueryNumber = (value: unknown): number | null => {
  const stringValue = getQueryString(value);

  if (!stringValue) {
    return null;
  }

  const parsed = Number.parseInt(stringValue, 10);
  return Number.isNaN(parsed) ? null : parsed;
};

const setMemberPageHeaders = (res: Response): void => {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Content-Type", "text/html; charset=utf-8");
};

export const welcomeHandler: RequestHandler = (req, res) => {
  setMemberPageHeaders(res);

  const page = renderWelcome({
    status: getQueryString(req.query.status, "success"),
    name: getQueryString(req.query.name, "Member"),
    tier: getQueryString(req.query.tier),
    passes: getQueryNumber(req.query.passes),
    familyInPool: getQueryNumber(req.query.family_in_pool) ?? 0
  });

  if (page.refreshSeconds) {
    res.setHeader("Refresh", String(page.refreshSeconds));
  }

  res.send(
    renderLayout({
      title: page.title,
      body: page.body,
      autoRedirectSeconds: page.autoRedirectSeconds,
      redirectUrl: page.redirectUrl
    })
  );
};

export const goodbyeHandler: RequestHandler = (req, res) => {
  setMemberPageHeaders(res);

  const page = renderGoodbye({
    status: getQueryString(req.query.status, "success"),
    name: getQueryString(req.query.name, "Member"),
    durationMins: getQueryNumber(req.query.duration)
  });

  res.send(renderLayout({ title: page.title, body: page.body }));
};

export const signedUpHandler: RequestHandler = (req, res) => {
  setMemberPageHeaders(res);

  const familyMembers = getQueryString(req.query.family_members)
    .split(",")
    .map((member) => member.trim())
    .filter((member) => member.length > 0);
  const page = renderSignedUp({
    status: getQueryString(req.query.status, "success"),
    name: getQueryString(req.query.name, "Member"),
    tier: getQueryString(req.query.tier),
    familyMembers,
    passes: getQueryNumber(req.query.passes),
    email: getQueryString(req.query.email)
  });

  res.send(renderLayout({ title: page.title, body: page.body }));
};
