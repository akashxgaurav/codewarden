import type { AppUser, Incident, Workspace } from "@/types";
import type { AuthAdapter, DatabaseAdapter, Profile } from "./types";

/**
 * Demo mode: an in-browser emulation of Firebase Auth and the Realtime
 * Database.
 *
 * It exists so the product can be developed and demonstrated without a
 * Firebase project. Everything is stored in localStorage and the data of a
 * fresh account is seeded with sample incidents so the dashboard is not empty.
 *
 * It is NOT secure and must never be used for real data.
 */

const USERS_KEY = "codewarden.demo.users";
const SESSION_KEY = "codewarden.demo.session";
const DATA_PREFIX = "codewarden.demo.data.";
const STORAGE_EVENT = "codewarden.demo.changed";

/**
 * The id of the workspace that is seeded for a fresh demo account.
 *
 * It is a placeholder: when the user finishes the onboarding and creates
 * their own workspace, the placeholder and its history are merged into it, so
 * the dashboard is populated with the demo incidents right away.
 */
const DEMO_WORKSPACE_ID = "demo-workspace";

interface DemoUserRecord extends AppUser {
  passwordHash: string;
  createdAt: number;
}

interface DemoData {
  workspaces: Record<string, Workspace>;
  incidents: Record<string, Incident>;
  profile: Profile;
}

type Listener = () => void;

const listeners = new Set<Listener>();

function notify() {
  for (const listener of listeners) {
    listener();
  }
}

if (typeof window !== "undefined") {
  window.addEventListener("storage", (event) => {
    if (event.key === STORAGE_EVENT || event.key?.startsWith(DATA_PREFIX)) {
      notify();
    }
  });
}

function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function writeJson(key: string, value: unknown) {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Storage can be full or blocked, the app still works in memory.
  }
}

function readUsers(): Record<string, DemoUserRecord> {
  return readJson<Record<string, DemoUserRecord>>(USERS_KEY, {});
}

/**
 * The session is stored as a plain string, not as JSON, so the uid can be
 * read back with getItem and used as a key directly.
 */
function readSession(): string | null {
  return window.localStorage.getItem(SESSION_KEY);
}

function writeSession(uid: string) {
  window.localStorage.setItem(SESSION_KEY, uid);
}

function readData(userId: string): DemoData {
  return readJson<DemoData>(`${DATA_PREFIX}${userId}`, {
    workspaces: {},
    incidents: {},
    profile: { displayName: "", activeWorkspaceId: null, onboarded: false },
  });
}

function writeData(userId: string, data: DemoData) {
  writeJson(`${DATA_PREFIX}${userId}`, data);
  writeJson(STORAGE_EVENT, String(Date.now()));
  notify();
}

