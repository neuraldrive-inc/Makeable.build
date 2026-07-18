import assert from "node:assert/strict";
import test from "node:test";

import {
  createEmailWaitlistRecord,
  createGoogleAcquisitionResult,
} from "../../src/makeable/acquisition.js";

const NOW = new Date("2026-07-17T20:00:00.000Z");

test("email waitlist signup normalizes one email and adds no extra profile fields", () => {
  const result = createEmailWaitlistRecord(
    { email: "  MAKER@Example.COM " },
    { now: NOW },
  );

  assert.deepEqual(result, {
    ok: true,
    value: {
      email: "maker@example.com",
      source: "email",
      createdAt: "2026-07-17T20:00:00.000Z",
    },
  });
});

test("email waitlist signup rejects malformed addresses and unsupported fields", () => {
  assert.deepEqual(createEmailWaitlistRecord({ email: "not-an-email" }), {
    ok: false,
    status: 400,
    error: "Enter a valid email address.",
  });
  assert.deepEqual(
    createEmailWaitlistRecord({
      email: "maker@example.com",
      organization: "Not collected",
    }),
    {
      ok: false,
      status: 400,
      error: "The waitlist only accepts an email address.",
    },
  );
});

test("verified Google identity creates the same waitlist record with basic profile only", () => {
  const result = createGoogleAcquisitionResult(
    {
      sub: "google-user-123",
      email: "MAKER@example.com",
      email_verified: true,
      name: "Maker Person",
      picture: "https://example.com/avatar.png",
    },
    "waitlist",
    { now: NOW },
  );

  assert.deepEqual(result, {
    ok: true,
    value: {
      intent: "waitlist",
      user: {
        email: "maker@example.com",
        name: "Maker Person",
        picture: "https://example.com/avatar.png",
      },
      record: {
        email: "maker@example.com",
        source: "google",
        createdAt: "2026-07-17T20:00:00.000Z",
        googleSubject: "google-user-123",
        name: "Maker Person",
        picture: "https://example.com/avatar.png",
      },
    },
  });
});

test("verified Google pilot identity can enter the builder without creating a waitlist record", () => {
  const result = createGoogleAcquisitionResult(
    {
      sub: "google-user-456",
      email: "pilot@example.com",
      email_verified: true,
      name: "Pilot Maker",
    },
    "pilot",
    { now: NOW },
  );

  assert.deepEqual(result, {
    ok: true,
    value: {
      intent: "pilot",
      user: {
        email: "pilot@example.com",
        name: "Pilot Maker",
        picture: "",
      },
      next: "/build/new",
    },
  });
});

test("Google acquisition rejects unverified identities and unsupported intents", () => {
  assert.deepEqual(
    createGoogleAcquisitionResult(
      { sub: "1", email: "maker@example.com", email_verified: false },
      "waitlist",
    ),
    {
      ok: false,
      status: 401,
      error: "Google could not verify this email address.",
    },
  );
  assert.deepEqual(
    createGoogleAcquisitionResult(
      { sub: "1", email: "maker@example.com", email_verified: true },
      "admin",
    ),
    {
      ok: false,
      status: 400,
      error: "This Google sign-in destination is not supported.",
    },
  );
});
