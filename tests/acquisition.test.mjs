import assert from "node:assert/strict";
import test from "node:test";

import {
  createEmailWaitlistRecord,
  createGoogleWaitlistResult,
} from "../lib/acquisition.mjs";

test("email waitlist records are normalized and reject extra fields", () => {
  const now = new Date("2026-07-20T12:00:00.000Z");
  assert.deepEqual(
    createEmailWaitlistRecord({ email: "  Maker@Example.COM " }, { now }),
    {
      ok: true,
      value: {
        email: "maker@example.com",
        source: "email",
        createdAt: now.toISOString(),
      },
    },
  );
  assert.equal(createEmailWaitlistRecord({ email: "bad", role: "admin" }).status, 400);
  assert.equal(createEmailWaitlistRecord({ email: "not-an-email" }).status, 400);
});

test("Google waitlist records require a verified identity and waitlist intent", () => {
  const now = new Date("2026-07-20T12:00:00.000Z");
  const identity = {
    email: "Maker@Example.com",
    email_verified: true,
    sub: "google-subject",
    name: "Maker",
    picture: "https://example.com/avatar.png",
  };
  const result = createGoogleWaitlistResult(identity, "waitlist", { now });

  assert.equal(result.ok, true);
  assert.deepEqual(result.value.user, {
    email: "maker@example.com",
    name: "Maker",
    picture: "https://example.com/avatar.png",
  });
  assert.equal(result.value.record.googleSubject, "google-subject");
  assert.equal(result.value.record.createdAt, now.toISOString());
  assert.equal(createGoogleWaitlistResult(identity, "pilot").status, 400);
  assert.equal(
    createGoogleWaitlistResult({ ...identity, email_verified: false }, "waitlist").status,
    401,
  );
});

test("Google profile images must use HTTPS", () => {
  const result = createGoogleWaitlistResult(
    {
      email: "maker@example.com",
      email_verified: true,
      sub: "google-subject",
      picture: "http://example.com/avatar.png",
    },
    "waitlist",
  );
  assert.equal(result.ok, true);
  assert.equal(result.value.user.picture, "");
});
