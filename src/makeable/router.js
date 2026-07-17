export const ROUTES = Object.freeze([
  route("01", "/build/new", "describe"),
  route("02a", "/build/parts/upload", "scan"),
  route("02b", "/build/parts/review", "scan"),
  route("03a", "/build/feasibility/ready", "scan"),
  route("03b", "/build/feasibility/missing", "scan"),
  route("04", "/build/assemble", "build"),
  route("05", "/build/code", "build"),
  route("06a", "/build/test/automatic", "test"),
  route("06b", "/build/test/manual", "test"),
  route("07a", "/build/publish/connect", "publish"),
  route("07b", "/build/publish/success", "publish"),
]);

const ROUTES_BY_PATH = new Map(ROUTES.map((entry) => [entry.path, entry]));
const READY_PROGRESSION = Object.freeze([
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
]);
const MISSING_PARTS_PATH = "/build/feasibility/missing";

export function getRoute(pathname) {
  return ROUTES_BY_PATH.get(normalizePath(pathname)) || null;
}

export function resolveRoute(pathname, project = {}) {
  const requested = getRoute(pathname);
  const completed = new Set(project.progress?.completedRoutes || []);
  if (
    requested &&
    routeComesAfterCode(requested.path) &&
    project.firmware?.flash?.status !== "success"
  ) {
    return ROUTES_BY_PATH.get("/build/code");
  }
  if (requested && completed.has(requested.path)) return requested;

  const availablePath = firstIncompletePath(project, completed);
  if (requested?.path === availablePath) return requested;
  return ROUTES_BY_PATH.get(availablePath);
}

export function createRouter({
  window: windowLike = globalThis.window,
  getProject = () => ({}),
  onRoute = () => {},
} = {}) {
  if (!windowLike?.history || !windowLike?.location) {
    throw new TypeError("A window with History API support is required");
  }
  let started = false;

  const emit = (pathname, mode) => {
    const requestedPath = normalizePath(pathname);
    const resolved = resolveRoute(requestedPath, getProject());
    const wasGuarded = resolved.path !== requestedPath;
    if (mode === "start" && wasGuarded) {
      windowLike.history.replaceState(null, "", resolved.path);
    } else if (mode === "navigate") {
      const historyMethod = wasGuarded ? "replaceState" : "pushState";
      windowLike.history[historyMethod](null, "", resolved.path);
    } else if (mode === "replace") {
      windowLike.history.replaceState(null, "", resolved.path);
    } else if (mode === "pop" && wasGuarded) {
      windowLike.history.replaceState(null, "", resolved.path);
    }
    onRoute(resolved);
    return resolved;
  };

  const handlePopState = () => emit(windowLike.location.pathname, "pop");

  return Object.freeze({
    start() {
      if (!started) {
        windowLike.addEventListener("popstate", handlePopState);
        started = true;
      }
      return emit(windowLike.location.pathname, "start");
    },
    navigate(pathname, options = {}) {
      return emit(pathname, options.replace ? "replace" : "navigate");
    },
    stop() {
      if (!started) return;
      windowLike.removeEventListener("popstate", handlePopState);
      started = false;
    },
    get current() {
      return resolveRoute(windowLike.location.pathname, getProject());
    },
  });
}

function firstIncompletePath(project, completed) {
  for (const path of READY_PROGRESSION.slice(0, 3)) {
    if (!completed.has(path)) return path;
  }

  if (project.feasibility?.status === "missing") return MISSING_PARTS_PATH;

  for (const path of READY_PROGRESSION.slice(3)) {
    if (
      path === "/build/test/automatic" &&
      project.firmware?.flash?.status !== "success"
    ) {
      return "/build/code";
    }
    if (!completed.has(path)) return path;
  }
  return READY_PROGRESSION.at(-1);
}

function routeComesAfterCode(path) {
  return READY_PROGRESSION.indexOf(path) >
    READY_PROGRESSION.indexOf("/build/code");
}

function normalizePath(pathname) {
  const path = String(pathname || "/").split(/[?#]/, 1)[0];
  return path.length > 1 ? path.replace(/\/+$/, "") : path;
}

function route(id, path, rail) {
  return Object.freeze({ id, path, rail });
}