async function hashPassword(password: string) {
  const bytes = new TextEncoder().encode(password);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function randomId(prefix: string) {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36)}`;
}

function seedData(userId: string, displayName: string): DemoData {
  const now = Date.now();
  const workspaceId = DEMO_WORKSPACE_ID;
  const day = 24 * 60 * 60 * 1000;

  const workspace: Workspace = {
    id: workspaceId,
    name: `${displayName.split(" ")[0] ?? "My"} Platform`,
    repoUrl: "https://github.com/chalk/ansi-styles.git",
    repoDisplayUrl: "https://github.com/chalk/ansi-styles",
    owner: "chalk",
    repo: "ansi-styles",
    branch: "main",
    defaultBranch: "main",
    branches: ["main", "master"],
    cloudWatch: {
      region: "eu-west-1",
      logGroupName: "/aws/lambda/ansi-styles-api",
      filterPattern: "?ERROR ?Exception",
      connected: true,
      connectedAt: now - 20 * day,
    },
    createdAt: now - 30 * day,
    updatedAt: now - day,
  };

  const incidents: Record<string, Incident> = {};

  const samples: {
    title: string;
    status: Incident["status"];
    confidence: Incident["confidence"];
    error: string;
    rootCause: string;
    plan: string | null;
    branch: string | null;
    files: string[];
    hoursAgo: number;
  }[] = [
    {
      title: "TypeError: Cannot read properties of undefined in colorize",
      status: "fixed",
      confidence: "high",
      error:
        "TypeError: Cannot read properties of undefined (reading 'ansiColor')\n    at colorize (index.js:12:20)\n    at Object.<anonymous> (index.js:20:5)",
      rootCause:
        "colorize() dereferences the options object before checking whether it was supplied, so calling the helper without options throws.",
      plan: "Guard the options parameter and default it to an empty object.",
      branch: "fix/guard-options-default",
      files: ["index.js", "index.test.js"],
      hoursAgo: 3,
    },
    {
      title: "AssertionError: expected 'blue' to equal 'bold'",
      status: "fixed",
      confidence: "medium",
      error:
        "AssertionError: expected 'blue' to equal 'bold'\n    at Context.<anonymous> (test/ansi.js:18:22)",
      rootCause:
        "The ansi level 1 modifier was dropped when the style list contained a color, so the modifier was never applied.",
      plan: "Keep modifiers and colors in separate collections before rendering.",
      branch: "fix/modifier-order",
      files: ["index.js"],
      hoursAgo: 9,
    },
    {
      title: "RangeError: Maximum call stack size exceeded",
      status: "not_fixable",
      confidence: "low",
      error:
        "RangeError: Maximum call stack size exceeded\n    at stringify (index.js:44:11)\n    at stringify (index.js:44:11)",
      rootCause:
        "The stack overflow comes from a recursive call inside the caller supplied replacer function, not from this package.",
      plan: null,
      branch: null,
      files: [],
      hoursAgo: 26,
    },
    {
      title: "Error: Cannot find module 'ansi-styles/colors'",
      status: "validation_failed",
      confidence: "medium",
      error: "Error: Cannot find module 'ansi-styles/colors'\n    at Module._resolveFilename (node:internal/modules/cjs/loader:1075:15)",
      rootCause:
        "The export map only exposes ./index and ./package.json, so the deep import used by the caller cannot resolve.",
      plan: "Add the ./colors subpath to the export map.",
      branch: null,
      files: ["package.json"],
      hoursAgo: 31,
    },
    {
      title: "TypeError: ansiColor is not a function",
      status: "fixed",
      confidence: "high",
      error:
        "TypeError: ansiColor is not a function\n    at Object.<anonymous> (index.js:20:5)",
      rootCause:
        "The CommonJS build exported the helper under a different name than the ESM build, so destructuring it produced undefined.",
      plan: "Align the exported names of both builds.",
      branch: "fix/align-export-names",
      files: ["index.js"],
      hoursAgo: 52,
    },
    {
      title: "Error: Unsupported color 'rgb(1,2,3)'",
      status: "not_fixable",
      confidence: "high",
      error: "Error: Unsupported color 'rgb(1,2,3)'\n    at parseColor (index.js:88:5)",
      rootCause:
        "RGB colors are not part of the ANSI escape sequence, so they cannot be supported without a truecolor terminal.",
      plan: null,
      branch: null,
      files: [],
      hoursAgo: 74,
    },
    {
      title: "TypeError: Cannot read properties of null (reading 'open')",
      status: "fixed",
      confidence: "medium",
      error:
        "TypeError: Cannot read properties of null (reading 'open')\n    at open (index.js:31:18)",
      rootCause:
        "open() was called with a null code when the style list was empty, and the empty list was never short circuited.",
      plan: "Return an empty string when no style is requested.",
      branch: "fix/empty-style-guard",
      files: ["index.js", "test/ansi.js"],
      hoursAgo: 98,
    },
    {
      title: "Error: invalid hex color '#gggggg'",
      status: "fixed",
      confidence: "high",
      error: "Error: invalid hex color '#gggggg'\n    at parseHex (index.js:71:9)",
      rootCause:
        "The hex parser accepted any six character string and only failed later, which produced a confusing error far from the input.",
      plan: "Validate the hex digits while parsing.",
      branch: "fix/hex-validation",
      files: ["index.js"],
      hoursAgo: 120,
    },
    {
      title: "AssertionError: expected true to be false",
      status: "fixed",
      confidence: "medium",
      error:
        "AssertionError: expected true to be false\n    at Context.<anonymous> (test/ansi.js:31:9)",
      rootCause:
        "The close sequence was emitted for styles that were never opened, so the reset happened at the wrong time.",
      plan: "Track opened styles and only close what was opened.",
      branch: "fix/close-sequence",
      files: ["index.js"],
      hoursAgo: 145,
    },
    {
      title: "TypeError: styles.map is not a function",
      status: "not_fixable",
      confidence: "low",
      error: "TypeError: styles.map is not a function\n    at Object.<anonymous> (index.js:15:24)",
      rootCause:
        "The caller passes a string where the API expects an array. The type contract of the caller is wrong.",
      plan: null,
      branch: null,
      files: [],
      hoursAgo: 168,
    },
    {
      title: "Error: Cannot read properties of undefined (reading 'level')",
      status: "fixed",
      confidence: "high",
      error:
        "Error: Cannot read properties of undefined (reading 'level')\n    at convert (index.js:52:26)",
      rootCause:
        "convert() read the level from an undefined options object when the caller used the shorthand signature.",
      plan: "Normalise the arguments before reading the level.",
      branch: "fix/normalise-arguments",
      files: ["index.js"],
      hoursAgo: 190,
    },
    {
      title: "AssertionError: expected 3 to equal 4",
      status: "fixed",
      confidence: "medium",
      error: "AssertionError: expected 3 to equal 4\n    at Context.<anonymous> (test/ansi.js:44:11)",
      rootCause:
        "Nested styles were counted once per level instead of once per open sequence.",
      plan: "Count the open sequences of nested styles.",
      branch: "fix/nested-count",
      files: ["index.js"],
      hoursAgo: 214,
    },
    {
      title: "TypeError: Cannot read properties of undefined (reading 'slice')",
      status: "validation_failed",
      confidence: "low",
      error:
        "TypeError: Cannot read properties of undefined (reading 'slice')\n    at slice (index.js:66:28)",
      rootCause:
        "slice() received the truncated string instead of the original one when the input exceeded the limit.",
      plan: "Keep the original string around for the slicing step.",
      branch: null,
      files: ["index.js"],
      hoursAgo: 240,
    },
    {
      title: "Error: EACCES: permission denied, open '/etc/hosts'",
      status: "not_fixable",
      confidence: "high",
      error:
        "Error: EACCES: permission denied, open '/etc/hosts'\n    at openSync (node:fs:596:36)",
      rootCause:
        "The process lacks the permissions required for the path it was given. This is an environment problem, not a code defect.",
      plan: null,
      branch: null,
      files: [],
      hoursAgo: 266,
    },
    {
      title: "TypeError: converter is not a function",
      status: "fixed",
      confidence: "medium",
      error: "TypeError: converter is not a function\n    at Object.<anonymous> (index.js:9:20)",
      rootCause:
        "The converter parameter was shadowed by the imported module of the same name in the module scope.",
      plan: "Rename the local parameter so the import stays reachable.",
      branch: "fix/shadowed-converter",
      files: ["index.js"],
      hoursAgo: 290,
    },
    {
      title: "AssertionError: expected 'ansi' to equal 'ansi16m'",
      status: "fixed",
      confidence: "high",
      error:
        "AssertionError: expected 'ansi' to equal 'ansi16m'\n    at Context.<anonymous> (test/ansi.js:58:7)",
      rootCause:
        "The level was clamped to 1 before the truecolor check, so a truecolor terminal was downgraded.",
      plan: "Check for truecolor support before clamping the level.",
      branch: "fix/truecolor-clamp",
      files: ["index.js"],
      hoursAgo: 310,
    },
  ];

  for (const sample of samples) {
    const id = randomId("inc");
    const createdAt = now - sample.hoursAgo * 60 * 60 * 1000;

    incidents[id] = {
      id,
      workspaceId,
      ownerUid: userId,
      repoUrl: workspace.repoUrl,
      repoDisplayUrl: workspace.repoDisplayUrl,
      branch: workspace.branch,
      title: sample.title,
      errorMessage: sample.error,
      status: sample.status,
      confidence: sample.confidence,
      rootCause: sample.rootCause,
      fixPlan: sample.plan,
      affectedFiles: sample.files,
      regressionTest: {
        path: sample.files.length > 0 ? `test/${sample.files[1] ?? "regression.js"}` : null,
        description: sample.plan ? `Regression test for: ${sample.title}` : null,
      },
      fixBranch: sample.branch,
      commit: sample.branch ? "0".repeat(40) : null,
      pushed: Boolean(sample.branch),
      severity: "UNKNOWN",
      source: "MANUAL",
      incidentId: `cw-${sample.hoursAgo}h`,
      priorsUsed: sample.status === "fixed" ? 1 : 0,
      validationReason:
        sample.status === "fixed"
          ? "The regression test fails on the unfixed code and passes with the fix applied, and the full suite still passes."
          : sample.status === "validation_failed"
            ? "The regression test still failed after applying the proposed fix, so the proposed action does not resolve the issue. The branch was not created."
            : null,
      steps: [],
      createdAt,
      updatedAt: createdAt,
    };
  }

  return {
    workspaces: { [workspaceId]: workspace },
    incidents,
    profile: {
      displayName,
      activeWorkspaceId: workspaceId,
      // The user still goes through the onboarding, the seeded workspace is
      // only a placeholder for the demo data.
      onboarded: false,
    },
  };
}

export const demoAuthAdapter: AuthAdapter = {
  mode: "demo",

  subscribe(listener) {
    const emit = () => {
      const uid = readSession();
      const users = readUsers();
      const record = uid ? users[uid] : undefined;

      listener(record ? toAppUser(record) : null);
    };

    emit();
    listeners.add(emit);

    return () => {
      listeners.delete(emit);
    };
  },

  async signUp({ email, password, displayName }) {
    const users = readUsers();
    const normalised = email.trim().toLowerCase();

    if (Object.values(users).some((user) => user.email === normalised)) {
      throw new Error("An account with this email already exists.");
    }

    const uid = `demo_${randomId("u").replace(/[^a-z0-9]/gi, "")}`;
    const passwordHash = await hashPassword(password);

    const record: DemoUserRecord = {
      uid,
      email: normalised,
      displayName: displayName.trim() || normalised.split("@")[0],
      passwordHash,
      createdAt: Date.now(),
    };

    users[uid] = record;
    writeJson(USERS_KEY, users);
    writeSession(uid);
    writeData(uid, seedData(uid, record.displayName));
    notify();

    return toAppUser(record);
  },

  async signIn({ email, password }) {
    const users = readUsers();
    const normalised = email.trim().toLowerCase();
    const record = Object.values(users).find((user) => user.email === normalised);

    if (!record) {
      throw new Error("No account was found for this email address.");
    }

    const passwordHash = await hashPassword(password);

    if (passwordHash !== record.passwordHash) {
      throw new Error("The password is incorrect.");
    }

    writeSession(record.uid);
    notify();

    return toAppUser(record);
  },

  async signOut() {
    window.localStorage.removeItem(SESSION_KEY);
    notify();
  },

  async updateDisplayName(user, displayName) {
    const users = readUsers();
    const record = users[user.uid];

    if (!record) {
      throw new Error("The signed in user no longer exists.");
    }

    const updated: DemoUserRecord = { ...record, displayName: displayName.trim() };
    users[user.uid] = updated;
    writeJson(USERS_KEY, users);

    const data = readData(user.uid);
    data.profile.displayName = updated.displayName;
    writeData(user.uid, data);

    return toAppUser(updated);
  },

  async getIdToken() {
    return null;
  },
};

export const demoDatabaseAdapter: DatabaseAdapter = {
  subscribeWorkspaces(userId, listener) {
    const emit = () => {
      const data = readData(userId);
      listener(Object.values(data.workspaces).sort((a, b) => a.createdAt - b.createdAt));
    };

    emit();
    listeners.add(emit);

    return () => {
      listeners.delete(emit);
    };
  },

  async saveWorkspace(userId, workspace) {
    const data = readData(userId);
    const existing = Object.values(data.workspaces);
    const placeholder = existing.find((item) => item.id === DEMO_WORKSPACE_ID);

    // The placeholder only survives as long as the user has no workspace of
    // their own. Its history moves to the new workspace.
    if (placeholder && existing.length === 1) {
      for (const [id, incident] of Object.entries(data.incidents)) {
        if (incident.workspaceId === placeholder.id) {
          data.incidents[id] = { ...incident, workspaceId: workspace.id };
        }
      }

      delete data.workspaces[placeholder.id];
    }

    data.workspaces[workspace.id] = workspace;
    writeData(userId, data);
  },

  async deleteWorkspace(userId, workspaceId) {
    const data = readData(userId);

    for (const [id, incident] of Object.entries(data.incidents)) {
      if (incident.workspaceId === workspaceId) {
        delete data.incidents[id];
      }
    }

    delete data.workspaces[workspaceId];

    if (data.profile.activeWorkspaceId === workspaceId) {
      data.profile.activeWorkspaceId = Object.keys(data.workspaces)[0] ?? null;
    }

    writeData(userId, data);
  },

  async setActiveWorkspace(userId, workspaceId) {
    const data = readData(userId);
    data.profile.activeWorkspaceId = workspaceId;
    writeData(userId, data);
  },

  subscribeIncidents(userId, listener) {
    const emit = () => {
      const data = readData(userId);
      listener(
        Object.values(data.incidents).sort((a, b) => b.createdAt - a.createdAt),
      );
    };

    emit();
    listeners.add(emit);

    return () => {
      listeners.delete(emit);
    };
  },

  async saveIncident(userId, incident) {
    const data = readData(userId);
    data.incidents[incident.id] = incident;
    writeData(userId, data);
  },

  async deleteIncident(userId, incidentId) {
    const data = readData(userId);
    delete data.incidents[incidentId];
    writeData(userId, data);
  },

  async readProfile(userId) {
    return readData(userId).profile;
  },

  async writeProfile(userId, patch) {
    const data = readData(userId);
    data.profile = { ...data.profile, ...patch };
    writeData(userId, data);
  },
};

function toAppUser(record: DemoUserRecord): AppUser {
  return {
    uid: record.uid,
    email: record.email,
    displayName: record.displayName,
  };
}
