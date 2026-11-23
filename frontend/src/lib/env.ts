/**
 * Runtime configuration.
 *
 * The app reads everything from Vite environment variables. When the Firebase
 * variables are missing the app boots in demo mode, which emulates Firebase
 * Auth and the Realtime Database in the browser so the whole product can be
 * explored before a Firebase project exists.
 */

const env = import.meta.env;

export const firebaseConfig = {
  apiKey: env.VITE_FIREBASE_API_KEY ?? "",
  authDomain: env.VITE_FIREBASE_AUTH_DOMAIN ?? "",
  databaseURL: env.VITE_FIREBASE_DATABASE_URL ?? "",
  projectId: env.VITE_FIREBASE_PROJECT_ID ?? "",
  storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET ?? "",
  appId: env.VITE_FIREBASE_APP_ID ?? "",
};

export const isDemoMode =
  env.VITE_DEMO_MODE === "1" ||
  !firebaseConfig.apiKey ||
  !firebaseConfig.projectId ||
  !firebaseConfig.databaseURL;

export const apiBaseUrl = (env.VITE_API_BASE_URL ?? "http://localhost:3000").replace(/\/+$/, "");

export const appMode = isDemoMode ? "demo" : "firebase";
