import { useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Bug, ChevronLeft, ChevronRight, Filter, PlusCircle, Search } from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input, Select } from "@/components/ui/Field";
import { EmptyState, SkeletonRows } from "@/components/ui/EmptyState";
import { IncidentTable } from "@/components/incidents/IncidentTable";
import { IncidentDetail } from "@/components/incidents/IncidentDetail";
import { useWorkspace } from "@/context/workspace-context";
import { useNow } from "@/hooks/useNow";
import type { Incident, IncidentStatus } from "@/types";

const PAGE_SIZE = 10;

const STATUS_OPTIONS: { value: IncidentStatus | "all"; label: string }[] = [
  { value: "all", label: "All statuses" },
  { value: "fixed", label: "Fixed" },
  { value: "not_fixable", label: "Not fixable" },
  { value: "validation_failed", label: "Validation failed" },
  { value: "no_diagnosis", label: "No diagnosis" },
  { value: "pending", label: "In progress" },
  { value: "failed", label: "Failed" },
];

const RANGE_OPTIONS = [
  { value: "all", label: "All time" },
  { value: "1", label: "Today" },
  { value: "7", label: "Last 7 days" },
  { value: "30", label: "Last 30 days" },
];

export function IncidentsPage() {
  const { incidents, activeWorkspace, workspaces, deleteIncident, loading } = useWorkspace();
  const [searchParams, setSearchParams] = useSearchParams();

  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<IncidentStatus | "all">("all");
  const [range, setRange] = useState("all");
  const [scopeOverride, setScopeOverride] = useState<string | null>(null);
  const [page, setPage] = useState(1);

  const now = useNow();

  const scope = scopeOverride ?? activeWorkspace?.id ?? "all";

  const selectedId = searchParams.get("incident");
  const selected = incidents.find((incident) => incident.id === selectedId) ?? null;

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const cutoff = range === "all" ? null : now - Number(range) * 24 * 60 * 60 * 1000;

    return incidents.filter((incident) => {
      if (scope !== "all" && incident.workspaceId !== scope) {
        return false;
      }

      if (status !== "all" && incident.status !== status) {
        return false;
      }

      if (cutoff && incident.createdAt < cutoff) {
        return false;
      }

      if (needle) {
        const haystack = `${incident.title} ${incident.errorMessage} ${incident.rootCause ?? ""} ${incident.fixBranch ?? ""}`;
        if (!haystack.toLowerCase().includes(needle)) {
          return false;
        }
      }

      return true;
    });
  }, [incidents, query, status, range, scope, now]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount);
  const visible = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  function openIncident(incident: Incident) {
    const next = new URLSearchParams(searchParams);
    next.set("incident", incident.id);
    setSearchParams(next, { replace: true });
  }

  function closeIncident() {
    const next = new URLSearchParams(searchParams);
    next.delete("incident");
    setSearchParams(next, { replace: true });
  }

  async function removeIncident(incident: Incident) {
    if (!window.confirm("Remove this error from the history?")) {
      return;
    }

    await deleteIncident(incident.id);
    closeIncident();
  }

  return (
    <AppShell
      title="Error history"
      description="Every error reported for your workspaces, newest first."
      actions={
        <Link to="/incidents/new">
          <Button size="sm">
            <PlusCircle className="size-4" />
            Report error
          </Button>
        </Link>
      }
    >
      <div className="mx-auto max-w-6xl space-y-4">
        <Card className="p-4">
          <div className="grid gap-3 md:grid-cols-[1.4fr_1fr_1fr_1fr]">
            <div className="relative">
              <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-ink-faint" />
              <Input
                value={query}
                onChange={(event) => {
                  setQuery(event.target.value);
                  setPage(1);
                }}
                placeholder="Search errors, stack traces or branches"
                className="pl-9"
                aria-label="Search errors"
              />
            </div>

            <Select
              value={scope}
              onChange={(event) => {
                setScopeOverride(event.target.value);
                setPage(1);
              }}
              aria-label="Workspace"
            >
              <option value="all">All workspaces</option>
              {workspaces.map((workspace) => (
                <option key={workspace.id} value={workspace.id}>
                  {workspace.name}
                </option>
              ))}
            </Select>

            <Select
              value={status}
              onChange={(event) => {
                setStatus(event.target.value as IncidentStatus | "all");
                setPage(1);
              }}
              aria-label="Status"
            >
              {STATUS_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </Select>

            <Select
              value={range}
              onChange={(event) => {
                setRange(event.target.value);
                setPage(1);
              }}
              aria-label="Period"
            >
              {RANGE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </Select>
          </div>

          <p className="mt-3 flex items-center gap-1.5 text-xs text-ink-faint">
            <Filter className="size-3.5" />
            {filtered.length} error{filtered.length === 1 ? "" : "s"} match the filters
          </p>
        </Card>

        <Card className="overflow-hidden">
          {loading ? (
            <div className="p-5">
              <SkeletonRows rows={6} />
            </div>
          ) : visible.length === 0 ? (
            <div className="p-5">
              <EmptyState
                icon={<Bug className="size-7" />}
                title="No errors to show"
                description={
                  incidents.length === 0
                    ? "Nothing has been reported for your workspaces yet."
                    : "No error matches the current filters. Try to widen them."
                }
                action={
                  <Link to="/incidents/new">
                    <Button size="sm">Report an error</Button>
                  </Link>
                }
              />
            </div>
          ) : (
            <IncidentTable incidents={visible} onSelect={openIncident} />
          )}
        </Card>

        {filtered.length > PAGE_SIZE ? (
          <div className="flex items-center justify-between gap-3">
            <p className="text-xs text-ink-faint">
              Page {currentPage} of {pageCount}
            </p>

            <div className="flex items-center gap-2">
              <Button
                variant="secondary"
                size="sm"
                disabled={currentPage <= 1}
                onClick={() => setPage((value) => Math.max(1, value - 1))}
              >
                <ChevronLeft className="size-4" />
                Previous
              </Button>
              <Button
                variant="secondary"
                size="sm"
                disabled={currentPage >= pageCount}
                onClick={() => setPage((value) => Math.min(pageCount, value + 1))}
              >
                Next
                <ChevronRight className="size-4" />
              </Button>
            </div>
          </div>
        ) : null}
      </div>

      <IncidentDetail incident={selected} onClose={closeIncident} onDelete={removeIncident} />
    </AppShell>
  );
}
