import assert from "node:assert/strict";
import test from "node:test";

import * as state from "../../src/makeable/state.js";

const COMPLETE_PROJECT = {
  id: "project-1",
  schemaVersion: 1,
  updatedAt: "2026-01-01T00:00:00.000Z",
  idea: "Blink when the room gets dark",
  photo: { imageId: "source" },
  confirmedParts: [{ id: "esp32" }, { id: "ldr" }],
  feasibility: { status: "ready" },
  wiring: { connections: ["GPIO34 -> LDR"] },
  firmware: { source: "void setup() {}" },
  tests: { automatic: "passed", manual: "passed" },
  publish: { repositoryUrl: "https://example.test/project" },
  progress: {
    completedRoutes: [
      "/build/new",
      "/build/parts/upload",
      "/build/parts/review",
      "/build/feasibility/ready",
      "/build/assemble",
      "/build/code",
      "/build/test/automatic",
      "/build/test/manual",
      "/build/publish/connect",
      "/build/publish/success",
    ],
  },
};

function createStorage(initial = {}) {
  const values = new Map(Object.entries(initial));
  return {
    getItem(key) {
      return values.has(key) ? values.get(key) : null;
    },
    setItem(key, value) {
      values.set(key, String(value));
    },
    removeItem(key) {
      values.delete(key);
    },
    dump() {
      return Object.fromEntries(values);
    },
  };
}

test("project snapshots use the versioned Makeable state shape", () => {
  assert.equal(
    typeof state.createProjectSnapshot,
    "function",
    "createProjectSnapshot should be exported",
  );
  const snapshot = state.createProjectSnapshot({
    id: "project-1",
    updatedAt: "2026-07-16T12:00:00.000Z",
  });

  assert.deepEqual(snapshot, {
    id: "project-1",
    schemaVersion: 1,
    updatedAt: "2026-07-16T12:00:00.000Z",
    idea: null,
    photo: null,
    confirmedParts: null,
    feasibility: null,
    wiring: null,
    firmware: null,
    tests: null,
    publish: null,
    progress: { completedRoutes: [] },
  });
});

test("changing a value invalidates only its downstream state and completion", () => {
  assert.equal(typeof state.updateProject, "function", "updateProject should be exported");
  const updated = state.updateProject(
    COMPLETE_PROJECT,
    "confirmedParts",
    [{ id: "esp32" }],
    { now: () => "2026-07-16T12:00:00.000Z" },
  );

  assert.equal(updated.idea, COMPLETE_PROJECT.idea);
  assert.deepEqual(updated.photo, COMPLETE_PROJECT.photo);
  assert.deepEqual(updated.confirmedParts, [{ id: "esp32" }]);
  assert.equal(updated.feasibility, null);
  assert.equal(updated.wiring, null);
  assert.equal(updated.firmware, null);
  assert.equal(updated.tests, null);
  assert.equal(updated.publish, null);
  assert.deepEqual(updated.progress.completedRoutes, [
    "/build/new",
    "/build/parts/upload",
    "/build/parts/review",
  ]);
  assert.equal(updated.updatedAt, "2026-07-16T12:00:00.000Z");
  assert.notEqual(updated, COMPLETE_PROJECT);
});

test("unchanged values preserve downstream work", () => {
  assert.equal(typeof state.updateProject, "function", "updateProject should be exported");
  const unchanged = state.updateProject(
    COMPLETE_PROJECT,
    "firmware",
    { source: "void setup() {}" },
  );

  assert.equal(unchanged, COMPLETE_PROJECT);
});

test("the invalidation chain covers idea, photo, parts, wiring, firmware, tests, and publish", () => {
  assert.ok(state.DOWNSTREAM_FIELDS, "DOWNSTREAM_FIELDS should be exported");
  assert.deepEqual(state.DOWNSTREAM_FIELDS, {
    idea: ["photo", "confirmedParts", "feasibility", "wiring", "firmware", "tests", "publish"],
    photo: ["confirmedParts", "feasibility", "wiring", "firmware", "tests", "publish"],
    confirmedParts: ["feasibility", "wiring", "firmware", "tests", "publish"],
    wiring: ["firmware", "tests", "publish"],
    firmware: ["tests", "publish"],
    tests: ["publish"],
    publish: [],
  });
});

test("the injectable project store persists snapshots and image blobs through its adapter", async () => {
  assert.equal(typeof state.createMemoryAdapter, "function", "createMemoryAdapter should be exported");
  assert.equal(typeof state.createProjectStore, "function", "createProjectStore should be exported");
  const adapter = state.createMemoryAdapter();
  const store = state.createProjectStore({ adapter });
  const image = new Blob(["image bytes"], { type: "image/jpeg" });

  await store.saveProject(COMPLETE_PROJECT);
  await store.saveImage("project-1", "source", image);

  assert.deepEqual(await store.loadProject("project-1"), COMPLETE_PROJECT);
  const loadedImage = await store.loadImage("project-1", "source");
  assert.equal(loadedImage.type, "image/jpeg");
  assert.equal(await loadedImage.text(), "image bytes");
});

