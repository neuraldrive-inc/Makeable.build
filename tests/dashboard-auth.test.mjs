import assert from "node:assert/strict";
import test from "node:test";

import {
  clearDashboardSessionCookie,
  createDashboardSessionCookie,
  dashboardAccessConfigured,
  dashboardSessionState,
  verifyDashboardAccessKey,
} from "../lib/dashboard-auth.mjs";

const accessKey = "neuraldrive";
const sessionSecret = "dashboard-session-secret-with-at-least-32-characters";
const now = new Date("2026-07-23T18:00:00.000Z");

function requestWithCookie(cookie) {
  return new Request("https://makeable.build/api/dashboard", {
    headers: { Cookie: cookie.split(";")[0] },
  });
}

test("dashboard access requires strong server-side credentials", () => {
  assert.equal(dashboardAccessConfigured(accessKey, sessionSecret), true);
  assert.equal(dashboardAccessConfigured("short", sessionSecret), false);
  assert.equal(dashboardAccessConfigured(accessKey, "short"), false);
  assert.equal(verifyDashboardAccessKey(accessKey, accessKey), true);
  assert.equal(verifyDashboardAccessKey(`${accessKey}-wrong`, accessKey), false);
});

test("dashboard session cookies are signed, private, and time limited", () => {
  const cookie = createDashboardSessionCookie(sessionSecret, {
    now,
    randomBytesImpl: () => Buffer.alloc(24, 7),
  });
  assert.match(cookie, /^__Host-makeable_dashboard=/);
  assert.match(cookie, /Path=\//);
  assert.match(cookie, /HttpOnly/);
  assert.match(cookie, /Secure/);
  assert.match(cookie, /SameSite=Strict/);

  const state = dashboardSessionState(requestWithCookie(cookie), sessionSecret, {
    now: new Date(now.getTime() + 1_000),
  });
  assert.equal(state.authenticated, true);
  assert.equal(state.state, "valid");
});

test("dashboard sessions reject tampering, expiry, and unexpected secrets", () => {
  const cookie = createDashboardSessionCookie(sessionSecret, {
    now,
    maxAgeSeconds: 60,
    randomBytesImpl: () => Buffer.alloc(24, 11),
  });
  const pair = cookie.split(";")[0];
  const tampered = `${pair.slice(0, -1)}${pair.endsWith("A") ? "B" : "A"}`;

  assert.equal(
    dashboardSessionState(requestWithCookie(tampered), sessionSecret, { now }).authenticated,
    false,
  );
  assert.equal(
    dashboardSessionState(requestWithCookie(cookie), `${sessionSecret}-other`, { now })
      .authenticated,
    false,
  );
  assert.equal(
    dashboardSessionState(requestWithCookie(cookie), sessionSecret, {
      now: new Date(now.getTime() + 61_000),
    }).authenticated,
    false,
  );
});

test("dashboard logout clears the private cookie", () => {
  const cookie = clearDashboardSessionCookie();
  assert.match(cookie, /Max-Age=0/);
  assert.match(cookie, /HttpOnly/);
  assert.match(cookie, /Secure/);
  assert.match(cookie, /SameSite=Strict/);
});
