export type IncidentStatus =
  | "pending"
  | "running"
  | "fixed"
  | "not_fixable"
  | "validation_failed"
  | "no_diagnosis"
  | "failed";

export type Confidence = "high" | "medium" | "low";
export type IncidentSource = "MANUAL" | "CLOUDWATCH";
export type Severity = "CRITICAL" | "HIGH" | "MEDIUM" | "LOW" | "INFO" | "UNKNOWN";

export interface ValidationStep {
  name: string;
  command?: string;
  passed: boolean;
  exitCode?: number;
  output?: string;
}

export interface ValidationOutcome {
  validated: boolean;
  reason: string;
  steps: ValidationStep[];
  before?: TestRunSummary;
  after?: TestRunSummary;
  full?: TestRunSummary;
}

export interface TestRunSummary {
  command: string;
  passed: boolean;
  exitCode: number;
  durationMs: number;
  output?: string;
}

export interface RegressionTest {
  path: string;
  description: string;
}

export interface CloudWatchConnection {
  region: string;
  logGroupName: string;
  filterPattern: string;
  connected: boolean;
  connectedAt?: string;
}

export interface GitHubInstallation {
  installationId: number;
  account: string;
  accountType: "Organization" | "User";
  suspended: boolean;
  repositorySelection: "all" | "selected";
  htmlUrl: string;
  connectedAt: string;
}

export interface Workspace {
  id: string;
  name: string;
  repoUrl: string;
  repoDisplayUrl: string;
  owner: string;
  repo: string;
  branch: string;
  defaultBranch: string;
  branches: string[];
  cloudWatch?: CloudWatchConnection;
  github?: GitHubInstallation;
  createdAt: string;
  updatedAt: string;
}

export interface Incident {
  id: string;
  workspaceId: string;
  title: string;
  errorMessage: string;
  status: IncidentStatus;
  confidence?: Confidence;
  rootCause?: string;
  fixPlan?: string;
  affectedFiles: string[];
  fixBranch?: string;
  prUrl?: string;
  prNumber?: number;
  pushed: boolean;
  source: IncidentSource;
  severity: Severity;
  regressionTest?: RegressionTest;
  validationReason?: string;
  steps: ValidationStep[];
  priorsUsed?: number;
  createdAt: string;
  updatedAt: string;
}

export interface AnalysisProgress {
  message: string;
  at: string;
}

export type JobStatus = "queued" | "running" | "done" | "failed";

export interface AnalysisJob {
  id: string;
  workspaceId: string;
  status: JobStatus;
  progress: AnalysisProgress[];
  result?: AnalysisResult;
  error?: string;
  meta: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface AnalysisResult {
  status: Exclude<IncidentStatus, "pending" | "running">;
  rootCause?: string;
  confidence?: Confidence;
  fixPlan?: string;
  affectedFiles: string[];
  regressionTest?: RegressionTest;
  branch?: string;
  commit?: string;
  push?: boolean;
  pr?: { url: string; number: number };
  validation?: ValidationOutcome;
  incidentId: string;
  priorsUsed: number;
  steps: ValidationStep[];
  incident?: Incident & { persisted?: boolean };
}

export type ActivityLevel = "info" | "success" | "warning" | "error";

/** A backend event that the dashboard can show while work is happening. */
export interface ActivityEvent {
  id: string;
  at: string;
  level: ActivityLevel;
  category:
    | "analysis"
    | "github"
    | "github-webhook"
    | "ingest"
    | "chroma"
    | "system"
    | "auth";
  message: string;
  ownerUid?: string;
  workspaceId?: string;
  incidentId?: string;
  jobId?: string;
  details?: Record<string, unknown>;
  /** Set while a long-running operation is still in progress. */
  active?: boolean;
}

export interface RepositorySummary {
  repoUrl: string;
  displayUrl: string;
  owner: string;
  repo: string;
  defaultBranch: string;
  branches: string[];
  private: boolean;
  installationId?: number;
}

export interface CloudFormationTemplate {
  template: unknown;
  yaml: string;
  stackName: string;
  logGroupName: string;
  filterPattern: string;
}
