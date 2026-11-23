import { Badge } from "@/components/ui/Badge";
import { cn } from "@/lib/cn";
import type { IncidentStatus } from "@/types";

type Tone = "neutral" | "brand" | "positive" | "warning" | "critical";

const STATUS_TONE: Record<IncidentStatus, Tone> = {
  fixed: "positive",
  not_fixable: "warning",
  validation_failed: "critical",
  no_diagnosis: "neutral",
  pending: "brand",
  running: "brand",
  failed: "critical",
};

const STATUS_LABEL: Record<IncidentStatus, string> = {
  fixed: "Fixed",
  not_fixable: "Not fixable",
  validation_failed: "Validation failed",
  no_diagnosis: "No diagnosis",
  pending: "In progress",
  running: "Running",
  failed: "Failed",
};

export function StatusBadge({
  status,
  className,
}: {
  status: IncidentStatus;
  className?: string;
}) {
  return (
    <Badge tone={STATUS_TONE[status] ?? "neutral"} className={className}>
      {STATUS_LABEL[status] ?? status}
    </Badge>
  );
}

export function ConfidenceBadge({ confidence }: { confidence: string | null }) {
  if (!confidence) {
    return null;
  }

  const tone: Tone =
    confidence === "high" ? "positive" : confidence === "medium" ? "warning" : "neutral";

  return (
    <Badge tone={tone} className="capitalize">
      {confidence} confidence
    </Badge>
  );
}

const SEVERITY_TONE: Record<string, Tone> = {
  CRITICAL: "critical",
  HIGH: "critical",
  MEDIUM: "warning",
  LOW: "neutral",
  INFO: "neutral",
};

/**
 * The severity of an error.
 *
 * The CloudWatch path reads it from the log level, the manual path leaves it
 * unknown because a pasted stack trace does not carry one.
 */
export function SeverityBadge({
  severity,
  className,
}: {
  severity: string | null;
  className?: string;
}) {
  if (!severity || severity === "UNKNOWN") {
    return null;
  }

  return (
    <Badge tone={SEVERITY_TONE[severity] ?? "neutral"} className={cn("uppercase", className)}>
      {severity}
    </Badge>
  );
}
