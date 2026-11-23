import { initializeApp, getApps, type FirebaseApp } from "firebase/app";
import {
  getAuth,
  onAuthStateChanged,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut as firebaseSignOut,
  updateProfile as firebaseUpdateProfile,
  getIdToken,
  type User,
} from "firebase/auth";
import { getDatabase, onValue, ref, set, remove, get, update, type Database } from "firebase/database";
import { firebaseConfig } from "@/lib/env";
import type { AppUser, Incident, Workspace } from "@/types";
import type { AuthAdapter, DatabaseAdapter, Profile } from "./types";

/**
 * Firebase implementation of the storage and authentication adapters.
 *
 * Layout in the Realtime Database:
 *
 *   /users/{uid}/profile                       -> { displayName, activeWorkspaceId, onboarded }
 *   /users/{uid}/workspaces/{workspaceId}      -> Workspace
 *   /users/{uid}/incidents/{incidentId}        -> Incident
 *
 * Scoping everything under the uid means the Realtime Database rules only
 * have to check that the authenticated uid matches the first path segment.
 */

let app: FirebaseApp | null = null;
let database: Database | null = null;

function getFirebaseApp() {
  if (!app) {
    app = getApps()[0] ?? initializeApp(firebaseConfig);
  }

  return app;
}

function getFirebaseDatabase() {
  if (!database) {
    database = getDatabase(getFirebaseApp());
  }

  return database;
}

function toAppUser(user: User): AppUser {
  return {
    uid: user.uid,
    email: user.email ?? "",
    displayName: user.displayName || user.email?.split("@")[0] || "User",
  };
}

export const firebaseAuthAdapter: AuthAdapter = {
  mode: "firebase",

  subscribe(listener) {
    const auth = getAuth(getFirebaseApp());

    return onAuthStateChanged(auth, (user) => {
      listener(user ? toAppUser(user) : null);
    });
  },

  async signUp({ email, password, displayName }) {
    const auth = getAuth(getFirebaseApp());
    const credential = await createUserWithEmailAndPassword(auth, email, password);

    await firebaseUpdateProfile(credential.user, { displayName });

    // The account already exists at this point. If the profile document cannot
    // be written, the account is still usable and the profile is created again
    // with the first workspace, so this must not break the sign up.
    try {
      await set(ref(getFirebaseDatabase(), `users/${credential.user.uid}/profile`), {
        displayName: displayName.trim() || email.split("@")[0],
        activeWorkspaceId: "",
        onboarded: false,
      });
    } catch (error) {
      console.warn("The profile could not be written to the Realtime Database.", error);
    }

    return toAppUser(credential.user);
  },

  async signIn({ email, password }) {
    const auth = getAuth(getFirebaseApp());
    const credential = await signInWithEmailAndPassword(auth, email, password);

    return toAppUser(credential.user);
  },

  async signOut() {
    await firebaseSignOut(getAuth(getFirebaseApp()));
  },

  async updateDisplayName(user, displayName) {
    const auth = getAuth(getFirebaseApp());
    const current = auth.currentUser;

    if (!current) {
      throw new Error("You are not signed in any more.");
    }

    await firebaseUpdateProfile(current, { displayName });

    await set(ref(getFirebaseDatabase(), `users/${user.uid}/profile/displayName`), displayName);

    return { ...user, displayName };
  },

  async getIdToken() {
    const current = getAuth(getFirebaseApp()).currentUser;

    if (!current) {
      return null;
    }

    return getIdToken(current);
  },
};

export const firebaseDatabaseAdapter: DatabaseAdapter = {
  subscribeWorkspaces(userId, listener) {
    const workspacesRef = ref(getFirebaseDatabase(), `users/${userId}/workspaces`);

    return onValue(
      workspacesRef,
      (snapshot) => {
        const value = snapshot.val() ?? {};
        const workspaces = Object.values(value) as Workspace[];

        listener(workspaces.sort((a, b) => a.createdAt - b.createdAt));
      },
      () => listener([]),
    );
  },

  async saveWorkspace(userId, workspace) {
    await set(ref(getFirebaseDatabase(), `users/${userId}/workspaces/${workspace.id}`), workspace);
  },

  async deleteWorkspace(userId, workspaceId) {
    await remove(ref(getFirebaseDatabase(), `users/${userId}/workspaces/${workspaceId}`));
  },

  async setActiveWorkspace(userId, workspaceId) {
    await set(ref(getFirebaseDatabase(), `users/${userId}/profile/activeWorkspaceId`), workspaceId);
  },

  subscribeIncidents(userId, listener) {
    const incidentsRef = ref(getFirebaseDatabase(), `users/${userId}/incidents`);

    return onValue(
      incidentsRef,
      (snapshot) => {
        const value = snapshot.val() ?? {};
        const incidents = Object.values(value) as Incident[];

        listener(incidents.sort((a, b) => b.createdAt - a.createdAt));
      },
      () => listener([]),
    );
  },

  async saveIncident(userId, incident) {
    await set(ref(getFirebaseDatabase(), `users/${userId}/incidents/${incident.id}`), incident);
  },

  async deleteIncident(userId, incidentId) {
    await remove(ref(getFirebaseDatabase(), `users/${userId}/incidents/${incidentId}`));
  },

  async readProfile(userId) {
    const snapshot = await get(ref(getFirebaseDatabase(), `users/${userId}/profile`));

    return snapshot.exists() ? (snapshot.val() as Profile) : null;
  },

  async writeProfile(userId, patch) {
    await update(ref(getFirebaseDatabase(), `users/${userId}/profile`), patch);
  },
};
