import assert from "node:assert/strict";
import test from "node:test";
import {
  CUT_LIST_CORRUPT_STORAGE_KEY,
  CUT_LIST_STORAGE_KEY,
  deserializeCutList,
  parseCutList,
  readCutListFromStorage,
  reorderCutListItem,
  serializeCutList,
  toCreateClipListRequest,
  type CutListItem
} from "./cut-list.ts";
import {
  CUTTER_CURRENT_PROJECT_STORAGE_KEY,
  CUTTER_PROJECTS_CORRUPT_STORAGE_KEY,
  CUTTER_PROJECTS_STORAGE_KEY,
  readCutterProjects,
  writeCutterProjects,
  type CutterProject
} from "./cutter-projects.ts";
import {
  CUT_JOB_PROJECT_INDEX_CORRUPT_STORAGE_KEY,
  CUT_JOB_PROJECT_INDEX_STORAGE_KEY,
  createQueueJobsFromCutList,
  readCutJobProjectIndex,
  writeCutJobProjectIndex
} from "./cut-queue.ts";
import {
  clearCutterLocalCache,
  clearCutterTransientUiState,
  cutterStorageKeyInventory,
  cutterUserDataStorageSnapshot
} from "./cutter-cache.ts";
import {
  buildCutterCrashDiagnostics,
  formatCutterCrashDiagnostics
} from "./crash-recovery.ts";

function memoryStorage(initial: Record<string, string> = {}): Storage {
  const store = new Map(Object.entries(initial));
  return {
    get length() {
      return store.size;
    },
    clear() {
      store.clear();
    },
    getItem(key: string) {
      return store.get(key) ?? null;
    },
    key(index: number) {
      return Array.from(store.keys())[index] ?? null;
    },
    removeItem(key: string) {
      store.delete(key);
    },
    setItem(key: string, value: string) {
      store.set(key, value);
    }
  } satisfies Storage;
}

function cutListItemPayload(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    cut_list_item_id: "cut-1",
    source_video_id: "V000001",
    source_title: "现金流",
    source_relative_path: "经营课/现金流.mp4",
    start_segment_id: "s-001",
    end_segment_id: "s-002",
    begin_ms: 1000,
    end_ms: 3000,
    duration_ms: 2000,
    selected_text: "现金流不是利润。",
    cut_mode: "copy",
    order: 1,
    ...overrides
  };
}

function sampleProject(): CutterProject {
  return {
    project_id: "P-1",
    title: "项目一",
    title_source: "auto",
    status: "active",
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-02T00:00:00.000Z",
    clip_count: 2,
    running_count: 0,
    failed_count: 0,
    searches: [{ query: "现金流", hit_count: 3, searched_at: "2026-01-02T00:00:00.000Z" }]
  };
}

test("deserializeCutList tolerates corrupt JSON, objects and old layouts", () => {
  for (const raw of ["{not-json", '{"items":[]}', "null", "42", '"text"', "[]"]) {
    assert.deepEqual(deserializeCutList(raw), []);
  }
  assert.deepEqual(deserializeCutList(undefined), []);
  assert.deepEqual(deserializeCutList(""), []);
});

test("deserializeCutList keeps valid items and drops invalid entries", () => {
  const valid = cutListItemPayload();
  const legacy = cutListItemPayload({ cut_list_item_id: "legacy-1", order: undefined, cut_mode: undefined, duration_ms: undefined });
  const invalid = cutListItemPayload({ cut_list_item_id: "missing-source", source_video_id: 42 });

  const parsed = deserializeCutList(JSON.stringify([valid, legacy, invalid]));

  assert.equal(parsed.length, 2);
  assert.deepEqual(parsed.map((item) => item.cut_list_item_id), ["cut-1", "legacy-1"]);
  assert.equal(parsed[1]?.cut_mode, "copy");
  assert.equal(parsed[1]?.order, 2);
  assert.equal(parsed[1]?.duration_ms, 2000);
});

test("parseCutList marks corrupt payloads without throwing", () => {
  assert.equal(parseCutList("{not-json").corrupted, true);
  assert.equal(parseCutList('{"items":[]}').corrupted, true);
  assert.equal(parseCutList("null").corrupted, true);
  assert.equal(parseCutList(serializeCutList([{ ...cutListItemPayload() } as unknown as CutListItem])).corrupted, false);
});

