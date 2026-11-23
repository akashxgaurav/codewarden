import { Router } from "express";
import { isFirebaseConfigured } from "../../services/firebase.service.js";
import { isGithubAppConfigured } from "../../config/env.js";
import { activity } from "../../services/activity.service.js";

export const healthRouter = Router();

healthRouter.get("/", (_req, res) => {
  res.json({
    ok: true,
    service: "codewarden-api",
    version: 2,
    firebase: isFirebaseConfigured(),
    githubApp: isGithubAppConfigured(),
    activity: activity.status(),
    time: new Date().toISOString(),
  });
});