test("the project controller loads, replaces, and persists the live snapshot and images", async () => {
  assert.equal(
    typeof state.createProjectController,
    "function",
    "createProjectController should be exported",
  );
  const store = state.createProjectStore({ adapter: state.createMemoryAdapter() });
  await store.saveProject(COMPLETE_PROJECT);
  const controller = state.createProjectController({ store });

  assert.equal(await controller.load("project-1"), COMPLETE_PROJECT);
  const replacement = state.createProjectSnapshot({
    id: "project-2",
    idea: "A replacement project",
    updatedAt: "2026-07-16T12:00:00.000Z",
  });
  await controller.replace(replacement);
  await controller.completeRoute("/build/new", {
    now: () => "2026-07-16T12:01:00.000Z",
  });
  const image = new Blob(["persisted image"], { type: "image/png" });
  await controller.saveImage("source", image);

  assert.equal(controller.current.id, "project-2");
  assert.deepEqual(controller.current.progress.completedRoutes, ["/build/new"]);
  assert.deepEqual(await store.loadProject("project-2"), controller.current);
  assert.equal(await (await store.loadImage("project-2", "source")).text(), "persisted image");
  assert.equal(await (await controller.loadImage("source")).text(), "persisted image");
});

test("legacy localStorage settings migrate to a small, secret-free Makeable record", () => {
  assert.equal(
    typeof state.createSettingsStore,
    "function",
    "createSettingsStore should be exported",
  );
  const storage = createStorage({
    "geckco.settings": JSON.stringify({
      deepgramApiKey: "must-not-migrate",
      githubOwner: "maker",
      openaiModel: "gpt-5.5",
      openaiReasoningModel: "gpt-5.5",
      openaiReasoningEffort: "high",
      arduinoFqbn: "esp32:esp32:esp32",
      giantProjectSnapshot: { must: "not live in localStorage" },
    }),
  });

  const settings = state.createSettingsStore({ storage }).load();

  assert.deepEqual(settings, {
    githubOwner: "maker",
    openaiModel: "gpt-5.5",
    openaiReasoningModel: "gpt-5.5",
    openaiReasoningEffort: "high",
    arduinoFqbn: "esp32:esp32:esp32",
  });
  assert.deepEqual(storage.dump(), {
    "makeable.settings": JSON.stringify(settings),
  });
  assert.doesNotMatch(JSON.stringify(storage.dump()), /must-not-migrate|giantProjectSnapshot/);
});

test("current settings are rewritten with bounded strings and all legacy keys are removed", () => {
  assert.equal(
    typeof state.createSettingsStore,
    "function",
    "createSettingsStore should be exported",
  );
  const oversized = "x".repeat(257);
  const storage = createStorage({
    "makeable.settings": JSON.stringify({
      deepgramApiKey: "must-be-erased",
      githubOwner: "  maker  ",
      openaiModel: oversized,
      openaiReasoningEffort: 42,
      giantProjectSnapshot: { payload: oversized },
    }),
    "geckco.settings": JSON.stringify({
      githubOwner: "legacy-owner",
      openaiModel: "legacy-model",
    }),
    "circuitcodex.settings": JSON.stringify({
      arduinoFqbn: "legacy:fqbn",
    }),
  });

  const settings = state.createSettingsStore({ storage }).load();

  assert.deepEqual(settings, { githubOwner: "maker" });
  assert.deepEqual(storage.dump(), {
    "makeable.settings": JSON.stringify({ githubOwner: "maker" }),
  });
  assert.doesNotMatch(
    JSON.stringify(storage.dump()),
    /must-be-erased|giantProjectSnapshot|legacy-owner|legacy-model|legacy:fqbn/,
  );
});

test("saving settings also removes legacy keys and writes only bounded strings", () => {
  const oversized = "x".repeat(257);
  const storage = createStorage({
    "geckco.settings": JSON.stringify({ deepgramApiKey: "legacy-secret" }),
    "circuitcodex.settings": JSON.stringify({ githubOwner: "legacy-owner" }),
  });

  const settings = state.createSettingsStore({ storage }).save({
    githubOwner: "  maker  ",
    openaiModel: oversized,
    deepgramApiKey: "new-secret",
  });

  assert.deepEqual(settings, { githubOwner: "maker" });
  assert.deepEqual(storage.dump(), {
    "makeable.settings": JSON.stringify({ githubOwner: "maker" }),
  });
});

test("the browser adapter creates separate IndexedDB stores for projects and images", () => {
  assert.equal(
    typeof state.createIndexedDbAdapter,
    "function",
    "createIndexedDbAdapter should be exported",
  );
  const createdStores = [];
  const request = {};
  const indexedDB = {
    open(name, version) {
      assert.equal(name, "makeable");
      assert.equal(version, 1);
      queueMicrotask(() => {
        const database = {
          objectStoreNames: { contains: () => false },
          createObjectStore(storeName) {
            createdStores.push(storeName);
          },
        };
        request.result = database;
        request.onupgradeneeded();
      });
      return request;
    },
  };

  state.createIndexedDbAdapter({ indexedDB });
  assert.deepEqual(createdStores, []);
  return new Promise((resolve) =>
    queueMicrotask(() => {
      assert.deepEqual(createdStores, ["projects", "images"]);
      resolve();
    }),
  );
});
