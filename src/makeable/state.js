export const PROJECT_SCHEMA_VERSION = 1;
export const PROJECT_STORE = "projects";
export const IMAGE_STORE = "images";
export const SETTINGS_STORAGE_KEY = "makeable.settings";
export const SETTINGS_VALUE_MAX_LENGTH = 256;
export const LEGACY_SETTINGS_STORAGE_KEYS = Object.freeze([
  "geckco.settings",
  "circuitcodex.settings",
]);

export const DOWNSTREAM_FIELDS = Object.freeze({
  idea: Object.freeze([
    "photo",
    "confirmedParts",
    "feasibility",
    "wiring",
    "firmware",
    "tests",
    "publish",
  ]),
  photo: Object.freeze([
    "confirmedParts",
    "feasibility",
    "wiring",
    "firmware",
    "tests",
    "publish",
  ]),
  confirmedParts: Object.freeze([
    "feasibility",
    "wiring",
    "firmware",
    "tests",
    "publish",
  ]),
  review: Object.freeze([]),
  wiring: Object.freeze(["firmware", "tests", "publish"]),
  firmware: Object.freeze(["tests", "publish"]),
  tests: Object.freeze(["publish"]),
  publishAuthorization: Object.freeze([]),
  publish: Object.freeze([]),
});

const ROUTES_INVALIDATED_BY_FIELD = Object.freeze({
  idea: [
    "/build/parts/upload",
    "/build/parts/review",
    "/build/feasibility/ready",
    "/build/feasibility/missing",
    "/build/assemble",
    "/build/code",
    "/build/test/automatic",
    "/build/test/manual",
    "/build/publish/connect",
    "/build/publish/success",
  ],
  photo: [
    "/build/parts/review",
    "/build/feasibility/ready",
    "/build/feasibility/missing",
    "/build/assemble",
    "/build/code",
    "/build/test/automatic",
    "/build/test/manual",
    "/build/publish/connect",
    "/build/publish/success",
  ],
  confirmedParts: [
    "/build/feasibility/ready",
    "/build/feasibility/missing",
    "/build/assemble",
    "/build/code",
    "/build/test/automatic",
    "/build/test/manual",
    "/build/publish/connect",
    "/build/publish/success",
  ],
  review: [],
  feasibility: [
    "/build/assemble",
    "/build/code",
    "/build/test/automatic",
    "/build/test/manual",
    "/build/publish/connect",
    "/build/publish/success",
  ],
  wiring: [
    "/build/code",
    "/build/test/automatic",
    "/build/test/manual",
    "/build/publish/connect",
    "/build/publish/success",
  ],
  firmware: [
    "/build/test/automatic",
    "/build/test/manual",
    "/build/publish/connect",
    "/build/publish/success",
  ],
  tests: ["/build/publish/connect", "/build/publish/success"],
  publishAuthorization: [],
  publish: [],
});

const SETTINGS_FIELDS = Object.freeze([
  "githubOwner",
  "openaiModel",
  "openaiReasoningModel",
  "openaiReasoningEffort",
  "arduinoFqbn",
]);

export function createProjectSnapshot(overrides = {}) {
  return {
    id: overrides.id || "current",
    schemaVersion: PROJECT_SCHEMA_VERSION,
    updatedAt: overrides.updatedAt || new Date().toISOString(),
    idea: overrides.idea ?? null,
    photo: overrides.photo ?? null,
    confirmedParts: overrides.confirmedParts ?? null,
    review: overrides.review ?? { selectedPartId: null },
    feasibility: overrides.feasibility ?? null,
    wiring: overrides.wiring ?? null,
    firmware: overrides.firmware ?? null,
    tests: overrides.tests ?? null,
    publishAuthorization: overrides.publishAuthorization ?? null,
    publish: overrides.publish ?? null,
    progress: {
      completedRoutes: [...(overrides.progress?.completedRoutes || [])],
    },
  };
}

export function updateProject(project, field, value, options = {}) {
  if (!(field in ROUTES_INVALIDATED_BY_FIELD)) {
    throw new TypeError(`Unknown project field: ${field}`);
  }
  if (valuesEqual(project[field], value)) return project;

  const invalidatedRoutes = new Set(ROUTES_INVALIDATED_BY_FIELD[field]);
  const updated = {
    ...project,
    [field]: value,
    updatedAt: (options.now || (() => new Date().toISOString()))(),
    progress: {
      ...project.progress,
      completedRoutes: (project.progress?.completedRoutes || []).filter(
        (route) => !invalidatedRoutes.has(route),
      ),
    },
  };

  const downstreamFields =
    DOWNSTREAM_FIELDS[field] ||
    (field === "feasibility" ? ["wiring", "firmware", "tests", "publish"] : []);
  for (const downstreamField of downstreamFields) updated[downstreamField] = null;
  return updated;
}

export function markRouteCompleted(project, path, options = {}) {
  const completedRoutes = project.progress?.completedRoutes || [];
  if (completedRoutes.includes(path)) return project;
  return {
    ...project,
    updatedAt: (options.now || (() => new Date().toISOString()))(),
    progress: {
      ...project.progress,
      completedRoutes: [...completedRoutes, path],
    },
  };
}