test("readCutListFromStorage backs up corrupt payloads and boots with an empty list", () => {
  const corrupt = memoryStorage({ [CUT_LIST_STORAGE_KEY]: "{not-json" });
  assert.deepEqual(readCutListFromStorage(corrupt), []);
  assert.equal(corrupt.getItem(CUT_LIST_CORRUPT_STORAGE_KEY), "{not-json");

  const healthy = memoryStorage({ [CUT_LIST_STORAGE_KEY]: JSON.stringify([cutListItemPayload()]) });
  assert.equal(readCutListFromStorage(healthy).length, 1);
  assert.equal(healthy.getItem(CUT_LIST_CORRUPT_STORAGE_KEY), null);

  const throwing: Storage = {
    ...memoryStorage(),
    getItem() {
      throw new Error("blocked");
    }
  };
  assert.deepEqual(readCutListFromStorage(throwing), []);
  assert.deepEqual(readCutListFromStorage(null), []);
});

test("reordered cut list persists array+payload order and drives queue execution order", () => {
  const list: CutListItem[] = [
    { ...cutListItemPayload({ cut_list_item_id: "cut-a", selected_text: "第一段" }) } as unknown as CutListItem,
    { ...cutListItemPayload({ cut_list_item_id: "cut-b", selected_text: "第二段", order: 2 }) } as unknown as CutListItem,
    { ...cutListItemPayload({ cut_list_item_id: "cut-c", selected_text: "第三段", order: 3 }) } as unknown as CutListItem
  ];
  const reordered = reorderCutListItem(list, "cut-c", 0);
  const storage = memoryStorage();
  storage.setItem(CUT_LIST_STORAGE_KEY, serializeCutList(reordered));

  // The persisted payload is already sorted by the drag order field.
  assert.deepEqual(
    (JSON.parse(storage.getItem(CUT_LIST_STORAGE_KEY) ?? "[]") as Array<Record<string, unknown>>)
      .map((entry) => [entry.cut_list_item_id, entry.order]),
    [
      ["cut-c", 1],
      ["cut-a", 2],
      ["cut-b", 3]
    ]
  );

  // Reading back after a refresh keeps the same order.
  assert.deepEqual(
    readCutListFromStorage(storage).map((cut) => [cut.cut_list_item_id, cut.order]),
    [
      ["cut-c", 1],
      ["cut-a", 2],
      ["cut-b", 3]
    ]
  );

  // Submission payload keeps order: the clip-list items are the execution sequence.
  const request = toCreateClipListRequest({
    libraryId: "lib_main_001",
    title: "待剪清单",
    items: readCutListFromStorage(storage)
  });
  assert.deepEqual(request.items.map((entry) => entry.selected_text), ["第三段", "第一段", "第二段"]);

  const jobs = createQueueJobsFromCutList(readCutListFromStorage(storage), {
    createdAt: "2026-10-29T00:00:00.000Z",
    projectTitle: "排序项目"
  });
  assert.deepEqual(jobs.map((entry) => entry.cut_list_item_id), ["cut-c", "cut-a", "cut-b"]);
  assert.deepEqual(jobs.map((entry) => entry.title), [
    "1-排序项目-现金流",
    "2-排序项目-现金流",
    "3-排序项目-现金流"
  ]);
});

test("readCutterProjects tolerates corrupt JSON and non-array payloads, with backup", () => {
  for (const payload of ["{not-json", '{"projects":[]}', "null"]) {
    const storage = memoryStorage({ [CUTTER_PROJECTS_STORAGE_KEY]: payload });
    assert.deepEqual(readCutterProjects(storage), { projects: [] });
    assert.equal(storage.getItem(CUTTER_PROJECTS_CORRUPT_STORAGE_KEY), payload);
  }
});

