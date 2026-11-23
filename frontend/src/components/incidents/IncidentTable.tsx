import { Cloud, GitBranch, Paperclip } from "lucide-react";
import { StatusBadge, SeverityBadge } from "./StatusBadge";
import { formatRelativeTime } from "@/lib/format";
import type { Incident } from "@/types";

export function IncidentTable({
  incidents,
  onSelect,
}: {
  incidents: Incident[];
  onSelect: (incident: Incident) => void;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[52rem] border-collapse text-left">
        <thead>
          <tr className="border-b border-line text-[11px] tracking-wide text-ink-faint uppercase">
            <th className="px-4 py-3 font-medium">Error</th>
            <th className="px-4 py-3 font-medium">Status</th>
            <th className="px-4 py-3 font-medium">Confidence</th>
            <th className="px-4 py-3 font-medium">Branch</th>
            <th className="px-4 py-3 font-medium">Files</th>
            <th className="px-4 py-3 text-right font-medium">Reported</th>
          </tr>
        </thead>

        <tbody className="divide-y divide-line">
          {incidents.map((incident) => (
            <tr
              key={incident.id}
              onClick={() => onSelect(incident)}
              className="cursor-pointer transition-colors hover:bg-surface-2"
            >
              <td className="max-w-md px-4 py-3">
                <p className="truncate text-sm text-ink">{incident.title}</p>
                <p className="mt-0.5 flex items-center gap-1.5 truncate font-mono text-[11px] text-ink-faint">
                  {incident.source === "CLOUDWATCH" ? (
                    <Cloud className="size-3 shrink-0" />
                  ) : null}
                  {incident.repoDisplayUrl}
                </p>
              </td>

              <td className="px-4 py-3">
                <div className="flex flex-wrap items-center gap-1.5">
                  <StatusBadge status={incident.status} />
                  <SeverityBadge severity={incident.severity} />
                </div>
              </td>

              <td className="px-4 py-3">
                <span className="text-xs text-ink-muted capitalize">
                  {incident.confidence ?? "-"}
                </span>
              </td>

              <td className="px-4 py-3">
                {incident.fixBranch ? (
                  <span className="flex items-center gap-1.5 font-mono text-xs text-brand">
                    <GitBranch className="size-3.5 shrink-0" />
                    <span className="max-w-40 truncate">{incident.fixBranch}</span>
                  </span>
                ) : (
                  <span className="text-xs text-ink-faint">-</span>
                )}
              </td>

              <td className="px-4 py-3">
                {incident.affectedFiles?.length ? (
                  <span className="flex items-center gap-1.5 text-xs text-ink-muted">
                    <Paperclip className="size-3.5 shrink-0 text-ink-faint" />
                    {incident.affectedFiles.length}
                  </span>
                ) : (
                  <span className="text-xs text-ink-faint">-</span>
                )}
              </td>

              <td className="px-4 py-3 text-right text-xs text-ink-faint">
                {formatRelativeTime(incident.createdAt)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {incidents.length === 0 ? (
        <p className="px-4 py-10 text-center text-sm text-ink-faint">
          No error matches the current filters.
        </p>
      ) : null}
    </div>
  );
}
