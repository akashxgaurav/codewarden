import express from "express";
import cors from "cors";
import { apiConfig } from "../config/env.js";
import { logger } from "../lib/logger.js";
import { corsOriginAllowed } from "../services/firebase.service.js";
import { loadRepoLinks } from "../services/github-app.service.js";
import { activity } from "../services/activity.service.js";
import { authenticate } from "./middleware/auth.js";
import { errorHandler, notFoundHandler } from "./middleware/error.js";
import { healthRouter } from "./routes/health.js";
import { reposRouter } from "./routes/repos.js";
import { incidentsRouter } from "./routes/incidents.js";
import { ingestRouter } from "./routes/ingest.js";
import { githubRouter } from "./routes/github.js";
import { activityRouter } from "./routes/activity.js";

export function createApp(): express.Express {
  const app = express();
  app.disable("x-powered-by");

  app.use(
    cors({
      origin(origin, callback) {
        if (corsOriginAllowed(origin)) callback(null, true);
        else callback(new Error(`Origin ${origin} is not allowed`));
      },
      credentials: true,
    }),
  );

  // The webhook signature is computed over the exact bytes GitHub sent.
  app.use("/api/github/webhook", express.raw({ type: "*/*", limit: "2mb" }));
  app.use("/api/ingest", express.json({ limit: "10mb" }));
  app.use(express.json({ limit: "2mb" }));
  app.use(authenticate);

  app.use("/api/health", healthRouter);
  app.use("/api/repos", reposRouter);
  app.use("/api/incidents", incidentsRouter);
  app.use("/api/ingest", ingestRouter);
  app.use("/api/github", githubRouter);
  app.use("/api/activity", activityRouter);

  app.use(notFoundHandler);
  app.use(errorHandler);

  void loadRepoLinks().then(() => {
    activity.publish({ level: "info", category: "system", message: "API is ready" });
  });
  return app;
}
