import { NavLink } from "react-router-dom";
import {
  Activity,
  Bug,
  LayoutDashboard,
  LogOut,
  PlusCircle,
  Radio,
  Settings,
  ShieldCheck,
} from "lucide-react";
import { cn } from "@/lib/cn";
import { useAuth } from "@/context/auth-context";
import { useWorkspace } from "@/context/workspace-context";
import { Logo } from "@/components/ui/Logo";

const NAV_ITEMS = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { to: "/activity", label: "Activity", icon: Radio },
  { to: "/incidents", label: "Error history", icon: Bug },
  { to: "/incidents/new", label: "Report an error", icon: PlusCircle },
  { to: "/settings", label: "Settings", icon: Settings },
];

export function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  const { user, signOut, mode } = useAuth();
  const { workspaces, activeWorkspace, selectWorkspace } = useWorkspace();

  return (
    <div className="flex h-full flex-col gap-6 px-4 py-5">
      <div className="px-2">
        <Logo />
      </div>

      <div className="space-y-1.5">
        <label
          htmlFor="workspace-switcher"
          className="px-2 text-[10px] font-semibold tracking-[0.12em] text-ink-faint uppercase"
        >
          Workspace
        </label>

        <select
          id="workspace-switcher"
          value={activeWorkspace?.id ?? ""}
          onChange={(event) => {
            void selectWorkspace(event.target.value);
            onNavigate?.();
          }}
          className="h-10 w-full rounded-lg border border-line bg-surface-2 px-3 text-sm text-ink focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/25"
        >
          {workspaces.length === 0 ? <option value="">No workspace yet</option> : null}
          {workspaces.map((workspace) => (
            <option key={workspace.id} value={workspace.id}>
              {workspace.name}
            </option>
          ))}
        </select>

        {activeWorkspace ? (
          <div className="mt-2 rounded-lg border border-line bg-surface-2 px-3 py-2">
            <a
              href={activeWorkspace.repoDisplayUrl}
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-1.5 truncate text-xs text-ink-muted hover:text-brand"
            >
              <Activity className="size-3 shrink-0" />
              <span className="truncate">
                {activeWorkspace.owner}/{activeWorkspace.repo}
              </span>
            </a>
            <p className="mt-1 truncate font-mono text-[11px] text-ink-faint">
              branch: {activeWorkspace.branch}
            </p>
          </div>
        ) : null}
      </div>

      <nav className="flex-1 space-y-0.5">
        {NAV_ITEMS.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            onClick={onNavigate}
            className={({ isActive }) =>
              cn(
                "flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-colors",
                isActive
                  ? "bg-surface-3 font-medium text-ink"
                  : "text-ink-muted hover:bg-surface-2 hover:text-ink",
              )
            }
          >
            <item.icon className="size-4 shrink-0" />
            {item.label}
          </NavLink>
        ))}
      </nav>

      <div className="space-y-3 border-t border-line pt-4">
        {mode === "demo" ? (
          <div className="flex items-start gap-2 rounded-lg border border-warning/25 bg-warning-dim/30 px-3 py-2 text-[11px] text-warning">
            <ShieldCheck className="mt-0.5 size-3.5 shrink-0" />
            <span>
              Demo mode. Data is stored in this browser only. Add the Firebase keys to{" "}
              <code className="font-mono">.env</code> to go live.
            </span>
          </div>
        ) : null}

        <div className="flex items-center gap-2.5 rounded-lg px-2 py-1.5">
          <div className="grid size-8 shrink-0 place-items-center rounded-full bg-brand/15 text-xs font-semibold text-brand">
            {(user?.displayName ?? "U").slice(0, 2).toUpperCase()}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-xs font-medium text-ink">{user?.displayName}</p>
            <p className="truncate text-[11px] text-ink-faint">{user?.email}</p>
          </div>
          <button
            type="button"
            onClick={() => void signOut()}
            title="Sign out"
            className="rounded-lg p-1.5 text-ink-faint transition-colors hover:bg-surface-3 hover:text-critical"
          >
            <LogOut className="size-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