test("readCutterProjects normalizes legacy projects and drops a dangling current id", () => {
  const legacyProject = {
    project_id: "P-legacy",
    title: "旧项目",
    created_at: "2026-01-01T00:00:00.000Z"
  };
  const storage = memoryStorage({
    [CUTTER_PROJECTS_STORAGE_KEY]: JSON.stringify([legacyProject]),
    [CUTTER_CURRENT_PROJECT_STORAGE_KEY]: "P-missing"
  });

  const state = readCutterProjects(storage);
  assert.equal(state.projects.length, 1);
  assert.equal(state.projects[0]?.project_id, "P-legacy");
  assert.equal(state.projects[0]?.status, "active");
  assert.equal(state.projects[0]?.updated_at, "2026-01-01T00:00:00.000Z");
  assert.equal(state.projects[0]?.clip_count, 0);
  assert.deepEqual(state.projects[0]?.searches, []);
  assert.equal(state.currentProjectId, undefined);
});

test("cut projects round-trip through storage and tolerate write failures", () => {
  const storage = memoryStorage();
  writeCutterProjects([sampleProject()], "P-1", storage);
  const state = readCutterProjects(storage);
  assert.equal(state.projects.length, 1);
  assert.equal(state.currentProjectId, "P-1");
  assert.deepEqual(state.projects[0]?.searches[0], {
    query: "现金流",
    hit_count: 3,
    searched_at: "2026-01-02T00:00:00.000Z"
  });

  const throwing: Storage = {
    ...memoryStorage(),
    setItem() {
      throw new Error("quota exceeded");
    }
  };
  assert.doesNotThrow(() => writeCutterProjects([sampleProject()], "P-1", throwing));
});

test("readCutJobProjectIndex backs up corrupt payloads and keeps valid mappings", () => {
  const corrupt = memoryStorage({ [CUT_JOB_PROJECT_INDEX_STORAGE_KEY]: "[1,2,3]" });
  assert.deepEqual(readCutJobProjectIndex(corrupt), { jobs: {}, clipLists: {} });
  assert.equal(corrupt.getItem(CUT_JOB_PROJECT_INDEX_CORRUPT_STORAGE_KEY), "[1,2,3]");

  const storage = memoryStorage();
  writeCutJobProjectIndex({ jobs: { "CJ-1": "P-1" }, clipLists: { "CL-1": "P-1" } }, storage);
  assert.deepEqual(readCutJobProjectIndex(storage), {
    jobs: { "CJ-1": "P-1" },
    clipLists: { "CL-1": "P-1" }
  });
});

test("clearCutterTransientUiState removes only UI preferences, never user data or auth", () => {
  const storage = memoryStorage({
    "mixlab:cutter:auth_session": "auth-value",
    "mixlab:cutter:device_id": "device-value",
    "mixlab:cutter:pending_login": "pending-value",
    "mixlab:cutter:appearance_mode": "light",
    "mixlab:cutter:default_cut_mode": "precise",
    [CUTTER_PROJECTS_STORAGE_KEY]: "[]",
    [CUTTER_CURRENT_PROJECT_STORAGE_KEY]: "P-1",
    [CUT_LIST_STORAGE_KEY]: "[]",
    [CUT_JOB_PROJECT_INDEX_STORAGE_KEY]: "{}",
    "other:key": "keep"
  });

  const inventoryBeforeCleanup = cutterStorageKeyInventory(storage);
  const removed = clearCutterTransientUiState(storage);

  assert.deepEqual(removed.sort(), [
    "mixlab:cutter:appearance_mode",
    "mixlab:cutter:default_cut_mode"
  ]);
  assert.equal(storage.getItem("mixlab:cutter:auth_session"), "auth-value");
  assert.equal(storage.getItem("mixlab:cutter:device_id"), "device-value");
  assert.equal(storage.getItem("mixlab:cutter:pending_login"), "pending-value");
  assert.equal(storage.getItem(CUTTER_PROJECTS_STORAGE_KEY), "[]");
  assert.equal(storage.getItem(CUTTER_CURRENT_PROJECT_STORAGE_KEY), "P-1");
  assert.equal(storage.getItem(CUT_LIST_STORAGE_KEY), "[]");
  assert.equal(storage.getItem(CUT_JOB_PROJECT_INDEX_STORAGE_KEY), "{}");
  assert.equal(storage.getItem("other:key"), "keep");
  assert.deepEqual(inventoryBeforeCleanup, [
    "mixlab:cutter:auth_session",
    "mixlab:cutter:device_id",
    "mixlab:cutter:pending_login",
    "mixlab:cutter:appearance_mode",
    "mixlab:cutter:default_cut_mode",
    "mixlab.cutter.projects",
    "mixlab.cutter.currentProjectId",
    "mixlab.cutter.cutList",
    "mixlab.cutter.cutJobProjectIndex"
  ]);
  assert.deepEqual(cutterStorageKeyInventory(storage), [
    "mixlab:cutter:auth_session",
    "mixlab:cutter:device_id",
    "mixlab:cutter:pending_login",
    "mixlab.cutter.projects",
    "mixlab.cutter.currentProjectId",
    "mixlab.cutter.cutList",
    "mixlab.cutter.cutJobProjectIndex"
  ]);
});

