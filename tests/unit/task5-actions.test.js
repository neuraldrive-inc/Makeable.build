import assert from "node:assert/strict";
import test from "node:test";

import {
  createRecoverySecret,
  createProjectArtifacts,
  createProjectZip,
  publishProjectArtifacts,
  sharePublishedProject,
  recoverySecretForRepository,
  validateRepositoryName,
} from "../../src/makeable/actions.js";

const RECOVERY_SECRET = "ab".repeat(32);
const PUBLISH_CAPABILITY = "server-issued-capability";

const PROJECT = {
  idea: { text: "Build a self-watering plant" },
  confirmedParts: [
    { id: "board", name: "ESP32 DevKit", role: "Controller", confirmed: true },
    { id: "sensor", name: "Soil sensor", role: "Measures moisture", confirmed: true },
  ],
  feasibility: {
    status: "ready",
    projectTitle: "Self-Watering Plant",
    summary: "Waters a plant when the soil is dry.",
    firmwareSpec: {
      board: "ESP32 DevKit",
      behavior: "Water the plant when the sensor reads dry.",
    },
  },
  wiring: {
    steps: [
      {
        order: 1,
        title: "Connect the sensor",
        instruction: "Connect signal to GPIO 34.",
        check: "The wire is fully seated.",
      },
    ],
    completedSteps: [0],
  },
  firmware: {
    language: "Arduino C++",
    sketch: "void setup() {}\nvoid loop() {}\n",
    notes: "Keep electronics dry.",
    flash: { status: "success", boardName: "ESP32 DevKit" },
  },
  tests: {
    automatic: {
      status: "pass",
      checks: [
        { id: "board", name: "Board responds", status: "pass", detail: "OK" },
        {
          id: "sensor",
          name: "Sensor evidence",
          status: "uncertain",
          detail: "No stable reading",
        },
      ],
    },
    manual: {
      acknowledged: true,
      requestedAction: "Lift the sensor out of the soil.",
      action: "Legacy action that must not win.",
      evaluation: {
        status: "needs_attention",
        observations: ["Water reached the plant slowly."],
      },
    },
  },
};

test("repository names are normalized only when valid and unsafe names are rejected", () => {
  assert.deepEqual(validateRepositoryName(" self-watering-plant "), {
    valid: true,
    value: "self-watering-plant",
    message: "",
  });
  assert.equal(validateRepositoryName("two words").valid, false);
  assert.equal(validateRepositoryName(".hidden").valid, false);
  assert.equal(validateRepositoryName("owner/repo").valid, false);
  assert.equal(validateRepositoryName("x".repeat(101)).valid, false);
});

test("a 256-bit recovery secret is generated from browser crypto", () => {
  const secret = createRecoverySecret({
    getRandomValues(bytes) {
      bytes.fill(0xab);
      return bytes;
    },
  });
  assert.equal(secret, RECOVERY_SECRET);
  assert.match(secret, /^[a-f0-9]{64}$/);
});

test("casing-only repository edits reuse the existing recovery proof", () => {
  const existing = {
    repositoryName: "self-watering-plant",
    recoverySecret: RECOVERY_SECRET,
  };
  assert.equal(
    recoverySecretForRepository(existing, "Self-Watering-Plant", {
      getRandomValues() {
        throw new Error("a new secret must not be generated");
      },
    }),
    RECOVERY_SECRET,
  );
});

