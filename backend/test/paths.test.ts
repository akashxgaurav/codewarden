import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { removeRepoDir } from "../src/lib/paths.js";

test("removeRepoDir deletes a temporary checkout", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "codewarden-cleanup-"));
  await fs.writeFile(path.join(dir, "file.txt"), "content");

  await removeRepoDir(dir);

  await assert.rejects(() => fs.stat(dir), { code: "ENOENT" });
});
