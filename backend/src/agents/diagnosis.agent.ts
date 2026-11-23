import * as z from "zod";
import { createAgent, tool } from "langchain";
import { createRepoTools } from "../tools/repo.tool.js";
import { findSimilarKnowledge, isChromaAvailable } from "../services/chroma/knowledge.js";
import { createThrottleMiddleware, TokenPacer, withRateLimitRetry } from "../llm.js";
import { cliRepoDir } from "../lib/paths.js";
import type { Confidence } from "../types/index.js";

const pacer = new TokenPacer();

export const fixProposalSchema = z.object({
  rootCause: z.string().describe("Precise explanation of the root cause, referencing files, functions and lines."),
  fixable: z.boolean().describe("True only if the defect is in this codebase and can be corrected by editing it."),
  confidence: z.enum(["high", "medium", "low"]).describe("Confidence in the diagnosis."),
  fileChanges: z.array(z.object({
    path: z.string().describe("Repository-relative path of the file to write."),
    content: z.string().describe("The COMPLETE new content of that file."),
    description: z.string().describe("What changed and why."),
  })).describe("Every file that must be written, with full new content."),
  fixPlan: z.string().describe("Short description of the required code change."),
  regressionTestPath: z.string().describe("Repository-relative path of the new regression test."),
  regressionTestContent: z.string().describe("Complete source of the regression test."),
  regressionTestDescription: z.string().describe("What the regression test asserts."),
});

export type FixProposal = z.infer<typeof fixProposalSchema>;

export const SYSTEM_PROMPT = `You are a senior software engineer triaging a production error inside a cloned GitHub repository.

Goal: find the ROOT CAUSE, decide whether it is fixable in THIS codebase, and if so propose the fix plus a regression test.

Rules:
- Read the relevant files before concluding. Cite concrete file paths, function names and line numbers in rootCause.
- Similar past incidents are provided as leads. Treat them as hints to verify, not as the answer; the code may have changed since.
- If the error originates OUTSIDE this repository (third-party bug, infrastructure, misconfiguration, dependency version, or caller misuse in another service), set fixable=false and explain why. Do not invent a fix.
- Do not assume an error is intentional because it comes from a demo, sample, test, or error-named endpoint, or because a comment calls it intentional. Verify the current code and the request that triggered the report.
- If request input reaches repository code and causes an unhandled exception, treat that as a fixable input-handling defect: validate it, return an appropriate client error, or handle the missing value. Reproduce the same request in the regression test.
- The regression test MUST fail against the current code and pass once the fix is applied. Follow the repository's test conventions.
- The regression test must reproduce the EXACT reported failure. If the report shows a strict comparison, assert that exact comparison. Never approximate with a tolerance or rounded comparison.
- regressionTestContent must be the COMPLETE content of the new test file, as raw source to write to disk.
- fileChanges must contain the COMPLETE new content of every modified file, as raw source to write to disk. Never include the regression test file there.
- read_repo_file returns lines prefixed with line numbers for reference. NEVER copy these prefixes into regressionTestContent or fileChanges.content.
- Keep tool call arguments valid JSON and as small as possible: include only necessary files and avoid duplicating content.
- Place the regression test where the project's tests live so the runner discovers it.
- Do not reject an otherwise fixable defect merely because no test framework exists. For a Node.js repository without one, use node:test and include any required package.json test-script change in fileChanges.
- Prefer the smallest possible change. Do not refactor unrelated code.

When finished, call submit_diagnosis with your findings. Do not answer in plain text.`;

