import assert from "node:assert/strict";
import test from "node:test";

import {
  createProjectArtifacts,
  publishProjectArtifacts,
  sharePublishedProject,
  validateRepositoryName,
} from "../../src/makeable/actions.js";

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

test("artifact generation publishes four project notes without exposing firmware source", () => {
  const artifacts = createProjectArtifacts(PROJECT);
  assert.deepEqual(
    artifacts.map(({ path }) => path),
    [
      "README.md",
      "build-guide/README.md",
      "parts-list/README.md",
      "test-results/README.md",
    ],
  );
  assert.match(artifacts[0].content, /# Self-Watering Plant/);
  assert.match(artifacts[0].content, /Built with Makeable/);
  assert.match(artifacts[0].content, /software stays inside Makeable/i);
  assert.doesNotMatch(artifacts.map(({ content }) => content).join("\n"), /void setup/);
  assert.match(artifacts[3].content, /Board responds.*Pass/is);
  assert.match(artifacts[3].content, /Sensor evidence.*Uncertain/is);
  assert.match(artifacts[3].content, /Lift the sensor out of the soil/);
  assert.doesNotMatch(artifacts[3].content, /Legacy action that must not win/);
  assert.match(artifacts[3].content, /Needs attention/);
});

test("a newly created repository uses its user-bound capability for every upload", async () => {
  const requests = [];
  const artifacts = createProjectArtifacts(PROJECT);
  const result = await publishProjectArtifacts({
    project: PROJECT,
    repositoryName: "Self-Watering-Plant",
    isPrivate: false,
    configuredOwner: "ray-builds",
    fetchImpl: async (url, options) => {
      requests.push({
        url,
        body: options?.body ? JSON.parse(options.body) : null,
      });
      if (url === "/api/github/repos") {
        return response({
          owner: { login: "ray-builds" },
          name: "Self-Watering-Plant",
          html_url: "https://github.com/ray-builds/Self-Watering-Plant",
          private: false,
          publishCapability: "user-bound-capability",
        }, 201);
      }
      return response({ content: { sha: `sha-${requests.length}` } });
    },
  });

  assert.equal(result.repositoryUrl, "https://github.com/ray-builds/Self-Watering-Plant");
  assert.equal(result.repositoryName, "Self-Watering-Plant");
  assert.equal(result.visibility, "public");
  assert.equal(requests.length, 1 + artifacts.length);
  assert.deepEqual(
    requests.slice(1).map(({ body }) => body.path),
    artifacts.map(({ path }) => path),
  );
  assert.deepEqual(
    requests.slice(1).map(({ body }) => body.content),
    artifacts.map(({ content }) => content),
  );
  assert.equal(
    requests.slice(1).every(({ body }) => body.repo === "Self-Watering-Plant"),
    true,
  );
  assert.equal(
    requests.slice(1).every(({ body }) => body.publishCapability === "user-bound-capability"),
    true,
  );
});

test("an existing repository name fails safely without uploading files", async () => {
  const calls = [];
  await assert.rejects(
    publishProjectArtifacts({
      project: PROJECT,
      repositoryName: "self-watering-plant",
      configuredOwner: "ray-builds",
      fetchImpl: async (url) => {
        calls.push(url);
        return response({ message: "Validation Failed" }, 422);
      },
    }),
    /already in use/,
  );
  assert.deepEqual(calls, ["/api/github/repos"]);
});

test("GitHub create and upload failures are surfaced without claiming success", async () => {
  await assert.rejects(
    publishProjectArtifacts({
      project: PROJECT,
      repositoryName: "self-watering-plant",
      configuredOwner: "ray-builds",
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
      fetchImpl: async (url) => {
        if (url === "/api/github/repos") {
          return response({
            owner: { login: "ray-builds" },
            name: "self-watering-plant",
            html_url: "https://github.com/ray-builds/self-watering-plant",
            private: false,
            publishCapability: "user-bound-capability",
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
