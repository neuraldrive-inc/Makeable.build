import assert from "node:assert/strict";
import test from "node:test";

import {
  createProjectArtifacts,
  createProjectZip,
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
      ],
    },
    manual: {
      acknowledged: true,
      action: "Lift the sensor out of the soil.",
      evaluation: { status: "pass", observations: ["Water reached the plant."] },
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
});

test("GitHub publishing recovers an existing repository and uploads each artifact", async () => {
  const requests = [];
  const artifacts = createProjectArtifacts(PROJECT);
  const result = await publishProjectArtifacts({
    project: PROJECT,
    repositoryName: "self-watering-plant",
    isPrivate: false,
    configuredOwner: "ray-builds",
    fetchImpl: async (url, options) => {
      requests.push({
        url,
        body: JSON.parse(options.body),
      });
      if (url === "/api/github/repos") {
        return response({ message: "name already exists" }, 422);
      }
      return response({ content: { sha: `sha-${requests.length}` } });
    },
  });

  assert.equal(result.repositoryUrl, "https://github.com/ray-builds/self-watering-plant");
  assert.equal(result.recoveredExisting, true);
  assert.equal(requests.length, 1 + artifacts.length);
  assert.deepEqual(
    requests.slice(1).map(({ body }) => body.path),
    artifacts.map(({ path }) => path),
  );
  assert.deepEqual(
    requests.slice(1).map(({ body }) => body.content),
    artifacts.map(({ content }) => content),
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

function response(body, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    async json() {
      return body;
    },
  };
}
