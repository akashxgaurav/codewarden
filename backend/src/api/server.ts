import { createApp } from "./app.js";
import { apiConfig, env, ingestConfig, isGithubAppConfigured } from "../config/env.js";
import { isFirebaseConfigured, getFirebaseInitError } from "../services/firebase.service.js";
import { logger } from "../lib/logger.js";

const app = createApp();

app.listen(apiConfig.port, apiConfig.host, () => {
  logger.info("Codewarden 2 API listening", {
    url: `http://${apiConfig.host}:${apiConfig.port}`,
    firebase: isFirebaseConfigured(),
    firebaseError: getFirebaseInitError(),
    githubApp: isGithubAppConfigured(),
    corsOrigins: apiConfig.corsOrigins,
    push: env.CODEWARDEN_PUSH,
    cloudWatchIngest: Boolean(ingestConfig.secret),
  });
});
