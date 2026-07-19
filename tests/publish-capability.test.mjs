import assert from "node:assert/strict";
import test from "node:test";

import {
  createPublishCapability,
  verifyPublishCapability,
} from "../lib/publish-capability.mjs";

const identity = {
  userId: "maker-123",
  owner: "neuraldrive-inc",
  repositoryName: "plant-helper",
};

test("GitHub upload capabilities are scoped to one user and repository", () => {
  const capability = createPublishCapability(identity, "server-secret", {
    now: 1_000,
    ttlMs: 10_000,
  });
  assert.equal(
    verifyPublishCapability(capability, identity, "server-secret", { now: 5_000 }),
    true,
  );
  assert.equal(
    verifyPublishCapability(
      capability,
      { ...identity, userId: "another-maker" },
      "server-secret",
      { now: 5_000 },
    ),
    false,
  );
  assert.equal(
    verifyPublishCapability(
      capability,
      { ...identity, repositoryName: "someone-elses-project" },
      "server-secret",
      { now: 5_000 },
    ),
    false,
  );
});

test("GitHub upload capabilities reject tampering, expiry, and the wrong secret", () => {
  const capability = createPublishCapability(identity, "server-secret", {
    now: 1_000,
    ttlMs: 10_000,
  });
  assert.equal(
    verifyPublishCapability(`${capability}x`, identity, "server-secret", { now: 5_000 }),
    false,
  );
  assert.equal(
    verifyPublishCapability(capability, identity, "wrong-secret", { now: 5_000 }),
    false,
  );
  assert.equal(
    verifyPublishCapability(capability, identity, "server-secret", { now: 11_001 }),
    false,
  );
});
