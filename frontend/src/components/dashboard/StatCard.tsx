import type { ReactNode } from "react";
import { TrendingDown, TrendingUp, Minus } from "lucide-react";
import { cn } from "@/lib/cn";

export function StatCard({
  label,
  value,
  hint,
  delta,
  deltaLabel,
  invertDelta = false,
  icon,
  tone = "neutral",
}: {
  label: string;
  value: ReactNode;
  hint?: string;
  /** Change compared with the previous period. */
  delta?: number;
  deltaLabel?: string;
  /** True when a lower number is the good outcome. */
  invertDelta?: boolean;
  icon?: ReactNode;
  tone?: "neutral" | "brand" | "positive" | "warning" | "critical";
}) {
  const hasDelta = typeof delta === "number" && delta !== 0;
  const isGood = hasDelta ? (invertDelta ? (delta as number) < 0 : (delta as number) > 0) : true;

  const toneClasses: Record<string, string> = {
    neutral: "text-ink",
    brand: "text-brand",
    positive: "text-positive",
    warning: "text-warning",
    critical: "text-critical",
  };

  const DeltaIcon = !hasDelta ? Minus : (delta as number) > 0 ? TrendingUp : TrendingDown;

  return (
    <div className="rounded-xl border border-line bg-surface p-4">
      <div className="flex items-start justify-between gap-3">
        <p className="text-xs font-medium text-ink-muted">{label}</p>
        {icon ? <span className={cn("shrink-0", toneClasses[tone])}>{icon}</span> : null}
      </div>

      <p className={cn("mt-2 text-2xl font-semibold tracking-tight", toneClasses[tone])}>{value}</p>

      <div className="mt-1.5 flex items-center gap-1.5 text-[11px]">
        {typeof delta === "number" ? (
          <span
            className={cn(
              "inline-flex items-center gap-0.5 font-medium",
              isGood ? "text-positive" : "text-critical",
            )}
          >
            <DeltaIcon className="size-3" />
            {Math.abs(delta)}
            {typeof delta === "number" && Number.isInteger(delta) ? "" : "%"}
          </span>
        ) : null}

        {deltaLabel ? <span className="text-ink-faint">{deltaLabel}</span> : null}
        {hint && !deltaLabel ? <span className="text-ink-faint">{hint}</span> : null}
      </div>
    </div>
  );
}
