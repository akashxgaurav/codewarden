import { createContext, useContext } from "react";
import type { CloudWatchConnection, GitHubConnection, Incident, Workspace } from "@/types";
import type { Profile } from "@/lib/adapters";

export interface WorkspaceInput {
  name: string;
  repoUrl: string;
  displayUrl: string;
  owner: string;
  repo: string;
  branch: string;
  defaultBranch: string | null;
  branches: string[];
  /** The CloudWatch log source of the workspace, when one is configured. */
  cloudWatch?: CloudWatchConnection | null;
  /** The GitHub App installation that grants access to the repository. */
  github?: GitHubConnection | null;
}

export interface WorkspaceContextValue {
  workspaces: Workspace[];
  incidents: Incident[];
  profile: Profile | null;
  activeWorkspace: Workspace | null;
  activeWorkspaceId: string | null;
  loading: boolean;
  /** False until the user finished the onboarding. */
  onboardingComplete: boolean;
  selectWorkspace(workspaceId: string): Promise<void>;
  createWorkspace(input: WorkspaceInput): Promise<Workspace>;
  updateWorkspace(workspaceId: string, patch: Partial<Workspace>): Promise<void>;
  deleteWorkspace(workspaceId: string): Promise<void>;
  saveIncident(incident: Incident): Promise<void>;
  deleteIncident(incidentId: string): Promise<void>;
}

export const WorkspaceContext = createContext<WorkspaceContextValue | null>(null);

export function useWorkspace() {
  const context = useContext(WorkspaceContext);

  if (!context) {
    throw new Error("useWorkspace must be used inside a WorkspaceProvider.");
  }

  return context;
}
