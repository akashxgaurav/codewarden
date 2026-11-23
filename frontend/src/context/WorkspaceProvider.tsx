import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { databaseAdapter } from "@/lib/adapters";
import type { Profile } from "@/lib/adapters";
import { useAuth } from "./auth-context";
import { WorkspaceContext, type WorkspaceContextValue, type WorkspaceInput } from "./workspace-context";
import type { Incident, Workspace } from "@/types";

function createId(prefix: string) {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `${prefix}_${crypto.randomUUID()}`;
  }

  return `${prefix}_${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36)}`;
}

export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [preferredWorkspaceId, setPreferredWorkspaceId] = useState<string | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) {
      return;
    }

    const unsubscribeWorkspaces = databaseAdapter.subscribeWorkspaces(user.uid, (next) => {
      setWorkspaces(next);
      setLoading(false);
    });

    const unsubscribeIncidents = databaseAdapter.subscribeIncidents(user.uid, (next) => {
      setIncidents(next);
    });

    databaseAdapter
      .readProfile(user.uid)
      .then((stored) => {
        setProfile(stored);

        if (stored?.activeWorkspaceId) {
          setPreferredWorkspaceId(stored.activeWorkspaceId);
        }
      })
      .catch(() => undefined);

    return () => {
      unsubscribeWorkspaces();
      unsubscribeIncidents();
    };
  }, [user]);

  const visibleWorkspaces = useMemo(() => (user ? workspaces : []), [user, workspaces]);
  const visibleIncidents = useMemo(() => (user ? incidents : []), [user, incidents]);

  // The selected workspace falls back to the first one when the preferred one
  // was deleted or belongs to another account.
  const activeWorkspace = useMemo(() => {
    const match = visibleWorkspaces.find((workspace) => workspace.id === preferredWorkspaceId);

    return match ?? visibleWorkspaces[0] ?? null;
  }, [visibleWorkspaces, preferredWorkspaceId]);

  const selectWorkspace = useCallback(
    async (workspaceId: string) => {
      setPreferredWorkspaceId(workspaceId);

      if (user) {
        await databaseAdapter.setActiveWorkspace(user.uid, workspaceId).catch(() => undefined);
      }
    },
    [user],
  );

  const createWorkspace = useCallback(
    async (input: WorkspaceInput) => {
      if (!user) {
        throw new Error("You are not signed in.");
      }

      const now = Date.now();

      const workspace: Workspace = {
        id: createId("ws"),
        name: input.name.trim(),
        repoUrl: input.repoUrl,
        repoDisplayUrl: input.displayUrl,
        owner: input.owner,
        repo: input.repo,
        branch: input.branch,
        defaultBranch: input.defaultBranch,
        branches: input.branches,
        cloudWatch: input.cloudWatch ?? null,
        github: input.github ?? null,
        createdAt: now,
        updatedAt: now,
      };

      await databaseAdapter.saveWorkspace(user.uid, workspace);
      await databaseAdapter.setActiveWorkspace(user.uid, workspace.id).catch(() => undefined);
      await databaseAdapter
        .writeProfile(user.uid, { activeWorkspaceId: workspace.id, onboarded: true })
        .catch(() => undefined);

      setPreferredWorkspaceId(workspace.id);
      setProfile((current) => ({
        displayName: current?.displayName ?? "",
        activeWorkspaceId: workspace.id,
        onboarded: true,
      }));

      return workspace;
    },
    [user],
  );

  const updateWorkspace = useCallback(
    async (workspaceId: string, patch: Partial<Workspace>) => {
      if (!user) {
        throw new Error("You are not signed in.");
      }

      const current = workspaces.find((workspace) => workspace.id === workspaceId);

      if (!current) {
        throw new Error("The workspace no longer exists.");
      }

      await databaseAdapter.saveWorkspace(user.uid, {
        ...current,
        ...patch,
        updatedAt: Date.now(),
      });
    },
    [user, workspaces],
  );

  const deleteWorkspace = useCallback(
    async (workspaceId: string) => {
      if (!user) {
        throw new Error("You are not signed in.");
      }

      await databaseAdapter.deleteWorkspace(user.uid, workspaceId);
    },
    [user],
  );

  const saveIncident = useCallback(
    async (incident: Incident) => {
      if (!user) {
        throw new Error("You are not signed in.");
      }

      await databaseAdapter.saveIncident(user.uid, incident);
    },
    [user],
  );

  const deleteIncident = useCallback(
    async (incidentId: string) => {
      if (!user) {
        throw new Error("You are not signed in.");
      }

      await databaseAdapter.deleteIncident(user.uid, incidentId);
    },
    [user],
  );

  const value = useMemo<WorkspaceContextValue>(
    () => ({
      workspaces: visibleWorkspaces,
      incidents: visibleIncidents,
      profile,
      activeWorkspace,
      activeWorkspaceId: activeWorkspace?.id ?? null,
      loading,
      onboardingComplete: profile?.onboarded === true,
      selectWorkspace,
      createWorkspace,
      updateWorkspace,
      deleteWorkspace,
      saveIncident,
      deleteIncident,
    }),
    [
      visibleWorkspaces,
      visibleIncidents,
      profile,
      activeWorkspace,
      loading,
      selectWorkspace,
      createWorkspace,
      updateWorkspace,
      deleteWorkspace,
      saveIncident,
      deleteIncident,
    ],
  );

  return <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>;
}
