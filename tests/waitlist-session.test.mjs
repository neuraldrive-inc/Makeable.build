import assert from "node:assert/strict";
import test from "node:test";

import {
  WAITLIST_SESSION_COOKIE,
  clearWaitlistSessionCookie,
  createWaitlistSession,
  forgetWaitlistSession,
  resolveWaitlistSession,
  waitlistSessionKey,
  waitlistSessionStoreName,
  waitlistSessionStoreNameForFunctionContext,
} from "../lib/waitlist-session.mjs";
import { waitlistSignupKey } from "../lib/waitlist-storage.mjs";

const signup = {
  email: "maker@example.com",
  source: "google",
  createdAt: "2026-07-20T12:00:00.000Z",
  name: "Maker",
};
const signupKey = waitlistSignupKey(signup.email);

class MemoryStore {
  constructor(values = []) {
    this.values = new Map(values);
  }

  async set(key, value) {
    this.values.set(key, JSON.parse(await value.text()));
    return { modified: true };
  }

  async get(key, options) {
    assert.equal(options.type, "json");
    return this.values.get(key) || null;
  }

  async delete(key) {
    this.values.delete(key);
  }
}

test("browser confirmation stores only an opaque token hash and hardened host cookie", async () => {
  const store = new MemoryStore();
  const now = new Date("2026-07-20T12:00:00.000Z");
  const session = await createWaitlistSession(store, signupKey, {
    now,
    maxAgeSeconds: 1_000,
    randomBytesImpl: (length) => {
      assert.equal(length, 32);
      return Buffer.alloc(length, 7);
    },
  });

  assert.match(session.token, /^[A-Za-z0-9_-]{43}$/);
  assert.equal(store.values.has(waitlistSessionKey(session.token)), true);
  const storedText = JSON.stringify(store.values.get(waitlistSessionKey(session.token)));
  assert.doesNotMatch(storedText, new RegExp(session.token));
  assert.doesNotMatch(storedText, /maker@example\.com|Maker/);
  assert.match(session.cookie, new RegExp(`^${WAITLIST_SESSION_COOKIE}=`));
  assert.match(session.cookie, /; Path=\//);
  assert.match(session.cookie, /; Max-Age=1000/);
  assert.match(session.cookie, /; HttpOnly/);
  assert.match(session.cookie, /; Secure/);
  assert.match(session.cookie, /; SameSite=Strict/);
  assert.doesNotMatch(session.cookie, /Domain=/i);
});

test("production and preview browser confirmations use isolated stores", () => {
  assert.equal(waitlistSessionStoreName("production"), "waitlist-sessions");
  assert.equal(waitlistSessionStoreName("deploy-preview"), "waitlist-sessions-preview");
  assert.equal(waitlistSessionStoreName("branch-deploy"), "waitlist-sessions-preview");
  assert.equal(waitlistSessionStoreName(""), "waitlist-sessions");
  assert.equal(
    waitlistSessionStoreNameForFunctionContext({ deploy: { context: "production" } }),
    "waitlist-sessions",
  );
  assert.equal(
    waitlistSessionStoreNameForFunctionContext({ deploy: { context: "deploy-preview" } }),
    "waitlist-sessions-preview",
  );
});

test("a valid browser confirmation resolves only while its verified signup exists", async () => {
  const sessionStore = new MemoryStore();
  const signupStore = new MemoryStore([[signupKey, signup]]);
  const now = new Date("2026-07-20T12:00:00.000Z");
  const session = await createWaitlistSession(sessionStore, signupKey, {
    now,
    randomBytesImpl: (length) => Buffer.alloc(length, 11),
  });
  const request = new Request("https://makeable.build/api/waitlist/status", {
    headers: { Cookie: `${WAITLIST_SESSION_COOKIE}=${session.token}` },
  });

  assert.deepEqual(
    await resolveWaitlistSession(request, {
      sessionStore,
      signupStore,
      now: new Date("2026-07-21T12:00:00.000Z"),
    }),
    { joined: true, clearCookie: false },
  );

  signupStore.values.delete(signupKey);
  assert.deepEqual(
    await resolveWaitlistSession(request, {
      sessionStore,
      signupStore,
      now: new Date("2026-07-21T12:00:00.000Z"),
    }),
    { joined: false, clearCookie: true },
  );
  assert.equal(sessionStore.values.has(waitlistSessionKey(session.token)), false);
});

test("missing, malformed, expired, and forgotten confirmations never authenticate", async () => {
  const sessionStore = new MemoryStore();
  const signupStore = new MemoryStore([[signupKey, signup]]);
  const noCookie = new Request("https://makeable.build/api/waitlist/status");
  assert.deepEqual(
    await resolveWaitlistSession(noCookie, { sessionStore, signupStore }),
    { joined: false, clearCookie: false },
  );

  const malformed = new Request("https://makeable.build/api/waitlist/status", {
    headers: { Cookie: `${WAITLIST_SESSION_COOKIE}=not-a-token` },
  });
  assert.deepEqual(
    await resolveWaitlistSession(malformed, { sessionStore, signupStore }),
    { joined: false, clearCookie: true },
  );

  const created = await createWaitlistSession(sessionStore, signupKey, {
    now: new Date("2026-07-20T12:00:00.000Z"),
    maxAgeSeconds: 60,
    randomBytesImpl: (length) => Buffer.alloc(length, 13),
  });
  const expired = new Request("https://makeable.build/api/waitlist/status", {
    headers: { Cookie: `${WAITLIST_SESSION_COOKIE}=${created.token}` },
  });
  assert.deepEqual(
    await resolveWaitlistSession(expired, {
      sessionStore,
      signupStore,
      now: new Date("2026-07-20T12:02:00.000Z"),
    }),
    { joined: false, clearCookie: true },
  );
  assert.equal(sessionStore.values.has(waitlistSessionKey(created.token)), false);

  await forgetWaitlistSession(expired, sessionStore);
  assert.equal(sessionStore.values.has(waitlistSessionKey(created.token)), false);
  assert.match(clearWaitlistSessionCookie(), /Max-Age=0/);
});

test("browser confirmation is not reported when Blob read-back fails", async () => {
  const store = new MemoryStore();
  store.get = async () => null;
  await assert.rejects(
    createWaitlistSession(store, signupKey),
    /could not be verified after storage/,
  );
});
