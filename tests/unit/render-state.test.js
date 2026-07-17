import assert from "node:assert/strict";
import test from "node:test";

import { initializeShell } from "../../src/makeable/render.js";

function createStorage() {
  const values = new Map();
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
  };
}

test("bootstrap awaits the persisted project before starting a replaceable live router", async () => {
  const completedProject = {
    id: "current",
    schemaVersion: 1,
    updatedAt: "2026-07-16T12:00:00.000Z",
    feasibility: { status: "ready" },
    progress: { completedRoutes: ["/build/code"] },
  };
  const historyCalls = [];
  const listeners = new Map();
  const windowLike = {
    location: { pathname: "/build/code" },
    localStorage: createStorage(),
    history: {
      pushState(_state, _title, path) {
        historyCalls.push(["push", path]);
        windowLike.location.pathname = path;
      },
      replaceState(_state, _title, path) {
        historyCalls.push(["replace", path]);
        windowLike.location.pathname = path;
      },
    },
    addEventListener(type, listener) {
      listeners.set(type, listener);
    },
    removeEventListener(type) {
      listeners.delete(type);
    },
  };
  const elements = {
    heading: { textContent: "" },
    status: { textContent: "" },
    skip: { addEventListener() {} },
    main: { focus() {} },
  };
  const root = {
    defaultView: windowLike,
    documentElement: { dataset: {} },
    querySelector(selector) {
      return {
        "[data-app-heading]": elements.heading,
        "#appStatus": elements.status,
        ".skip-link": elements.skip,
        "#main-content": elements.main,
      }[selector];
    },
    querySelectorAll() {
      return [];
    },
  };
  let loadFinished = false;
  const saved = [];
  const projectStore = {
    async loadProject() {
      await Promise.resolve();
      loadFinished = true;
      return completedProject;
    },
    async saveProject(project) {
      saved.push(project);
    },
    async saveImage() {},
    async loadImage() {},
    async deleteImage() {},
  };

  const app = await initializeShell(root, { projectStore });

  assert.equal(loadFinished, true);
  assert.equal(typeof app.getProject, "function");
  assert.equal(typeof app.replaceProject, "function");
  assert.equal(typeof app.completeRoute, "function");
  assert.equal(typeof app.saveImage, "function");
  assert.equal(app.getProject(), completedProject);
  assert.deepEqual(historyCalls, []);

  await app.replaceProject({
    ...completedProject,
    idea: "A new current reference",
  });
  assert.equal(app.getProject().idea, "A new current reference");
  assert.equal(saved.at(-1).idea, "A new current reference");
});