export function createProjectStore({ adapter } = {}) {
  if (!adapter) throw new TypeError("A persistence adapter is required");
  return Object.freeze({
    saveProject(project) {
      return adapter.put(PROJECT_STORE, project.id, project);
    },
    loadProject(projectId = "current") {
      return adapter.get(PROJECT_STORE, projectId);
    },
    deleteProject(projectId = "current") {
      return adapter.delete(PROJECT_STORE, projectId);
    },
    saveImage(projectId, imageId, blob) {
      return adapter.put(IMAGE_STORE, imageKey(projectId, imageId), blob);
    },
    loadImage(projectId, imageId) {
      return adapter.get(IMAGE_STORE, imageKey(projectId, imageId));
    },
    deleteImage(projectId, imageId) {
      return adapter.delete(IMAGE_STORE, imageKey(projectId, imageId));
    },
  });
}

export function createProjectController({
  store,
  initialProject = createProjectSnapshot(),
} = {}) {
  if (!store) throw new TypeError("A project store is required");
  let current = initialProject;

  const controller = {
    get current() {
      return current;
    },
    async load(projectId = "current") {
      current = (await store.loadProject(projectId)) || createProjectSnapshot({ id: projectId });
      return current;
    },
    async replace(project) {
      current = project;
      await store.saveProject(current);
      return current;
    },
    async update(field, value, options) {
      const updated = updateProject(current, field, value, options);
      if (updated !== current) {
        current = updated;
        await store.saveProject(current);
      }
      return current;
    },
    async completeRoute(path, options) {
      const updated = markRouteCompleted(current, path, options);
      if (updated !== current) {
        current = updated;
        await store.saveProject(current);
      }
      return current;
    },
    saveImage(imageId, blob) {
      return store.saveImage(current.id, imageId, blob);
    },
    loadImage(imageId) {
      return store.loadImage(current.id, imageId);
    },
    deleteImage(imageId) {
      return store.deleteImage(current.id, imageId);
    },
  };
  return Object.freeze(controller);
}

export function createMemoryAdapter() {
  const stores = new Map([
    [PROJECT_STORE, new Map()],
    [IMAGE_STORE, new Map()],
  ]);
  const store = (name) => {
    if (!stores.has(name)) stores.set(name, new Map());
    return stores.get(name);
  };
  return Object.freeze({
    async get(storeName, key) {
      return store(storeName).get(key);
    },
    async put(storeName, key, value) {
      store(storeName).set(key, value);
    },
    async delete(storeName, key) {
      store(storeName).delete(key);
    },
  });
}

export function createIndexedDbAdapter({
  indexedDB = globalThis.indexedDB,
  dbName = "makeable",
  version = PROJECT_SCHEMA_VERSION,
} = {}) {
  if (!indexedDB?.open) throw new TypeError("IndexedDB is unavailable");

  const database = new Promise((resolve, reject) => {
    const request = indexedDB.open(dbName, version);
    request.onupgradeneeded = () => {
      const db = request.result;
      for (const storeName of [PROJECT_STORE, IMAGE_STORE]) {
        if (!db.objectStoreNames.contains(storeName)) db.createObjectStore(storeName);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("Unable to open IndexedDB"));
    request.onblocked = () => reject(new Error("IndexedDB upgrade was blocked"));
  });

  return Object.freeze({
    async get(storeName, key) {
      const db = await database;
      const transaction = db.transaction(storeName, "readonly");
      return requestResult(transaction.objectStore(storeName).get(key));
    },
    async put(storeName, key, value) {
      const db = await database;
      const transaction = db.transaction(storeName, "readwrite");
      transaction.objectStore(storeName).put(value, key);
      await transactionComplete(transaction);
    },
    async delete(storeName, key) {
      const db = await database;
      const transaction = db.transaction(storeName, "readwrite");
      transaction.objectStore(storeName).delete(key);
      await transactionComplete(transaction);
    },
  });
}

export function createSettingsStore({ storage = globalThis.localStorage } = {}) {
  if (!storage) throw new TypeError("localStorage is unavailable");
  return Object.freeze({
    load() {
      const current = readStoredSettings(storage, SETTINGS_STORAGE_KEY);
      let source = current;
      if (!source) {
        for (const legacyKey of LEGACY_SETTINGS_STORAGE_KEYS) {
          source = readStoredSettings(storage, legacyKey);
          if (source) break;
        }
      }
      const sanitized = sanitizeSettings(source || {});
      storage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(sanitized));
      for (const key of LEGACY_SETTINGS_STORAGE_KEYS) storage.removeItem(key);
      return sanitized;
    },
    save(settings) {
      const sanitized = sanitizeSettings(settings);
      storage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(sanitized));
      for (const key of LEGACY_SETTINGS_STORAGE_KEYS) storage.removeItem(key);
      return sanitized;
    },
    clear() {
      storage.removeItem(SETTINGS_STORAGE_KEY);
      for (const key of LEGACY_SETTINGS_STORAGE_KEYS) storage.removeItem(key);
    },
  });
}

function imageKey(projectId, imageId) {
  return `${projectId}:${imageId}`;
}

function valuesEqual(left, right) {
  if (Object.is(left, right)) return true;
  try {
    return JSON.stringify(left) === JSON.stringify(right);
  } catch {
    return false;
  }
}

function sanitizeSettings(settings) {
  const sanitized = {};
  for (const field of SETTINGS_FIELDS) {
    if (typeof settings[field] !== "string") continue;
    const value = settings[field].trim();
    if (!value || value.length > SETTINGS_VALUE_MAX_LENGTH) continue;
    sanitized[field] = value;
  }
  return sanitized;
}

function readStoredSettings(storage, key) {
  const raw = storage.getItem(key);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function requestResult(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("IndexedDB request failed"));
  });
}

function transactionComplete(transaction) {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () =>
      reject(transaction.error || new Error("IndexedDB transaction failed"));
    transaction.onabort = () =>
      reject(transaction.error || new Error("IndexedDB transaction aborted"));
  });
}
