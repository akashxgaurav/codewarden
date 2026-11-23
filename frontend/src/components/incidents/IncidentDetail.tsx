import {
  ArrowUpRight,
  CheckCircle2,
  FileCode2,
  GitBranch,
  GitCommitHorizontal,
  GitPullRequest,
  History,
  Terminal,
  Trash2,
} from "lucide-react";
import { Drawer } from "@/components/ui/Overlay";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { StatusBadge, ConfidenceBadge, SeverityBadge } from "./StatusBadge";
import { formatDate, formatRelativeTime } from "@/lib/format";
import type { Incident } from "@/types";

export function IncidentDetail({
  incident,
  onClose,
  onDelete,
}: {
  incident: Incident | null;
  onClose: () => void;
  onDelete?: (incident: Incident) => void;
}) {
  return (
    <Drawer
      open={Boolean(incident)}
      onClose={onClose}
      title={incident?.title ?? ""}
      subtitle={
        incident ? (
          <span className="flex flex-wrap items-center gap-2">
            <StatusBadge status={incident.status} />
            <ConfidenceBadge confidence={incident.confidence} />
            <SeverityBadge severity={incident.severity} />
            <span>{formatDate(incident.createdAt)}</span>
          </span>
        ) : null
      }
      footer={
        incident ? (
          <div className="flex flex-wrap items-center justify-between gap-3">
            {incident.fixBranch ? (
              <div className="flex items-center gap-2 text-xs text-ink-muted">
                <GitBranch className="size-3.5 text-brand" />
                <span className="font-mono">{incident.fixBranch}</span>
                {incident.pushed ? (
                  <Badge tone="positive">pushed</Badge>
                ) : (
                  <Badge tone="warning">local only</Badge>
                )}
              </div>
            ) : (
              <span className="text-xs text-ink-faint">No branch was created for this error.</span>
            )}

            <div className="flex items-center gap-2">
              {onDelete ? (
                <Button variant="danger" size="sm" onClick={() => onDelete(incident)}>
                  <Trash2 className="size-3.5" />
                  Remove
                </Button>
              ) : null}

              {incident.prUrl ? (
                <a
                  href={incident.prUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-surface-3 px-3 py-1.5 text-xs font-medium text-ink hover:border-brand hover:text-brand"
                >
                  <GitPullRequest className="size-3.5" />
                  Open PR #{incident.prNumber}
                </a>
              ) : null}

              {incident.fixBranch ? (
                <a
                  href={`${incident.repoDisplayUrl}/tree/${incident.fixBranch}`}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1.5 rounded-lg bg-brand px-3 py-1.5 text-xs font-semibold text-canvas hover:bg-brand-strong"
                >
                  Open branch
                  <ArrowUpRight className="size-3.5" />
                </a>
              ) : null}
            </div>
          </div>
        ) : null
      }
    >
      {incident ? (
        <div className="space-y-6">
          <section className="space-y-2">
            <h3 className="text-xs font-semibold tracking-wide text-ink-faint uppercase">
              Reported error
            </h3>
            <pre className="code-block rounded-lg border border-line bg-surface-2 p-4 text-ink/85">
              {incident.errorMessage || "No error message was captured."}
            </pre>
          </section>

          {incident.rootCause ? (
            <section className="space-y-2">
              <h3 className="text-xs font-semibold tracking-wide text-ink-faint uppercase">
                Root cause
              </h3>
              <p className="text-sm leading-relaxed text-ink-muted">{incident.rootCause}</p>
            </section>
          ) : null}

          {incident.fixPlan ? (
            <section className="space-y-2">
              <h3 className="text-xs font-semibold tracking-wide text-ink-faint uppercase">
                Proposed fix
              </h3>
              <p className="text-sm leading-relaxed text-ink-muted">{incident.fixPlan}</p>
            </section>
          ) : null}

          {incident.validationReason ? (
            <section className="space-y-2">
              <h3 className="text-xs font-semibold tracking-wide text-ink-faint uppercase">
                Validation
              </h3>
              <p className="text-sm leading-relaxed text-ink-muted">{incident.validationReason}</p>
            </section>
          ) : null}

          {incident.regressionTest?.path ? (
            <section className="space-y-2">
              <h3 className="text-xs font-semibold tracking-wide text-ink-faint uppercase">
                Regression test
              </h3>
              <div className="rounded-lg border border-line bg-surface-2 p-4">
                <p className="flex items-center gap-2 font-mono text-xs text-brand">
                  <Terminal className="size-3.5" />
                  {incident.regressionTest.path}
                </p>
                {incident.regressionTest.description ? (
                  <p className="mt-2 text-xs leading-relaxed text-ink-muted">
                    {incident.regressionTest.description}
                  </p>
                ) : null}
              </div>
            </section>
          ) : null}

          {incident.affectedFiles?.length ? (
            <section className="space-y-2">
              <h3 className="text-xs font-semibold tracking-wide text-ink-faint uppercase">
                Changed files
              </h3>
              <ul className="space-y-1.5">
                {incident.affectedFiles.map((file) => (
                  <li key={file} className="flex items-center gap-2 font-mono text-xs text-ink-muted">
                    <FileCode2 className="size-3.5 shrink-0 text-ink-faint" />
                    {file}
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          {incident.steps?.length ? (
            <section className="space-y-2">
              <h3 className="text-xs font-semibold tracking-wide text-ink-faint uppercase">
                Validation steps
              </h3>
              <ol className="space-y-1.5">
                {incident.steps.map((step, index) => (
                  <li key={`${step}-${index}`} className="flex gap-2.5 text-xs text-ink-muted">
                    <CheckCircle2 className="mt-0.5 size-3.5 shrink-0 text-positive" />
                    {step}
                  </li>
                ))}
              </ol>
            </section>
          ) : null}

          <section className="space-y-2">
            <h3 className="text-xs font-semibold tracking-wide text-ink-faint uppercase">
              Details
            </h3>
            <dl className="divide-y divide-line rounded-lg border border-line bg-surface-2 text-xs">
              <div className="flex items-center justify-between gap-4 px-4 py-2.5">
                <dt className="text-ink-faint">Repository</dt>
                <dd className="truncate font-mono text-ink-muted">{incident.repoDisplayUrl}</dd>
              </div>
              <div className="flex items-center justify-between gap-4 px-4 py-2.5">
                <dt className="text-ink-faint">Branch</dt>
                <dd className="font-mono text-ink-muted">{incident.branch}</dd>
              </div>
              <div className="flex items-center justify-between gap-4 px-4 py-2.5">
                <dt className="text-ink-faint">Source</dt>
                <dd className="text-ink-muted">{incident.source}</dd>
              </div>
              <div className="flex items-center justify-between gap-4 px-4 py-2.5">
                <dt className="text-ink-faint">Reported</dt>
                <dd className="text-ink-muted">{formatRelativeTime(incident.createdAt)}</dd>
              </div>
              {incident.commit ? (
                <div className="flex items-center justify-between gap-4 px-4 py-2.5">
                  <dt className="text-ink-faint">Commit</dt>
                  <dd className="flex items-center gap-1.5 font-mono text-ink-muted">
                    <GitCommitHorizontal className="size-3.5" />
                    {incident.commit.slice(0, 7)}
                  </dd>
                </div>
              ) : null}
              {incident.priorsUsed ? (
                <div className="flex items-center justify-between gap-4 px-4 py-2.5">
                  <dt className="text-ink-faint">Prior incidents used</dt>
                  <dd className="flex items-center gap-1.5 text-ink-muted">
                    <History className="size-3.5" />
                    {incident.priorsUsed}
                  </dd>
                </div>
              ) : null}
            </dl>
          </section>
        </div>
      ) : null}
    </Drawer>
  );
}
