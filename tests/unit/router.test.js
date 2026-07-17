import assert from "node:assert/strict";
import test from "node:test";

import * as router from "../../src/makeable/router.js";

const EXPECTED_ROUTES = [
  ["01", "/build/new", "describe"],
  ["02a", "/build/parts/upload", "scan"],
  ["02b", "/build/parts/review", "scan"],
  ["03a", "/build/feasibility/ready", "scan"],
  ["03b", "/build/feasibility/missing", "scan"],
  ["04", "/build/assemble", "build"],
  ["05", "/build/code", "build"],
  ["06a", "/build/test/automatic", "test"],
  ["06b", "/build/test/manual", "test"],
  ["07a", "/build/publish/connect", "publish"],
  ["07b", "/build/publish/success", "publish"],
];

function projectWith(...completedRoutes) {
  return {
    feasibility: { status: "ready" },
    progress: { completedRoutes },
  };
}

test("the router exposes the manifest's exact 11 routes and rail mapping", () => {
  assert.ok(Array.isArray(router.ROUTES), "ROUTES should be exported");
  assert.deepEqual(
    router.ROUTES.map(({ id, path, rail }) => [id, path, rail]),
    EXPECTED_ROUTES,
  );
});

test("direct loads are guarded to the earliest incomplete screen", () => {
  assert.equal(typeof router.resolveRoute, "function", "resolveRoute should be exported");

  assert.equal(router.resolveRoute("/build/code", projectWith()).path, "/build/new");
  assert.equal(
    router.resolveRoute(
      "/build/code",
      projectWith(
        "/build/new",
        "/build/parts/upload",
        "/build/parts/review",
        "/build/feasibility/ready",
        "/build/assemble",
      ),
    ).path,
    "/build/code",
  );
});

test("completed screens remain revisitable while unavailable future screens remain guarded", () => {
  assert.equal(typeof router.resolveRoute, "function", "resolveRoute should be exported");
  const project = projectWith(
    "/build/new",
    "/build/parts/upload",
    "/build/parts/review",
    "/build/feasibility/ready",
    "/build/assemble",
    "/build/code",
  );

  assert.equal(router.resolveRoute("/build/parts/upload", project).path, "/build/parts/upload");
  assert.equal(router.resolveRoute("/build/publish/connect", project).path, "/build/test/automatic");
});

test("the missing-parts branch is the guarded destination until feasibility becomes ready", () => {
  assert.equal(typeof router.resolveRoute, "function", "resolveRoute should be exported");
  const project = {
    feasibility: { status: "missing" },
    progress: {
      completedRoutes: ["/build/new", "/build/parts/upload", "/build/parts/review"],
    },
  };

  assert.equal(
    router.resolveRoute("/build/assemble", project).path,
    "/build/feasibility/missing",
  );
});

test("History API navigation pushes, replaces guarded paths, and handles popstate", () => {
  assert.equal(typeof router.createRouter, "function", "createRouter should be exported");
  const listeners = new Map();
  const calls = [];
  const windowLike = {
    location: { pathname: "/build/code" },
    history: {
      pushState(_state, _title, path) {
        calls.push(["push", path]);
        windowLike.location.pathname = path;
      },
      replaceState(_state, _title, path) {
        calls.push(["replace", path]);
        windowLike.location.pathname = path;
      },
    },
    addEventListener(type, callback) {
      listeners.set(type, callback);
    },
    removeEventListener(type) {
      listeners.delete(type);
    },
  };
  const visited = [];
  let currentProject = projectWith();
  const navigation = router.createRouter({
    window: windowLike,
    getProject: () => currentProject,
    onRoute: ({ path }) => visited.push(path),
  });

  navigation.start();
  currentProject = projectWith("/build/new");
  navigation.navigate("/build/parts/upload");
  windowLike.location.pathname = "/build/publish/success";
  listeners.get("popstate")();
  navigation.stop();

  assert.deepEqual(calls, [
    ["replace", "/build/new"],
    ["push", "/build/parts/upload"],
    ["replace", "/build/parts/upload"],
  ]);
  assert.deepEqual(visited, ["/build/new", "/build/parts/upload", "/build/parts/upload"]);
  assert.equal(listeners.has("popstate"), false);
});