test("clearCutterLocalCache only clears UI preferences (CW-07)", () => {
  const storage = memoryStorage({
    "mixlab:cutter:auth_session": "auth-value",
    "mixlab:cutter:device_id": "device-value",
    "mixlab:cutter:appearance_mode": "dark",
    "mixlab:cutter:default_source_filter": "public",
    [CUTTER_PROJECTS_STORAGE_KEY]: JSON.stringify([sampleProject()]),
    [CUTTER_CURRENT_PROJECT_STORAGE_KEY]: "P-1",
    [CUT_LIST_STORAGE_KEY]: "[]",
    [CUT_JOB_PROJECT_INDEX_STORAGE_KEY]: "{}",
    "mixlab.cutter.cutList.corrupt": "{bad-backup"
  });

  const snapshot = clearCutterLocalCache(storage);

  assert.deepEqual(snapshot.keys.sort(), [
    "mixlab:cutter:appearance_mode",
    "mixlab:cutter:default_source_filter"
  ]);
  assert.equal(storage.getItem("mixlab:cutter:appearance_mode"), null);
  assert.equal(storage.getItem("mixlab:cutter:default_source_filter"), null);
  assert.equal(storage.getItem("mixlab:cutter:auth_session"), "auth-value");
  assert.equal(storage.getItem("mixlab:cutter:device_id"), "device-value");
  assert.equal(storage.getItem(CUTTER_PROJECTS_STORAGE_KEY)?.includes("P-1"), true);
  assert.equal(storage.getItem(CUTTER_CURRENT_PROJECT_STORAGE_KEY), "P-1");
  assert.equal(storage.getItem(CUT_LIST_STORAGE_KEY), "[]");
  assert.equal(storage.getItem(CUT_JOB_PROJECT_INDEX_STORAGE_KEY), "{}");
  assert.equal(storage.getItem("mixlab.cutter.cutList.corrupt"), "{bad-backup");

  assert.deepEqual(cutterUserDataStorageSnapshot(storage).keys.sort(), [
    "mixlab.cutter.currentProjectId",
    "mixlab.cutter.cutJobProjectIndex",
    "mixlab.cutter.cutList",
    "mixlab.cutter.projects"
  ]);
});

test("crash diagnostics contain context but only storage key names, never values", () => {
  const diagnostics = buildCutterCrashDiagnostics({
    error: new Error("boom at render"),
    now: "2026-10-27T00:00:00.000Z",
    route: "#/cut-tasks",
    userAgent: "Mozilla/5.0",
    appVersion: "abc123",
    storageKeys: ["mixlab.cutter.projects", "mixlab:cutter:auth_session"]
  });

  assert.equal(diagnostics.error_message, "boom at render");
  assert.equal(diagnostics.error_name, "Error");
  assert.equal(diagnostics.route, "#/cut-tasks");
  assert.equal(diagnostics.schema_version, "cutter-crash-v1");

  const text = formatCutterCrashDiagnostics(diagnostics);
  const reparsed = JSON.parse(text) as Record<string, unknown>;
  assert.deepEqual(reparsed.storage_keys, ["mixlab.cutter.projects", "mixlab:cutter:auth_session"]);
  assert.equal(text.includes("session-token"), false);
});
