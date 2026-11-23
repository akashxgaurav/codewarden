import { Router } from "express";
import {
  assertValidBranchName,
  branchExistsOnRemote,
  repoSummary,
  validateRepoUrl,
} from "../../tools/git.tool.js";
import { findInstallationForRepo, getInstallation, listInstallationRepos, listInstallations } from "../../services/github-app.service.js";
import { HttpError } from "../../lib/errors.js";

export const reposRouter = Router();

function installationIdFrom(value: unknown): number | undefined {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined;
}

reposRouter.post("/validate", async (req, res) => {
  const { repoUrl, installationId } = req.body ?? {};
  if (typeof repoUrl !== "string") throw new HttpError(400, "repoUrl is required");
  const id = installationIdFrom(installationId);
  const summary = await repoSummary(repoUrl, id);
  res.json({ ok: true, ...summary });
});

reposRouter.get("/branches", async (req, res) => {
  if (typeof req.query.repoUrl !== "string") throw new HttpError(400, "repoUrl is required");
  const id = installationIdFrom(req.query.installationId);
  res.json({ ok: true, ...(await repoSummary(req.query.repoUrl, id)) });
});

reposRouter.get("/branch-exists", async (req, res) => {
  const { repoUrl, branch } = req.query;
  if (typeof repoUrl !== "string" || typeof branch !== "string") {
    throw new HttpError(400, "repoUrl and branch are required");
  }
  const parsed = validateRepoUrl(repoUrl);
  const name = assertValidBranchName(branch);
  const id = installationIdFrom(req.query.installationId);
  res.json({ ok: true, exists: await branchExistsOnRemote(parsed, name, id), branch: name });
});

reposRouter.get("/installations", async (_req, res) => {
  res.json({ ok: true, installations: await listInstallations() });
});

reposRouter.get("/installed-repos", async (req, res) => {
  const id = installationIdFrom(req.query.installationId);
  if (!id) throw new HttpError(400, "installationId is required");
  await getInstallation(id);
  res.json({ ok: true, repositories: await listInstallationRepos(id) });
});

reposRouter.get("/installation-for", async (req, res) => {
  const { owner, repo } = req.query;
  if (typeof owner !== "string" || typeof repo !== "string") {
    throw new HttpError(400, "owner and repo are required");
  }
  res.json({ ok: true, installationId: await findInstallationForRepo(owner, repo) });
});