export function createDiagnosisAgent(model: unknown, options: { repoDir?: string } = {}) {
  const repoDir = options.repoDir ?? cliRepoDir();
  const repo = createRepoTools(repoDir);

  const listFiles = tool(repo.listRepoFiles, {
    name: "list_repo_files",
    description: "List the repository files (relative paths). Use this first to understand the layout.",
    schema: z.object({}),
  });
  const readFile = tool(
    async ({ path }: { path: string }) => repo.readRepoFile(path),
    {
      name: "read_repo_file",
      description: "Read a repository file with 1-based line numbers for reference. Do not copy line number prefixes into submitted file content.",
      schema: z.object({ path: z.string().describe("Repository-relative path") }),
    },
  );
  const search = tool(
    async ({ query }: { query: string }) => repo.searchRepo(query),
    {
      name: "search_repo",
      description: "Search repository files with a case-insensitive regular expression.",
      schema: z.object({ query: z.string().describe("Case-insensitive regular expression") }),
    },
  );
  const submitDiagnosis = tool(
    async (proposal: FixProposal) => {
      const parsed = fixProposalSchema.safeParse(proposal);
      if (!parsed.success) {
        return `Diagnosis rejected: ${parsed.error.issues.map((issue) => issue.message).join("; ")}`;
      }
      return "Diagnosis recorded.";
    },
    {
      name: "submit_diagnosis",
      description: "Submit your final diagnosis exactly once. Set fixable=false when the defect is not in this codebase.",
      schema: fixProposalSchema,
    },
  );

  return createAgent({
    model: model as never,
    tools: [listFiles, readFile, search, submitDiagnosis],
    systemPrompt: SYSTEM_PROMPT,
    middleware: [createThrottleMiddleware(pacer)],
  });
}

async function gatherPriors(errorReport: string, repoUrl?: string) {
  const availability = await isChromaAvailable();
  if (!availability.available) {
    return { available: false, reason: availability.reason, priors: [] };
  }
  try {
    const priors = await findSimilarKnowledge(errorReport, { nResults: 3, repoId: repoUrl });
    return { available: true, priors };
  } catch (error) {
    return { available: false, reason: error instanceof Error ? error.message : String(error), priors: [] };
  }
}

interface MessageLike {
  tool_calls?: { name?: string; args?: unknown }[];
}

function extractProposal(messages: MessageLike[]): FixProposal | null {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    for (const call of messages[index]?.tool_calls ?? []) {
      if (call.name === "submit_diagnosis") {
        const parsed = fixProposalSchema.safeParse(call.args);
        if (parsed.success) return parsed.data;
      }
    }
  }
  return null;
}

export interface DiagnosisResult {
  proposal: FixProposal | null;
  messages: unknown[];
  repoDir: string;
  priors: Awaited<ReturnType<typeof findSimilarKnowledge>>;
  priorsAvailable: boolean;
}

export async function diagnoseError(
  model: unknown,
  errorReport: string,
  options: { repoDir?: string; repoUrl?: string; extraContext?: string } = {},
): Promise<DiagnosisResult> {
  const repoDir = options.repoDir ?? cliRepoDir();
  const agent = createDiagnosisAgent(model, { repoDir });
  const priorBlock = await gatherPriors(errorReport, options.repoUrl);

  const priorText =
    priorBlock.available && priorBlock.priors.length > 0
      ? [
          "Similar past incidents found in the knowledge base. Treat these as leads to verify, not as the answer:",
          "",
          ...priorBlock.priors.map((prior, index) => {
            const meta = prior.metadata ?? {};
            return [
              `--- prior ${index + 1} (${String(meta.kind ?? "unknown")}${meta.branch ? `, branch ${String(meta.branch)}` : ""}${prior.distance != null ? `, distance ${prior.distance.toFixed(3)}` : ""}) ---`,
              prior.document,
            ].join("\n");
          }),
          "",
        ].join("\n")
      : priorBlock.available
        ? "No similar past incidents were found in the knowledge base.\n\n"
        : `The knowledge base is unavailable (${priorBlock.reason ?? "unknown"}), so investigate from the code alone.\n\n`;

  const userPrompt = [
    "The following error was reported against the cloned repository:",
    "",
    "```",
    errorReport,
    "```",
    options.extraContext ? `\nAdditional context:\n${options.extraContext}` : "",
    "",
    priorText,
    "Investigate the repository and call submit_diagnosis with your findings.",
  ].filter((part) => part !== "").join("\n");

  const result = await withRateLimitRetry(
    () => agent.invoke({ messages: [{ role: "user", content: userPrompt }] }),
    { label: "diagnosis agent" },
  ) as unknown as { messages: MessageLike[] };

  return {
    proposal: extractProposal(result.messages),
    messages: result.messages as unknown[],
    repoDir,
    priors: priorBlock.priors,
    priorsAvailable: priorBlock.available,
  };
}

export function confidenceOf(proposal: FixProposal): Confidence {
  return proposal.confidence;
}
