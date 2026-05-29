import type { RequestHandler, Response } from "express";
import { renderGoodbye, type GoodbyeState } from "../templates/goodbye";
import { renderLayout } from "../templates/layout";
import { renderSignedUp, type SignedUpState } from "../templates/signedUp";
import { renderWelcome, type WelcomeState } from "../templates/welcome";

const DEFAULT_RETURN_URL = "https://pooladmin.govenderly.us";

const decodeQueryValue = (value: string): string => {
  const plusDecoded = value.replace(/\+/g, " ");

  try {
    return decodeURIComponent(plusDecoded);
  } catch {
    return plusDecoded;
  }
};

const getQueryString = (value: unknown, fallback = ""): string => {
  const rawValue = Array.isArray(value) ? value[0] : value;

  if (typeof rawValue !== "string") {
    return fallback;
  }

  return decodeQueryValue(rawValue);
};

const getQueryNumber = (value: unknown): number | null => {
  const stringValue = getQueryString(value).trim();

  if (!stringValue) {
    return null;
  }

  const parsed = Number.parseInt(stringValue, 10);
  return Number.isNaN(parsed) ? null : parsed;
};

const getQueryList = (value: unknown): string[] =>
  getQueryString(value)
    .split(",")
    .map((item) => item.trim())
    .filter((item) => item.length > 0);

const getReturnUrl = (): string => process.env.GHL_RETURN_URL ?? DEFAULT_RETURN_URL;

const setMemberPageHeaders = (res: Response): void => {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Content-Type", "text/html; charset=utf-8");
};

const parseWelcomeState = (query: Record<string, unknown>): WelcomeState => {
  const status = getQueryString(query.status).trim().toLowerCase();
  const redirectUrl = getReturnUrl();

  switch (status) {
    case "success":
      return {
        status: "success",
        name: getQueryString(query.name, "Member"),
        checkedIn: getQueryList(query.checked_in),
        passes: getQueryNumber(query.passes),
        redirectUrl
      };
    case "already_checked_in":
      return { status: "already_checked_in", name: getQueryString(query.name, "Member") };
    case "batch_name_unmatched":
      return { status: "batch_name_unmatched", unmatched: getQueryList(query.unmatched) };
    case "not_found":
      return { status: "not_found" };
    case "at_capacity":
      return { status: "at_capacity" };
    case "insufficient_passes":
      return { status: "insufficient_passes", remaining: getQueryNumber(query.remaining) };
    default:
      return { status: "default", redirectUrl };
  }
};

const parseGoodbyeState = (query: Record<string, unknown>): GoodbyeState => {
  const status = getQueryString(query.status).trim().toLowerCase();
  const redirectUrl = getReturnUrl();

  switch (status) {
    case "success":
      return {
        status: "success",
        name: getQueryString(query.name, "Member"),
        signedOut: getQueryList(query.signed_out),
        redirectUrl
      };
    case "not_checked_in":
      return { status: "not_checked_in", name: getQueryString(query.name, "Member") };
    default:
      return { status: "default", redirectUrl };
  }
};

const parseSignedUpState = (query: Record<string, unknown>): SignedUpState => {
  const status = getQueryString(query.status).trim().toLowerCase();

  if (status !== "success") {
    return { status: "error" };
  }

  return {
    status: "success",
    name: getQueryString(query.name, "Member"),
    tier: getQueryString(query.tier),
    members: getQueryList(query.members).length > 0 ? getQueryList(query.members) : getQueryList(query.family_members),
    passes: getQueryNumber(query.passes)
  };
};

export const welcomeHandler: RequestHandler = (req, res) => {
  setMemberPageHeaders(res);

  const page = renderWelcome(parseWelcomeState(req.query));

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

  const page = renderGoodbye(parseGoodbyeState(req.query));

  res.send(
    renderLayout({
      title: page.title,
      body: page.body,
      autoRedirectSeconds: page.autoRedirectSeconds,
      redirectUrl: page.redirectUrl
    })
  );
};

export const signedUpHandler: RequestHandler = (req, res) => {
  setMemberPageHeaders(res);

  const page = renderSignedUp(parseSignedUpState(req.query));

  res.send(renderLayout({ title: page.title, body: page.body }));
};