test("artifact generation produces the five visible, identical publish/export files", () => {
  const artifacts = createProjectArtifacts(PROJECT);
  assert.deepEqual(
    artifacts.map(({ path }) => path),
    [
      "README.md",
      "build-guide/README.md",
      "code/makeable.ino",
      "parts-list/README.md",
      "test-results/README.md",
    ],
  );
  assert.match(artifacts[0].content, /# Self-Watering Plant/);
  assert.match(artifacts[0].content, /Built with Makeable/);
  assert.equal(artifacts[2].content, PROJECT.firmware.sketch);
  assert.match(artifacts[4].content, /Board responds.*Pass/is);
  assert.match(artifacts[4].content, /Sensor evidence.*Uncertain/is);
  assert.match(artifacts[4].content, /Lift the sensor out of the soil/);
  assert.doesNotMatch(artifacts[4].content, /Legacy action that must not win/);
  assert.match(artifacts[4].content, /Needs attention/);
});

test("mixed-case recovery uses GitHub's canonical repository name for every upload and result", async () => {
  const requests = [];
  const artifacts = createProjectArtifacts(PROJECT);
  const result = await publishProjectArtifacts({
    project: PROJECT,
    repositoryName: "Self-Watering-Plant",
    isPrivate: false,
    configuredOwner: "ray-builds",
    recoverySecret: RECOVERY_SECRET,
    fetchImpl: async (url, options) => {
      requests.push({
        url,
        body: options?.body ? JSON.parse(options.body) : null,
      });
      if (url === "/api/github/repos") {
        assert.equal(requests.at(-1).body.recoverySecret, RECOVERY_SECRET);
        return response({ message: "name already exists" }, 422);
      }
      if (url === "/api/github/repository-recovery") {
        assert.deepEqual(requests.at(-1).body, {
          repo: "Self-Watering-Plant",
          recoverySecret: RECOVERY_SECRET,
        });
        return response({
          owner: "ray-builds",
          name: "self-watering-plant",
          html_url: "https://github.com/ray-builds/self-watering-plant",
          private: true,
          publishCapability: PUBLISH_CAPABILITY,
        });
      }
      return response({ content: { sha: `sha-${requests.length}` } });
    },
  });

  assert.equal(result.repositoryUrl, "https://github.com/ray-builds/self-watering-plant");
  assert.equal(result.repositoryName, "self-watering-plant");
  assert.equal(result.visibility, "private");
  assert.equal(result.recoveredExisting, true);
  assert.equal(requests.length, 2 + artifacts.length);
  assert.deepEqual(
    requests.slice(2).map(({ body }) => body.path),
    artifacts.map(({ path }) => path),
  );
  assert.deepEqual(
    requests.slice(2).map(({ body }) => body.content),
    artifacts.map(({ content }) => content),
  );
  assert.equal(
    requests.slice(2).every(({ body }) => body.repo === "self-watering-plant"),
    true,
  );
  assert.equal(
    requests.slice(2).every(({ body }) => body.capability === PUBLISH_CAPABILITY),
    true,
  );
});

test("an arbitrary GitHub 422 never becomes existing-repository recovery", async () => {
  const calls = [];
  await assert.rejects(
    publishProjectArtifacts({
      project: PROJECT,
      repositoryName: "self-watering-plant",
      configuredOwner: "ray-builds",
      recoverySecret: RECOVERY_SECRET,
      fetchImpl: async (url) => {
        calls.push(url);
        if (url === "/api/github/repos") {
          return response({ message: "Validation Failed" }, 422);
        }
        return response({ error: "Repository was not verified" }, 404);
      },
    }),
    /not verified/i,
  );
  assert.deepEqual(calls, [
    "/api/github/repos",
    "/api/github/repository-recovery",
  ]);
});

test("GitHub create and upload failures are surfaced without claiming success", async () => {
  await assert.rejects(
    publishProjectArtifacts({
      project: PROJECT,
      repositoryName: "self-watering-plant",
      configuredOwner: "ray-builds",
      recoverySecret: RECOVERY_SECRET,
      fetchImpl: async () => response({ message: "Forbidden" }, 403),
    }),
    /Forbidden/,
  );

  let uploads = 0;
  await assert.rejects(
    publishProjectArtifacts({
      project: PROJECT,
      repositoryName: "self-watering-plant",
      configuredOwner: "ray-builds",
      recoverySecret: RECOVERY_SECRET,
      fetchImpl: async (url) => {
        if (url === "/api/github/repos") {
          return response({
            owner: { login: "ray-builds" },
            name: "self-watering-plant",
            html_url: "https://github.com/ray-builds/self-watering-plant",
            private: false,
            publishCapability: PUBLISH_CAPABILITY,
          });
        }
        uploads += 1;
        return uploads === 3
          ? response({ message: "Upload failed" }, 502)
          : response({ content: { sha: `sha-${uploads}` } });
      },
    }),
    /Upload failed/,
  );
  assert.equal(uploads, 3);
});

test("retry after a partial upload verifies the existing repo and safely re-uploads all artifacts", async () => {
  const artifacts = createProjectArtifacts(PROJECT);
  let attempt = 0;
  const uploadedPaths = [];
  const fetchImpl = async (url, options) => {
    if (url === "/api/github/repos") {
      attempt += 1;
      return attempt === 1
        ? response({
            owner: { login: "ray-builds" },
            name: "self-watering-plant",
            html_url: "https://github.com/ray-builds/self-watering-plant",
            private: false,
            publishCapability: PUBLISH_CAPABILITY,
          })
        : response({ message: "already exists" }, 422);
    }
    if (url === "/api/github/repository-recovery") {
      return response({
        owner: "ray-builds",
        name: "self-watering-plant",
        html_url: "https://github.com/ray-builds/self-watering-plant",
        private: false,
        publishCapability: PUBLISH_CAPABILITY,
      });
    }
    const path = JSON.parse(options.body).path;
    uploadedPaths.push([attempt, path]);
    if (attempt === 1 && path === "code/makeable.ino") {
      return response({ message: "temporary failure" }, 503);
    }
    return response({ content: { sha: `${attempt}-${path}` } });
  };

  await assert.rejects(
    publishProjectArtifacts({
      project: PROJECT,
      repositoryName: "self-watering-plant",
      configuredOwner: "ray-builds",
      recoverySecret: RECOVERY_SECRET,
      fetchImpl,
    }),
    /temporary failure/,
  );
  const result = await publishProjectArtifacts({
    project: PROJECT,
    repositoryName: "self-watering-plant",
    configuredOwner: "ray-builds",
    recoverySecret: RECOVERY_SECRET,
    fetchImpl,
  });

  assert.equal(result.recoveredExisting, true);
  assert.deepEqual(
    uploadedPaths.filter(([uploadAttempt]) => uploadAttempt === 2).map(([, path]) => path),
    artifacts.map(({ path }) => path),
  );
});

test("ZIP export stores the exact artifact paths and byte content", async () => {
  const artifacts = createProjectArtifacts(PROJECT);
  const zip = createProjectZip(artifacts);
  const bytes = new Uint8Array(await zip.arrayBuffer());
  const text = new TextDecoder().decode(bytes);

  assert.equal(zip.type, "application/zip");
  assert.equal(bytes[0], 0x50);
  assert.equal(bytes[1], 0x4b);
  for (const artifact of artifacts) {
    assert.equal(text.includes(artifact.path), true);
    assert.equal(text.includes(artifact.content), true);
  }
});

test("project sharing uses Web Share and falls back to the clipboard", async () => {
  const shared = [];
  const copied = [];
  assert.equal(
    await sharePublishedProject({
      repositoryUrl: "https://github.com/ray-builds/self-watering-plant",
      title: "Self-Watering Plant",
      navigatorLike: {
        async share(payload) {
          shared.push(payload);
        },
      },
    }),
    "shared",
  );
  assert.equal(shared[0].url, "https://github.com/ray-builds/self-watering-plant");

  assert.equal(
    await sharePublishedProject({
      repositoryUrl: "https://github.com/ray-builds/self-watering-plant",
      title: "Self-Watering Plant",
      navigatorLike: {
        async share() {
          throw new Error("not allowed");
        },
        clipboard: {
          async writeText(value) {
            copied.push(value);
          },
        },
      },
    }),
    "copied",
  );
  assert.deepEqual(copied, [
    "https://github.com/ray-builds/self-watering-plant",
  ]);
});

test("cancelling the native share sheet does not copy without consent", async () => {
  const copied = [];
  const result = await sharePublishedProject({
    repositoryUrl: "https://github.com/ray-builds/self-watering-plant",
    title: "Self-Watering Plant",
    navigatorLike: {
      async share() {
        throw new DOMException("Share cancelled", "AbortError");
      },
      clipboard: {
        async writeText(value) {
          copied.push(value);
        },
      },
    },
  });

  assert.equal(result, "cancelled");
  assert.deepEqual(copied, []);
});

function response(body, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    async json() {
      return body;
    },
  };
}
